begin;

-- Métricas de candidatos en una sola consulta desde la Edge Function.
-- Se reciben sus pares de idiomas para contar también lexicards históricas sin idioma.
create or replace function public.ica_challenge_directory_metrics(
  p_current_user_id uuid,
  p_candidate_ids uuid[],
  p_language_pairs jsonb
)
returns table (
  user_id uuid,
  word_count bigint,
  active_challenges_count bigint,
  has_active_pair boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select distinct candidate_id as user_id
    from unnest(coalesce(p_candidate_ids, '{}'::uuid[])) as ids(candidate_id)
  ),
  pairs as (
    select pair.user_id, pair.target_lang, pair.native_lang
    from jsonb_to_recordset(coalesce(p_language_pairs, '[]'::jsonb))
      as pair(user_id uuid, target_lang text, native_lang text)
  ),
  scoped_words as (
    select pair.user_id, count(*)::bigint as word_count
    from pairs pair
    join public.lexicards card
      on card.user_id = pair.user_id
     and card.target_lang = pair.target_lang
     and card.native_lang = pair.native_lang
    group by pair.user_id
  ),
  legacy_words as (
    select pair.user_id, count(*)::bigint as word_count
    from pairs pair
    join public.lexicards card
      on card.user_id = pair.user_id
     and card.target_lang is null
     and card.native_lang is null
    group by pair.user_id
  ),
  active_counts as (
    select participant.user_id, count(distinct challenge.id)::bigint as active_count
    from public.ica_challenges challenge
    cross join lateral (
      values (challenge.challenger_user_id), (challenge.challenged_user_id)
    ) as participant(user_id)
    join candidates candidate on candidate.user_id = participant.user_id
    where challenge.status in ('created', 'in_progress')
    group by participant.user_id
  )
  select
    candidate.user_id,
    coalesce(scoped.word_count, legacy.word_count, 0)::bigint,
    coalesce(active.active_count, 0)::bigint,
    exists (
      select 1
      from public.ica_challenges challenge
      where challenge.status in ('created', 'in_progress')
        and candidate.user_id <> p_current_user_id
        and (
          (challenge.challenger_user_id = p_current_user_id and challenge.challenged_user_id = candidate.user_id)
          or
          (challenge.challenger_user_id = candidate.user_id and challenge.challenged_user_id = p_current_user_id)
        )
    )
  from candidates candidate
  left join scoped_words scoped on scoped.user_id = candidate.user_id
  left join legacy_words legacy on legacy.user_id = candidate.user_id
  left join active_counts active on active.user_id = candidate.user_id;
$$;

revoke all on function public.ica_challenge_directory_metrics(uuid, uuid[], jsonb)
  from public, anon, authenticated;
grant execute on function public.ica_challenge_directory_metrics(uuid, uuid[], jsonb)
  to service_role;

-- Mantiene el desempate por tiempo de Parejas también cuando vence un turno.
create or replace function public.process_ica_challenge_turn_timeouts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.ica_challenges%rowtype;
  challenger_score integer;
  challenged_score integer;
  challenger_elapsed bigint;
  challenged_elapsed bigint;
  challenger_answered integer;
  challenged_answered integer;
  timeout_penalty bigint;
  total_questions integer;
  seconds_per_board bigint;
  timed_out_user_id uuid;
  next_turn_user_id uuid;
  affected integer := 0;
  result_type_value text;
  winner_user_id_value uuid;
  is_pairs_mode boolean;
begin
  for challenge_row in
    select c.*
    from public.ica_challenges c
    where c.status = 'in_progress'
      and c.turn_user_id is not null
      and c.turn_expires_at is not null
      and c.turn_expires_at <= now()
    for update skip locked
  loop
    select
      comp.score,
      case
        when comp.payload #>> '{game,answered}' ~ '^[0-9]+$'
          then (comp.payload #>> '{game,answered}')::integer
        else 0
      end
    into challenger_score, challenger_answered
    from public.ica_challenge_competitors comp
    where comp.challenge_id = challenge_row.id
      and comp.user_id = challenge_row.challenger_user_id;

    select
      comp.score,
      case
        when comp.payload #>> '{game,answered}' ~ '^[0-9]+$'
          then (comp.payload #>> '{game,answered}')::integer
        else 0
      end
    into challenged_score, challenged_answered
    from public.ica_challenge_competitors comp
    where comp.challenge_id = challenge_row.id
      and comp.user_id = challenge_row.challenged_user_id;

    timed_out_user_id := challenge_row.turn_user_id;
    next_turn_user_id := case
      when timed_out_user_id = challenge_row.challenger_user_id then challenge_row.challenged_user_id
      else challenge_row.challenger_user_id
    end;

    if challenger_score is not null and challenged_score is not null then
      is_pairs_mode := challenge_row.challenge_slug = 'ica-pairs'
        or challenge_row.game_metadata ->> 'kind' = 'pairs';

      if is_pairs_mode then
        total_questions := coalesce((challenge_row.game_metadata ->> 'totalQuestions')::integer, 10);
        seconds_per_board := coalesce((challenge_row.game_metadata ->> 'secondsPerQuestion')::bigint, 40);

        select coalesce(sum(board.elapsed_ms), 0)::bigint
        into challenger_elapsed
        from (
          select max(play.ms)::bigint as elapsed_ms
          from public.desafio_jugadas play
          where play.desafio_id = challenge_row.id
            and play.usuario_id = challenge_row.challenger_user_id
          group by floor(play.indice::numeric / 5)
        ) board;

        select coalesce(sum(board.elapsed_ms), 0)::bigint
        into challenged_elapsed
        from (
          select max(play.ms)::bigint as elapsed_ms
          from public.desafio_jugadas play
          where play.desafio_id = challenge_row.id
            and play.usuario_id = challenge_row.challenged_user_id
          group by floor(play.indice::numeric / 5)
        ) board;

        -- Si vence el turno antes de completar todos los tableros, no se premia
        -- al jugador por haber dejado preguntas sin jugar: cada tablero pendiente
        -- suma el límite completo al tiempo de desempate.
        timeout_penalty := ceil(
          greatest(
            0,
            total_questions - case
              when timed_out_user_id = challenge_row.challenger_user_id then challenger_answered
              else challenged_answered
            end
          )::numeric / 5
        )::bigint * seconds_per_board * 1000;
        if timed_out_user_id = challenge_row.challenger_user_id then
          challenger_elapsed := challenger_elapsed + timeout_penalty;
        else
          challenged_elapsed := challenged_elapsed + timeout_penalty;
        end if;
      end if;

      result_type_value := case
        when challenger_score > challenged_score then 'challenger_win'
        when challenged_score > challenger_score then 'challenged_win'
        when is_pairs_mode and challenger_elapsed < challenged_elapsed then 'challenger_win'
        when is_pairs_mode and challenged_elapsed < challenger_elapsed then 'challenged_win'
        else 'draw'
      end;

      winner_user_id_value := case
        when result_type_value = 'challenger_win' then challenge_row.challenger_user_id
        when result_type_value = 'challenged_win' then challenge_row.challenged_user_id
        else null
      end;

      update public.ica_challenges c
      set
        status = 'completed',
        result_type = result_type_value,
        winner_user_id = winner_user_id_value,
        finalized_at = coalesce(c.finalized_at, now()),
        turn_user_id = null,
        turn_expires_at = null,
        updated_at = now()
      where c.id = challenge_row.id;

      affected := affected + 1;
      continue;
    end if;

    if timed_out_user_id = challenge_row.challenger_user_id
      and challenger_score is null
      and challenged_score is not null then
      update public.ica_challenges c
      set
        status = 'completed',
        result_type = 'challenged_win',
        winner_user_id = challenge_row.challenged_user_id,
        finalized_at = coalesce(c.finalized_at, now()),
        turn_user_id = null,
        turn_expires_at = null,
        updated_at = now()
      where c.id = challenge_row.id;

      affected := affected + 1;
      continue;
    end if;

    if timed_out_user_id = challenge_row.challenged_user_id
      and challenged_score is null
      and challenger_score is not null then
      update public.ica_challenges c
      set
        status = 'completed',
        result_type = 'challenger_win',
        winner_user_id = challenge_row.challenger_user_id,
        finalized_at = coalesce(c.finalized_at, now()),
        turn_user_id = null,
        turn_expires_at = null,
        updated_at = now()
      where c.id = challenge_row.id;

      affected := affected + 1;
      continue;
    end if;

    update public.ica_challenges c
    set
      turn_user_id = next_turn_user_id,
      turn_expires_at = now() + interval '10 hours',
      updated_at = now()
    where c.id = challenge_row.id;

    affected := affected + 1;
  end loop;

  return affected;
end;
$$;

commit;
