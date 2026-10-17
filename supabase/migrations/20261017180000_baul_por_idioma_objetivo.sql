-- BAÚL ICA POR IDIOMA OBJETIVO (Luis, 17 Oct). Página para Nahuel: «Baúl ICA por idioma objetivo».
-- Antes, casi todo se buscaba por la PAREJA de idiomas (objetivo + materno): si un alumno cambiaba
-- su idioma materno, la app le escondía palabras, frases, notas maestras, nivel, PreguntICA…
-- Ahora todo lo del alumno se busca por usuario + IDIOMA OBJETIVO. El materno solo sirve para crear
-- cosas nuevas (cada fila sigue guardando el suyo en native_lang, que no se toca).
--
-- 1) Se unen las filas repetidas (mismo alumno y objetivo, distinto materno).
-- 2) Claves nuevas sin materno. Las antiguas (con materno) se dejan, para que una versión vieja de
--    la app que hace upsert con «…,native_lang» siga funcionando mientras se actualiza.
-- 3) Las funciones dejan de filtrar por materno. Mismas firmas: p_native_lang se sigue recibiendo.
-- Los límites del día (ica_daily_limit_usage) ya eran por alumno y día, sin idioma: no cambian.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1) Unir filas repetidas
-- ---------------------------------------------------------------------------------------------

-- Nivel: se queda la fila confirmada más antigua (o la más antigua). Las activaciones se recalculan
-- al final, ya por idioma objetivo.
create temporary table _baul_tracker_merged on commit drop as
select user_id, lower(trim(target_lang)) as target_key
from public.user_meta_tracker
group by 1, 2
having count(*) > 1;

with ranked as (
  select umt.ctid as row_ctid,
    row_number() over (
      partition by umt.user_id, lower(trim(umt.target_lang))
      order by (umt.confirmed_at is null), umt.confirmed_at, umt.created_at
    ) as position
  from public.user_meta_tracker umt
  join _baul_tracker_merged m on m.user_id = umt.user_id and m.target_key = lower(trim(umt.target_lang))
)
delete from public.user_meta_tracker umt
using ranked
where umt.ctid = ranked.row_ctid and ranked.position > 1;

-- PreguntICA: se queda la semana con más intentos (y si no, la desbloqueada o con más palabras).
-- Los intentos y desbloqueos de las otras pasan a la que se queda (en producción, ninguna tiene
-- intentos en dos maternos; si chocara un número de intento, la migración se para).
create temporary table _baul_week_map on commit drop as
with stats as (
  select pw.id, pw.user_id, pw.week_start, lower(trim(pw.target_lang)) as target_key,
    (select count(*) from public.preguntica_attempts pa where pa.preguntica_week_id = pw.id) as attempts,
    (select count(*) from public.preguntica_week_token_unlocks u where u.preguntica_week_id = pw.id) as unlocks,
    pw.completed_at, pw.is_unlocked, pw.activation_words_count, pw.created_at
  from public.preguntica_weeks pw
),
ranked as (
  select stats.*,
    row_number() over (
      partition by user_id, week_start, target_key
      order by attempts desc, unlocks desc, (completed_at is null), is_unlocked desc,
        activation_words_count desc, created_at
    ) as position,
    count(*) over (partition by user_id, week_start, target_key) as copies
  from stats
)
select loser.id as old_id, keeper.id as keep_id
from ranked loser
join ranked keeper
  on keeper.user_id = loser.user_id and keeper.week_start = loser.week_start
 and keeper.target_key = loser.target_key and keeper.position = 1
where loser.copies > 1 and loser.position > 1;

update public.preguntica_attempts pa set preguntica_week_id = m.keep_id
from _baul_week_map m where pa.preguntica_week_id = m.old_id;
update public.preguntica_week_token_unlocks u set preguntica_week_id = m.keep_id
from _baul_week_map m where u.preguntica_week_id = m.old_id;
delete from public.preguntica_weeks pw using _baul_week_map m where pw.id = m.old_id;

-- Test ICA del mes (y su tabla de pruebas): se queda el terminado con mejor nota, o el primero.
delete from public.ica_tests t
using (
  select id, row_number() over (
    partition by user_id, lower(trim(target_lang)), test_month
    order by (completed_at is null), score desc, created_at
  ) as position
  from public.ica_tests
) ranked
where t.id = ranked.id and ranked.position > 1;

delete from public.ica_tests_dev t
using (
  select id, row_number() over (
    partition by user_id, lower(trim(target_lang)), test_month
    order by (completed_at is null), score desc, created_at
  ) as position
  from public.ica_tests_dev
) ranked
where t.id = ranked.id and ranked.position > 1;

-- Trackers de Comunidad: se queda el último guardado.
delete from public.improvement_trackers t
using (
  select id, row_number() over (
    partition by user_id, lower(trim(target_lang)), tracker_month order by updated_at desc, created_at desc
  ) as position
  from public.improvement_trackers
) ranked
where t.id = ranked.id and ranked.position > 1;

delete from public.instagram_track_posts t
using (
  select id, row_number() over (
    partition by user_id, lower(trim(target_lang)), track_month, day_index
    order by (post_url is null), updated_at desc, created_at desc
  ) as position
  from public.instagram_track_posts
) ranked
where t.id = ranked.id and ranked.position > 1;

-- Escucha de notas maestras: los segundos de un mismo día se suman en una sola fila.
with grouped as (
  select user_id, day, lower(trim(target_lang)) as target_key,
    min(ctid::text) as keep_ctid, sum(listened_seconds)::integer as total
  from public.master_note_listening_daily_metrics
  group by 1, 2, 3
  having count(*) > 1
),
kept as (
  update public.master_note_listening_daily_metrics m
  set listened_seconds = g.total, updated_at = now()
  from grouped g
  where m.ctid::text = g.keep_ctid
  returning m.user_id, m.day, lower(trim(m.target_lang)) as target_key, m.ctid::text as kept_ctid
)
delete from public.master_note_listening_daily_metrics m
using kept
where m.user_id = kept.user_id and m.day = kept.day
  and lower(trim(m.target_lang)) = kept.target_key and m.ctid::text <> kept.kept_ctid;

-- Inscripción en Desafíos ICA: se queda la activa más reciente.
delete from public.users_ica_challenges t
using (
  select id, row_number() over (
    partition by user_id, lower(trim(target_lang)) order by is_active desc, updated_at desc
  ) as position
  from public.users_ica_challenges
) ranked
where t.id = ranked.id and ranked.position > 1;

-- ---------------------------------------------------------------------------------------------
-- 2) Claves sin materno (las antiguas se quedan como único extra, por compatibilidad)
-- ---------------------------------------------------------------------------------------------

alter table public.user_meta_tracker drop constraint user_meta_tracker_pkey;
alter table public.user_meta_tracker add constraint user_meta_tracker_pkey primary key (user_id, target_lang);
alter table public.user_meta_tracker
  add constraint user_meta_tracker_user_target_native_key unique (user_id, target_lang, native_lang);

alter table public.preguntica_weeks
  add constraint preguntica_weeks_user_week_target_key unique (user_id, week_start, target_lang);

create unique index ica_tests_unique_user_month_target_idx
  on public.ica_tests (user_id, target_lang, test_month);
create unique index ica_tests_dev_unique_user_month_target_idx
  on public.ica_tests_dev (user_id, target_lang, test_month);

alter table public.improvement_trackers
  add constraint improvement_trackers_unique_target_month unique (user_id, target_lang, tracker_month);

alter table public.instagram_track_posts
  add constraint instagram_track_posts_unique_target_day unique (user_id, target_lang, track_month, day_index);

alter table public.master_note_listening_daily_metrics drop constraint master_note_listening_daily_metrics_pkey;
alter table public.master_note_listening_daily_metrics
  add constraint master_note_listening_daily_metrics_pkey primary key (user_id, day, target_lang);
alter table public.master_note_listening_daily_metrics
  add constraint master_note_listening_daily_metrics_user_day_pair_key unique (user_id, day, target_lang, native_lang);

alter table public.users_ica_challenges
  add constraint users_ica_challenges_unique_target unique (user_id, target_lang);

-- ---------------------------------------------------------------------------------------------
-- 3) Funciones: sin filtrar por materno (mismas firmas y permisos)
-- ---------------------------------------------------------------------------------------------
-- record_phrase_generation_event
CREATE OR REPLACE FUNCTION public.record_phrase_generation_event(p_word_ids uuid[], p_phrase text, p_translation text, p_target_lang text, p_native_lang text, p_source text DEFAULT 'generated'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  phrase_id uuid := gen_random_uuid();
  source_ids uuid[];
  source_words text[];
  source_v2 jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_source not in ('generated', 'manual') then raise exception 'PHRASE_SOURCE_INVALID'; end if;
  if nullif(trim(coalesce(p_phrase, '')), '') is null then raise exception 'PHRASE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_target_lang, '')), '') is null
    or nullif(trim(coalesce(p_native_lang, '')), '') is null then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;
  if coalesce(array_length(p_word_ids, 1), 0) < 1 or array_length(p_word_ids, 1) > 10 then
    raise exception 'PHRASE_WORD_COUNT_INVALID';
  end if;

  select array_agg(l.id order by input.ordinality),
         array_agg(l.target order by input.ordinality),
         jsonb_agg(jsonb_build_object('lexicard_id', l.id, 'word', l.target) order by input.ordinality)
  into source_ids, source_words, source_v2
  from unnest(p_word_ids) with ordinality as input(id, ordinality)
  join public.lexicards l on l.id = input.id and l.user_id = v_user_id
  -- Words saved with another native language are yours too (Baúl ICA por idioma objetivo).
  where lower(trim(coalesce(l.target_lang, ''))) = lower(trim(p_target_lang));

  if coalesce(array_length(source_ids, 1), 0) <> array_length(p_word_ids, 1) then
    raise exception 'PHRASE_WORDS_NOT_OWNED';
  end if;

  insert into public.phrase_generations (
    id, user_id, source_words, source_words_v2, generated_phrase, translation,
    model, success, target_lang, native_lang
  ) values (
    phrase_id, v_user_id, source_words, source_v2, trim(p_phrase), p_translation,
    case when p_source = 'manual' then 'manual' else 'generated' end,
    true, trim(p_target_lang), trim(p_native_lang)
  );
  return phrase_id;
end;
$function$
;

-- register_phrase_lexicard_activations
CREATE OR REPLACE FUNCTION public.register_phrase_lexicard_activations(p_phrase_generation_id uuid, p_lexicard_ids uuid[], p_target_lang text, p_native_lang text)
 RETURNS TABLE(activation_words_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  phrase_exists boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_phrase_generation_id is null then
    raise exception 'PHRASE_REQUIRED';
  end if;

  select exists (
    select 1
    from public.phrase_generations pg
    where pg.id = p_phrase_generation_id
      and pg.user_id = current_user_id
  )
  into phrase_exists;

  if not phrase_exists then
    raise exception 'PHRASE_NOT_FOUND';
  end if;

  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  valid as (
    select
      l.id as lexicard_id,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where lower(trim(coalesce(l.target_lang, p_target_lang, ''))) = lower(trim(coalesce(p_target_lang, '')))
  )
  insert into public.phrase_lexicard_activations (
    user_id,
    phrase_generation_id,
    lexicard_id,
    target_lang,
    native_lang,
    uses_count
  )
  select
    current_user_id,
    p_phrase_generation_id,
    v.lexicard_id,
    trim(coalesce(p_target_lang, '')),
    trim(coalesce(p_native_lang, '')),
    v.uses
  from valid v
  on conflict (phrase_generation_id, lexicard_id)
  do update set
    uses_count = excluded.uses_count,
    target_lang = excluded.target_lang,
    native_lang = excluded.native_lang,
    updated_at = now();

  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  valid as (
    select
      l.id as lexicard_id,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where lower(trim(coalesce(l.target_lang, p_target_lang, ''))) = lower(trim(coalesce(p_target_lang, '')))
  )
  delete from public.phrase_lexicard_activations pla
  where pla.user_id = current_user_id
    and pla.phrase_generation_id = p_phrase_generation_id
    and lower(trim(pla.target_lang)) = lower(trim(coalesce(p_target_lang, '')))
    and not exists (
      select 1
      from valid v
      where v.lexicard_id = pla.lexicard_id
    );

  return query
  select *
  from public.recompute_lexicard_activation_metrics_for_user_lang(
    current_user_id,
    trim(coalesce(p_target_lang, '')),
    trim(coalesce(p_native_lang, ''))
  );
end;
$function$
;

-- register_lexicard_activations
CREATE OR REPLACE FUNCTION public.register_lexicard_activations(p_lexicard_ids uuid[], p_target_lang text, p_native_lang text)
 RETURNS TABLE(activation_words_total integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  valid as (
    select
      l.id as lexicard_id,
      l.activation_count as previous_count,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where lower(trim(coalesce(l.target_lang, p_target_lang, ''))) = lower(trim(coalesce(p_target_lang, '')))
  ),
  updated as (
    update public.lexicards l
    set
      activation_count = l.activation_count + v.uses,
      first_activated_at = coalesce(l.first_activated_at, now()),
      last_activated_at = now()
    from valid v
    where l.id = v.lexicard_id
      and l.user_id = current_user_id
    returning
      case when v.previous_count = 0 and v.uses > 0 then 1 else 0 end as newly_activated
  ),
  delta as (
    select coalesce(sum(updated.newly_activated), 0)::integer as amount
    from updated
  ),
  upsert_tracker as (
    insert into public.user_meta_tracker (
      user_id,
      target_lang,
      native_lang,
      activation_words_total
    )
    values (
      current_user_id,
      p_target_lang,
      p_native_lang,
      (select delta.amount from delta)
    )
    on conflict (user_id, target_lang)
    do update set
      activation_words_total =
        public.user_meta_tracker.activation_words_total + excluded.activation_words_total
    returning public.user_meta_tracker.activation_words_total as tracker_total
  )
  select upsert_tracker.tracker_total as activation_words_total
  from upsert_tracker;
end;
$function$
;

-- recompute_lexicard_activation_metrics_for_user_lang
CREATE OR REPLACE FUNCTION public.recompute_lexicard_activation_metrics_for_user_lang(p_user_id uuid, p_target_lang text, p_native_lang text)
 RETURNS TABLE(activation_words_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_lang_norm text;
  native_lang_norm text;
  active_words integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  target_lang_norm := trim(coalesce(p_target_lang, ''));
  native_lang_norm := trim(coalesce(p_native_lang, ''));

  if target_lang_norm = '' or native_lang_norm = '' then
    raise exception 'LANG_REQUIRED';
  end if;

  with aggregated as (
    select
      pla.lexicard_id,
      sum(pla.uses_count)::integer as total_uses,
      min(pla.created_at) as first_activated_at,
      max(pla.created_at) as last_activated_at
    from public.phrase_lexicard_activations pla
    where pla.user_id = p_user_id
      and lower(trim(pla.target_lang)) = lower(target_lang_norm)
    group by pla.lexicard_id
  )
  update public.lexicards l
  set
    activation_count = coalesce((select a.total_uses from aggregated a where a.lexicard_id = l.id), 0),
    first_activated_at = (select a.first_activated_at from aggregated a where a.lexicard_id = l.id),
    last_activated_at = (select a.last_activated_at from aggregated a where a.lexicard_id = l.id)
  where l.user_id = p_user_id
    and lower(trim(coalesce(l.target_lang, ''))) = lower(target_lang_norm);

  select count(*)::integer
  into active_words
  from public.lexicards l
  where l.user_id = p_user_id
    and lower(trim(coalesce(l.target_lang, ''))) = lower(target_lang_norm)
    and coalesce(l.activation_count, 0) > 0;

  update public.user_meta_tracker umt
  set activation_words_total = active_words
  where umt.user_id = p_user_id
    and lower(trim(umt.target_lang)) = lower(target_lang_norm);

  if not found and active_words > 0 then
    insert into public.user_meta_tracker (
      user_id,
      target_lang,
      native_lang,
      activation_words_total
    )
    values (
      p_user_id,
      target_lang_norm,
      native_lang_norm,
      active_words
    )
    on conflict (user_id, target_lang)
    do update set
      activation_words_total = excluded.activation_words_total;
  end if;

  return query select active_words;
end;
$function$
;

-- record_review_event
CREATE OR REPLACE FUNCTION public.record_review_event(p_lexicard_id uuid, p_knew boolean, p_response_time_ms integer DEFAULT NULL::integer)
 RETURNS TABLE(review_day date, correct_reviews integer, review_goal_completed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  day_start timestamptz;
  day_end timestamptz;
  timezone_name text;
  card_row public.lexicards%rowtype;
  activated_words integer;
  correct_count integer;
  xp_points integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_lexicard_id is null or p_knew is null then raise exception 'REVIEW_EVENT_INVALID'; end if;
  if p_response_time_ms is not null and p_response_time_ms < 0 then raise exception 'REVIEW_RESPONSE_TIME_INVALID'; end if;

  select l.* into card_row
  from public.lexicards l
  where l.id = p_lexicard_id and l.user_id = v_user_id;
  if not found then raise exception 'LEXICARD_NOT_FOUND'; end if;

  select count(distinct pla.lexicard_id)::integer into activated_words
  from public.phrase_lexicard_activations pla
  join public.lexicards l on l.id = pla.lexicard_id
  where pla.user_id = v_user_id
    and lower(trim(pla.target_lang)) = lower(trim(coalesce(card_row.target_lang, '')));
  -- Students who already played flashcards keep them (Luis, 12 Oct, launch): the 20 activated
  -- words only apply to those who never reviewed a word. Same rule as the app (useActivatedWords).
  if coalesce(activated_words, 0) < 20
     and not exists (select 1 from public.lexicard_reviews lr0 where lr0.user_id = v_user_id) then
    raise exception 'FLASHCARDS_LOCKED_20_ACTIVATED_WORDS';
  end if;

  local_day := public.ica_local_today(v_user_id);
  select coalesce(tzn.name, 'UTC') into timezone_name
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = v_user_id;
  timezone_name := coalesce(timezone_name, 'UTC');
  day_start := local_day::timestamp at time zone timezone_name;
  day_end := (local_day + 1)::timestamp at time zone timezone_name;

  perform pg_advisory_xact_lock(hashtextextended('ica-review-day:' || v_user_id::text || ':' || local_day::text, 0));
  insert into public.lexicard_reviews (
    user_id, lexicard_id, knew, response_time_ms, reviewed_at, created_at
  ) values (
    v_user_id, card_row.id, p_knew, p_response_time_ms, now(), now()
  );

  select count(*) filter (where lr.knew)::integer into correct_count
  from public.lexicard_reviews lr
  where lr.user_id = v_user_id and lr.reviewed_at >= day_start and lr.reviewed_at < day_end;
  xp_points := case when p_knew then 10 else 2 end;

  insert into public.daily_metrics (user_id, day, correct_reviews, xp_earned)
  values (v_user_id, local_day, coalesce(correct_count, 0), xp_points)
  on conflict (user_id, day) do update
  set correct_reviews = greatest(public.daily_metrics.correct_reviews, excluded.correct_reviews),
      xp_earned = public.daily_metrics.xp_earned + xp_points;

  insert into public.goal_completions (user_id, day, goal_type, completed, progress_value, target_value)
  select v_user_id, local_day, 'review_goal', dm.review_goal_completed, dm.correct_reviews, 10
  from public.daily_metrics dm
  where dm.user_id = v_user_id and dm.day = local_day
  on conflict (user_id, day, goal_type) do update
  set completed = excluded.completed,
      progress_value = excluded.progress_value,
      target_value = excluded.target_value,
      updated_at = now();

  insert into public.xp_events (user_id, source, points, metadata)
  values (
    v_user_id,
    case when p_knew then 'review_correct' else 'review_incorrect' end,
    xp_points,
    jsonb_build_object('lexicard_id', card_row.id, 'importance', card_row.importance)
  );

  return query
  select local_day, dm.correct_reviews, dm.review_goal_completed
  from public.daily_metrics dm where dm.user_id = v_user_id and dm.day = local_day;
end;
$function$
;

-- get_my_preguntica_week_status
CREATE OR REPLACE FUNCTION public.get_my_preguntica_week_status(p_reference timestamp with time zone DEFAULT now(), p_target_lang text DEFAULT NULL::text, p_native_lang text DEFAULT NULL::text)
 RETURNS TABLE(week_id uuid, week_start date, week_end date, timezone text, required_activation_words integer, activation_words_count integer, is_unlocked boolean, unlocked_via text, unlocked_at timestamp with time zone, completed_at timestamp with time zone, attempts_used integer, token_unlocks_used integer, can_start boolean, is_closed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  current_user_id uuid;
  tz text;
  today_local date;
  current_week_start date;
  current_week_end date;
  current_week_start_utc timestamptz;
  current_week_end_utc timestamptz;
  current_progress_count integer;
  progress_unlock boolean;
  v_week_id uuid;
  lang_target text;
  lang_native text;
  week_closed boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(tzn.name, 'UTC')
  into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = current_user_id;

  select
    lower(trim(coalesce(p_target_lang, us.target_lang, ''))),
    lower(trim(coalesce(p_native_lang, us.native_lang, '')))
  into lang_target, lang_native
  from public.user_settings us
  where us.user_id = current_user_id;

  if coalesce(lang_target, '') = '' or coalesce(lang_native, '') = '' then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;

  tz := coalesce(tz, 'UTC');
  today_local := (coalesce(p_reference, now()) at time zone tz)::date;
  select w.week_start, w.week_end, w.is_closed
  into current_week_start, current_week_end, week_closed
  from public.preguntica_week_for_day(today_local) w;

  -- Days 29-31: no PreguntICA (the month's ranking has closed). Nothing is created; the row
  -- says when the next one opens (week 1 of next month).
  if week_closed then
    return query
    select
      null::uuid,
      current_week_start,
      current_week_end,
      tz,
      20,
      0,
      false,
      null::text,
      null::timestamptz,
      null::timestamptz,
      0,
      0,
      false,
      true;
    return;
  end if;

  current_week_start_utc := current_week_start::timestamp at time zone tz;
  current_week_end_utc := current_week_end::timestamp at time zone tz;

  -- Words of the phrases ACTIVATED this week: recorded with your voice in Activación (a row in
  -- phrase_voice_activations), not the phrases only created (Luis and Nahuel, 16 Oct). A phrase
  -- created on another day and recorded this week counts this week.
  select count(distinct pla.lexicard_id)::integer
  into current_progress_count
  from public.phrase_voice_activations pva
  join public.phrase_lexicard_activations pla
    on pla.phrase_generation_id = pva.phrase_generation_id
   and pla.user_id = pva.user_id
  where pva.user_id = current_user_id
    and pva.status = 'uploaded'
    and lower(trim(pla.target_lang)) = lang_target
    and pva.created_at >= current_week_start_utc
    and pva.created_at < current_week_end_utc;

  current_progress_count := coalesce(current_progress_count, 0);

  -- Change-over, only in favour (Luis, 16 Oct): in the week running when this changed, whoever
  -- had more words with the old count (phrases created) keeps that number, so nobody loses a
  -- PreguntICA they already had. From the next week, only the new count.
  if current_week_start <= date '2026-10-16' then
    select greatest(
      current_progress_count,
      coalesce((
        select count(distinct pla.lexicard_id)::integer
        from public.phrase_lexicard_activations pla
        where pla.user_id = current_user_id
          and lower(trim(pla.target_lang)) = lang_target
          and pla.created_at >= current_week_start_utc
          and pla.created_at < current_week_end_utc
      ), 0)
    )
    into current_progress_count;
  end if;
  progress_unlock := current_progress_count >= 20;

  insert into public.preguntica_weeks (
    user_id,
    week_start,
    week_end,
    timezone,
    target_lang,
    native_lang,
    required_activation_words,
    activation_words_count,
    is_unlocked,
    unlocked_via,
    unlocked_at
  )
  values (
    current_user_id,
    current_week_start,
    current_week_end,
    tz,
    lang_target,
    lang_native,
    20,
    current_progress_count,
    progress_unlock,
    case when progress_unlock then 'progress' else null end,
    case when progress_unlock then now() else null end
  )
  on conflict (user_id, week_start, target_lang)
  do update
  set
    week_end = excluded.week_end,
    timezone = excluded.timezone,
    required_activation_words = excluded.required_activation_words,
    activation_words_count = excluded.activation_words_count,
    is_unlocked = case
      when public.preguntica_weeks.completed_at is not null then true
      when public.preguntica_weeks.unlocked_via in ('tokens', 'manual') then true
      else excluded.is_unlocked
    end,
    unlocked_via = case
      when public.preguntica_weeks.completed_at is not null then public.preguntica_weeks.unlocked_via
      when public.preguntica_weeks.unlocked_via in ('tokens', 'manual') then public.preguntica_weeks.unlocked_via
      when excluded.is_unlocked then excluded.unlocked_via
      else null
    end,
    unlocked_at = case
      when public.preguntica_weeks.completed_at is not null then public.preguntica_weeks.unlocked_at
      when public.preguntica_weeks.unlocked_via in ('tokens', 'manual')
        and public.preguntica_weeks.unlocked_at is not null then public.preguntica_weeks.unlocked_at
      when excluded.is_unlocked then coalesce(public.preguntica_weeks.unlocked_at, now())
      else null
    end,
    updated_at = now()
  returning id into v_week_id;

  return query
  with usage_stats as (
    select
      (
        select count(*)::integer
        from public.preguntica_attempts pa
        where pa.preguntica_week_id = v_week_id
          and pa.user_id = current_user_id
          and pa.attempt_kind = 'weekly'
      ) as attempts_used,
      (
        select count(*)::integer
        from public.preguntica_week_token_unlocks pwtu
        where pwtu.preguntica_week_id = v_week_id
          and pwtu.user_id = current_user_id
      ) as token_unlocks_used,
      (
        select count(*)::integer
        from public.preguntica_attempts pa
        where pa.preguntica_week_id = v_week_id
          and pa.user_id = current_user_id
          and pa.attempt_kind = 'token_unlock'
      ) as token_attempts_used
  )
  select
    pw.id,
    pw.week_start,
    pw.week_end,
    pw.timezone,
    pw.required_activation_words,
    pw.activation_words_count,
    pw.is_unlocked,
    pw.unlocked_via,
    pw.unlocked_at,
    pw.completed_at,
    us.attempts_used,
    us.token_unlocks_used,
    (
      -- PreguntICA de la semana (gratis): semana desbloqueada y aún sin responder.
      (pw.is_unlocked and pw.completed_at is null and us.attempts_used < 3)
      -- PreguntICA pagada con ICA Coins: vale con la semana ya respondida o todavía bloqueada.
      or (
        us.token_unlocks_used > us.token_attempts_used
        and (pw.completed_at is not null or not pw.is_unlocked)
      )
    ),
    false
  from public.preguntica_weeks pw
  cross join usage_stats us
  where pw.id = v_week_id;
end;
$function$
;

-- create_preguntica_attempt
CREATE OR REPLACE FUNCTION public.create_preguntica_attempt(p_word_mode text, p_reference timestamp with time zone DEFAULT now(), p_target_lang text DEFAULT NULL::text, p_native_lang text DEFAULT NULL::text)
 RETURNS preguntica_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  status_row record;
  mode_normalized text;
  new_attempt public.preguntica_attempts;
  token_attempts_used integer;
  token_unlocks_available integer;
  lang_target text;
  lang_native text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  mode_normalized := lower(trim(coalesce(p_word_mode, 'mixed')));
  if mode_normalized = '' then
    mode_normalized := 'mixed';
  end if;

  lang_target := lower(trim(coalesce(p_target_lang, '')));
  lang_native := lower(trim(coalesce(p_native_lang, '')));

  select *
  into status_row
  from public.get_my_preguntica_week_status(
    p_reference,
    nullif(lang_target, ''),
    nullif(lang_native, '')
  );

  -- Days 29-31: closed until day 1 (Luis, 9 Oct).
  if coalesce(status_row.is_closed, false) or status_row.week_id is null then
    raise exception 'PREGUNTICA_CLOSED';
  end if;

  -- The week is per target language; the attempt keeps the native language you have now.
  select pw.target_lang, coalesce(nullif(lang_native, ''), pw.native_lang)
  into lang_target, lang_native
  from public.preguntica_weeks pw
  where pw.id = status_row.week_id;

  -- PreguntICA de la semana (gratis): semana desbloqueada y aún sin responder.
  if coalesce(status_row.is_unlocked, false) and status_row.completed_at is null then
    if coalesce(status_row.attempts_used, 0) >= 3 then
      raise exception 'WEEK_ATTEMPT_LIMIT_REACHED';
    end if;

    insert into public.preguntica_attempts (
      user_id,
      preguntica_week_id,
      attempt_number,
      attempt_kind,
      word_mode,
      target_lang,
      native_lang,
      status
    )
    values (
      current_user_id,
      status_row.week_id,
      status_row.attempts_used + 1,
      'weekly',
      mode_normalized,
      lang_target,
      lang_native,
      'pending_response'
    )
    returning *
    into new_attempt;

    return new_attempt;
  end if;

  select count(*)::integer
  into token_unlocks_available
  from public.preguntica_week_token_unlocks pwtu
  where pwtu.user_id = current_user_id
    and pwtu.preguntica_week_id = status_row.week_id;

  select count(*)::integer
  into token_attempts_used
  from public.preguntica_attempts pa
  where pa.user_id = current_user_id
    and pa.preguntica_week_id = status_row.week_id
    and pa.attempt_kind = 'token_unlock';

  -- PreguntICA pagada con ICA Coins: vale con la semana ya respondida o todavía bloqueada
  -- (el alumno puede comprarla aunque no haya activado las palabras de la semana).
  if token_unlocks_available <= token_attempts_used then
    if coalesce(status_row.is_unlocked, false) is false then
      raise exception 'WEEK_LOCKED_NOT_ENOUGH_ACTIVATIONS';
    end if;
    raise exception 'TOKEN_UNLOCK_REQUIRED';
  end if;

  insert into public.preguntica_attempts (
    user_id,
    preguntica_week_id,
    attempt_number,
    attempt_kind,
    word_mode,
    target_lang,
    native_lang,
    status
  )
  values (
    current_user_id,
    status_row.week_id,
    token_attempts_used + 1,
    'token_unlock',
    mode_normalized,
    lang_target,
    lang_native,
    'pending_response'
  )
  returning *
  into new_attempt;

  return new_attempt;
end;
$function$
;

-- redeem_preguntica_tokens_for_week
CREATE OR REPLACE FUNCTION public.redeem_preguntica_tokens_for_week(p_week_start date, p_target_lang text, p_native_lang text, p_tokens_to_spend numeric DEFAULT 50)
 RETURNS TABLE(unlock_id uuid, week_id uuid, spent_tokens numeric, balance_after numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  target_week_id uuid;
  spent numeric(10,2);
  current_balance numeric(10,2);
  ledger_id uuid;
  new_unlock_id uuid;
  lang_target text;
  lang_native text;
  tz text;
  today_week record;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_week_start is null then
    raise exception 'WEEK_START_REQUIRED';
  end if;

  lang_target := lower(trim(coalesce(p_target_lang, '')));
  lang_native := lower(trim(coalesce(p_native_lang, '')));
  if lang_target = '' or lang_native = '' then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;

  -- Una PreguntICA extra cuesta 50 ICA Coins.
  spent := round(coalesce(p_tokens_to_spend, 50)::numeric, 2);
  if spent <> 50 then
    raise exception 'REDEEM_COST_MUST_BE_50_TOKENS';
  end if;

  -- Only this week's PreguntICA can be bought, and none on days 29-31 (Luis, 9 Oct).
  select coalesce(tzn.name, 'UTC')
  into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = current_user_id;

  select w.week_start, w.is_closed
  into today_week
  from public.preguntica_week_for_day((now() at time zone coalesce(tz, 'UTC'))::date) w;

  if today_week.is_closed then
    raise exception 'PREGUNTICA_CLOSED';
  end if;

  if today_week.week_start <> p_week_start then
    raise exception 'WEEK_NOT_CURRENT';
  end if;

  select pw.id
  into target_week_id
  from public.preguntica_weeks pw
  where pw.user_id = current_user_id
    and pw.week_start = p_week_start
    and pw.target_lang = lang_target
  for update;

  if target_week_id is null then
    raise exception 'WEEK_NOT_FOUND';
  end if;

  -- Ya no hace falta haber activado las 20 palabras de la semana para comprar el intento extra.

  perform pg_advisory_xact_lock(hashtext(current_user_id::text || ':preguntica_tokens'));

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  if current_balance < spent then
    raise exception 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.preguntica_token_ledger (
    user_id,
    entry_type,
    tokens_delta,
    reference_type,
    reference_id,
    metadata
  )
  values (
    current_user_id,
    'redeem_unlock',
    -spent,
    'preguntica_week',
    target_week_id,
    jsonb_build_object('week_start', p_week_start, 'target_lang', lang_target, 'native_lang', lang_native)
  )
  returning id
  into ledger_id;

  insert into public.preguntica_week_token_unlocks (
    user_id,
    preguntica_week_id,
    tokens_spent,
    ledger_entry_id
  )
  values (
    current_user_id,
    target_week_id,
    spent,
    ledger_id
  )
  returning id
  into new_unlock_id;

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  return query
  select
    new_unlock_id,
    target_week_id,
    spent,
    current_balance;
end;
$function$
;

-- get_my_monthly_review_status
CREATE OR REPLACE FUNCTION public.get_my_monthly_review_status(p_target_lang text, p_native_lang text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  ctx record;
  cfg jsonb := public.ica_monthly_review_config();
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  word_count integer;
  result_row public.ica_monthly_reviews%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_l = '' or native_l = '' then raise exception 'LANGUAGES_REQUIRED'; end if;

  select * into ctx from public.ica_monthly_review_context(v_user_id);

  select count(*)::integer into word_count
  from public.lexicards l
  where l.user_id = v_user_id
    and lower(l.target_lang) = target_l
    and l.created_at >= ctx.pool_from
    and l.created_at < ctx.pool_to;

  select r.* into result_row
  from public.ica_monthly_reviews r
  where r.user_id = v_user_id and r.review_month = ctx.month_start;

  return jsonb_build_object(
    'monthStart', ctx.month_start,
    'today', ctx.local_today,
    'openDay', (cfg ->> 'openDay')::integer,
    'closeDay', (cfg ->> 'closeDay')::integer,
    'minWords', (cfg ->> 'minWords')::integer,
    'windowOpen', ctx.window_open,
    'wordCount', word_count,
    'eligible', word_count >= (cfg ->> 'minWords')::integer,
    'result', case when result_row.id is null then null else jsonb_build_object(
      'correct', result_row.correct,
      'total', result_row.total,
      'rememberedOfTen', result_row.remembered_of_ten,
      'coins', result_row.coins_awarded,
      'rounds', result_row.round_scores,
      'finishedAt', result_row.finished_at
    ) end
  );
end;
$function$
;

-- finish_monthly_review
CREATE OR REPLACE FUNCTION public.finish_monthly_review(p_target_lang text, p_native_lang text, p_correct integer, p_total integer, p_rounds jsonb, p_missed_word_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  ctx record;
  cfg jsonb := public.ica_monthly_review_config();
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  word_count integer;
  existing public.ica_monthly_reviews%rowtype;
  reading_c integer;
  reading_t integer;
  listening_c integer;
  listening_t integer;
  writing_c integer;
  writing_t integer;
  tens integer;
  current_balance numeric(10,2);
  credited numeric(10,2);
  ledger_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_l = '' or native_l = '' then raise exception 'LANGUAGES_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));

  select * into ctx from public.ica_monthly_review_context(v_user_id);

  select r.* into existing
  from public.ica_monthly_reviews r
  where r.user_id = v_user_id and r.review_month = ctx.month_start;
  if found then
    return jsonb_build_object(
      'alreadyDone', true,
      'correct', existing.correct,
      'total', existing.total,
      'rememberedOfTen', existing.remembered_of_ten,
      'coins', existing.coins_awarded,
      'rounds', existing.round_scores
    );
  end if;

  if not ctx.window_open then raise exception 'REVIEW_WINDOW_CLOSED'; end if;

  select count(*)::integer into word_count
  from public.lexicards l
  where l.user_id = v_user_id
    and lower(l.target_lang) = target_l
    and l.created_at >= ctx.pool_from
    and l.created_at < ctx.pool_to;
  if word_count < (cfg ->> 'minWords')::integer then raise exception 'REVIEW_NOT_ELIGIBLE'; end if;

  -- The shape of the result: 4 reading questions, 6 writing questions, up to 4 listening ones
  -- (a listening question the student could not hear does not count).
  begin
    reading_c := (p_rounds -> 'reading' ->> 'correct')::integer;
    reading_t := (p_rounds -> 'reading' ->> 'total')::integer;
    listening_c := (p_rounds -> 'listening' ->> 'correct')::integer;
    listening_t := (p_rounds -> 'listening' ->> 'total')::integer;
    writing_c := (p_rounds -> 'writing' ->> 'correct')::integer;
    writing_t := (p_rounds -> 'writing' ->> 'total')::integer;
  exception when others then
    raise exception 'REVIEW_RESULT_INVALID';
  end;

  if reading_c is null or reading_t is null or listening_c is null or listening_t is null
     or writing_c is null or writing_t is null
     or reading_t <> 4 or writing_t <> 6 or listening_t < 0 or listening_t > 4
     or reading_c < 0 or reading_c > reading_t
     or listening_c < 0 or listening_c > listening_t
     or writing_c < 0 or writing_c > writing_t
     or p_correct is distinct from (reading_c + listening_c + writing_c)
     or p_total is distinct from (reading_t + listening_t + writing_t)
     or p_total < 10 or p_total > 14 then
    raise exception 'REVIEW_RESULT_INVALID';
  end if;

  -- Remembered words out of ten: the percentage rounded UP to the tens (86 % -> 9, 74 % -> 8).
  tens := (10 * p_correct + p_total - 1) / p_total;

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger l where l.user_id = v_user_id;
  credited := greatest(0, least(tens::numeric, 100 - current_balance));

  if credited > 0 then
    insert into public.preguntica_token_ledger (
      user_id, entry_type, tokens_delta, reference_day, reference_key, metadata
    ) values (
      v_user_id, 'monthly_review', credited, ctx.local_today, to_char(ctx.month_start, 'YYYY-MM'),
      jsonb_build_object('tens', tens, 'correct', p_correct, 'total', p_total, 'source', 'monthly_review')
    ) returning id into ledger_id;
  end if;

  insert into public.ica_monthly_reviews (
    user_id, review_month, target_lang, native_lang, correct, total, remembered_of_ten,
    round_scores, coins_awarded, ledger_entry_id
  ) values (
    v_user_id, ctx.month_start, trim(p_target_lang), trim(p_native_lang), p_correct, p_total, tens,
    jsonb_build_object(
      'reading', jsonb_build_object('correct', reading_c, 'total', reading_t),
      'listening', jsonb_build_object('correct', listening_c, 'total', listening_t),
      'writing', jsonb_build_object('correct', writing_c, 'total', writing_t)
    ),
    credited, ledger_id
  );

  -- POTENCIAR: the words that were missed come first in the next flashcards, daily challenges and
  -- Desafíos ICA (only the student's own words; at most one per question).
  if p_missed_word_ids is not null and cardinality(p_missed_word_ids) > 0 then
    update public.lexicards
       set importance = 'vital',
           boost_flash = 2,
           boost_daily = 2,
           boost_duel = 2,
           updated_at = now()
     where user_id = v_user_id
       and id = any (p_missed_word_ids[1:14]);
  end if;

  return jsonb_build_object(
    'alreadyDone', false,
    'correct', p_correct,
    'total', p_total,
    'rememberedOfTen', tens,
    'coins', credited,
    'coinsCapped', credited < tens,
    'rounds', jsonb_build_object(
      'reading', jsonb_build_object('correct', reading_c, 'total', reading_t),
      'listening', jsonb_build_object('correct', listening_c, 'total', listening_t),
      'writing', jsonb_build_object('correct', writing_c, 'total', writing_t)
    )
  );
end;
$function$
;

-- get_my_monthly_review_pool
CREATE OR REPLACE FUNCTION public.get_my_monthly_review_pool(p_target_lang text, p_native_lang text, p_practice boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  ctx record;
  cfg jsonb := public.ica_monthly_review_config();
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  words jsonb;
  phrases jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_l = '' or native_l = '' then raise exception 'LANGUAGES_REQUIRED'; end if;

  select * into ctx from public.ica_monthly_review_context(v_user_id);
  if not ctx.window_open then raise exception 'REVIEW_WINDOW_CLOSED'; end if;
  if exists (
    select 1 from public.ica_monthly_reviews r
    where r.user_id = v_user_id and r.review_month = ctx.month_start
  ) then
    if not coalesce(p_practice, false) then raise exception 'REVIEW_ALREADY_DONE'; end if;
  elsif coalesce(p_practice, false) then
    -- Practice is only for repeating a Repaso already done this month.
    raise exception 'REVIEW_NOT_DONE';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'target', w.target, 'native', w.native) order by w.created_at, w.id), '[]'::jsonb)
  into words
  from public.lexicards w
  where w.user_id = v_user_id
    and lower(w.target_lang) = target_l
    and w.created_at >= ctx.pool_from
    and w.created_at < ctx.pool_to
    and length(trim(w.target)) > 0
    and length(trim(w.native)) > 0;

  if jsonb_array_length(words) < (cfg ->> 'minWords')::integer then
    raise exception 'REVIEW_NOT_ELIGIBLE';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'target', g.generated_phrase, 'native', g.translation) order by g.created_at, g.id), '[]'::jsonb)
  into phrases
  from public.phrase_generations g
  where g.user_id = v_user_id
    and g.success = true
    and lower(g.target_lang) = target_l
    and g.created_at >= ctx.pool_from
    and g.created_at < ctx.pool_to
    and length(trim(coalesce(g.generated_phrase, ''))) > 0
    and length(trim(coalesce(g.translation, ''))) > 0;

  return jsonb_build_object('monthStart', ctx.month_start, 'words', words, 'phrases', phrases);
end;
$function$
;

-- get_my_ica_summary
CREATE OR REPLACE FUNCTION public.get_my_ica_summary(p_from_day date, p_to_day date, p_target_lang text, p_native_lang text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  tz text;
  from_day date;
  to_day date;
  p_from timestamptz;
  p_to timestamptz;
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  result jsonb;
begin
  if me is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_from_day is null or p_to_day is null or p_to_day <= p_from_day then
    raise exception 'RANGE_REQUIRED';
  end if;
  if target_l = '' or native_l = '' then
    raise exception 'LANGUAGES_REQUIRED';
  end if;

  select coalesce(tzn.name, 'Europe/Madrid')
    into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
  where p.id = me;
  tz := coalesce(tz, 'Europe/Madrid');
  from_day := p_from_day;
  to_day := p_to_day - 1;
  -- The same days as moments: midnight of the student's own time zone.
  p_from := p_from_day::timestamp at time zone tz;
  p_to := p_to_day::timestamp at time zone tz;

  with
  words as (
    select l.id, l.target, l.native, l.created_at
    from public.lexicards l
    where l.user_id = me
      and lower(l.target_lang) = target_l
      and l.created_at >= p_from and l.created_at < p_to
  ),
  reviews as (
    select r.lexicard_id, r.knew, r.reviewed_at, l.target, l.native
    from public.lexicard_reviews r
    join public.lexicards l on l.id = r.lexicard_id
    where r.user_id = me
      and r.reviewed_at >= p_from and r.reviewed_at < p_to
      and lower(l.target_lang) = target_l
  ),
  top_review as (
    select target, native, count(*) as answers, count(*) filter (where knew) as correct
    from reviews
    group by lexicard_id, target, native
    order by count(*) desc, count(*) filter (where knew) desc, max(reviewed_at) desc
    limit 1
  ),
  review_hour as (
    select extract(hour from (reviewed_at at time zone tz))::int as hour, count(*) as n
    from reviews
    group by 1
    order by 2 desc, 1
    limit 1
  ),
  phrases as (
    select g.source_words
    from public.phrase_generations g
    where g.user_id = me
      and g.success = true
      and lower(g.target_lang) = target_l
      and g.created_at >= p_from and g.created_at < p_to
  ),
  phrase_word as (
    select lower(trim(w)) as word, count(*) as n
    from phrases, unnest(source_words) as w
    where length(trim(w)) > 0
    group by 1
    order by 2 desc, 1
    limit 1
  ),
  days as (
    select d.day, d.creation_goal_completed, d.review_goal_completed, d.words_added, d.correct_reviews
    from public.daily_metrics d
    where d.user_id = me
      and d.day between from_day and to_day
  ),
  best_month as (
    select date_trunc('month', day)::date as month, count(*) as n
    from days
    where creation_goal_completed
    group by 1
    order by 2 desc, 1 desc
    limit 1
  ),
  listening as (
    select coalesce(sum(l.delta_seconds), 0)::bigint as seconds
    from public.master_note_listening_ingest_log l
    cross join lateral (
      select case
        when l.local_day is not null then l.local_day
        when l.occurred_at is not null then
          (l.occurred_at at time zone coalesce(nullif(l.timezone_name, ''), tz))::date
        when (l.created_at at time zone 'UTC')::date > l.day + 1 then l.day
        else (l.created_at at time zone tz)::date
      end as listening_day
    ) event_day
    where l.user_id = me
      and l.delta_seconds > 0
      and lower(l.target_lang) = target_l
      and event_day.listening_day between from_day and to_day
  ),
  daily_games as (
    select g.correct, g.total
    from public.ica_daily_game_results g
    where g.user_id = me
      and g.day between from_day and to_day
  ),
  challenges as (
    select
      c.winner_user_id,
      case when c.challenger_user_id = me then c.challenged_user_id else c.challenger_user_id end as rival_id
    from public.ica_challenges c
    where (c.challenger_user_id = me or c.challenged_user_id = me)
      and c.status = 'completed'
      and lower(c.target_lang) = target_l
      and coalesce(c.finalized_at, c.created_at) >= p_from
      and coalesce(c.finalized_at, c.created_at) < p_to
  ),
  top_rival as (
    select ch.rival_id, count(*) as games, count(*) filter (where ch.winner_user_id = me) as wins
    from challenges ch
    where ch.rival_id is not null
    group by ch.rival_id
    order by 2 desc, 3 desc
    limit 1
  )
  select jsonb_build_object(
    'from_day', from_day,
    'to_day', to_day,
    'words_added', (select count(*) from words),
    'first_word', (
      select jsonb_build_object('target', w.target, 'native', w.native, 'created_at', w.created_at)
      from words w
      order by w.created_at asc
      limit 1
    ),
    'phrases_created', (select count(*) from phrases),
    'top_phrase_word', (select jsonb_build_object('word', word, 'times', n) from phrase_word),
    'master_notes_closed', (
      select count(*)
      from public.master_notes m
      where m.user_id = me
        and m.state = 'closed'
        and lower(m.target_lang) = target_l
        and m.closed_at >= p_from and m.closed_at < p_to
    ),
    'reviews_total', (select count(*) from reviews),
    'reviews_correct', (select count(*) from reviews where knew),
    'top_review_word', (
      select jsonb_build_object('target', target, 'native', native, 'answers', answers, 'correct', correct)
      from top_review
    ),
    'top_hour', (select hour from review_hour),
    'listening_seconds', (select seconds from listening),
    'cycle_days', (select count(*) from days where creation_goal_completed),
    'flash_days', (select count(*) from days where review_goal_completed),
    'active_days', (
      select count(*) from days
      where creation_goal_completed or review_goal_completed or words_added > 0 or correct_reviews > 0
    ),
    'best_month', (select jsonb_build_object('month', month, 'days', n) from best_month),
    'daily_games_played', (select count(*) from daily_games),
    'daily_games_perfect', (select count(*) from daily_games where correct = total),
    'daily_games_correct', (select coalesce(sum(correct), 0) from daily_games),
    'challenges_played', (select count(*) from challenges),
    'challenges_won', (select count(*) from challenges where winner_user_id = me),
    'top_rival', (
      select jsonb_build_object(
        'name', coalesce(nullif(split_part(trim(coalesce(p.display_name, '')), ' ', 1), ''), p.username, ''),
        'games', tr.games,
        'wins', tr.wins
      )
      from top_rival tr
      left join public.profiles p on p.id = tr.rival_id
    ),
    'best_rank', (
      select min(s.rank)
      from public.leaderboard_snapshots s
      where s.user_id = me
        and s.period = 'monthly'
        and s.period_start between from_day and to_day
    ),
    'coins_earned', (
      select coalesce(sum(t.tokens_delta), 0)
      from public.preguntica_token_ledger t
      where t.user_id = me
        and t.tokens_delta > 0
        and t.created_at >= p_from and t.created_at < p_to
    )
  )
  into result;

  return result;
end;
$function$
;

-- get_my_monthly_listening_seconds
CREATE OR REPLACE FUNCTION public.get_my_monthly_listening_seconds(p_month_start date, p_target_lang text, p_native_lang text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid := auth.uid();
  user_timezone text;
  listened_seconds bigint;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_month_start is null then
    raise exception 'MONTH_REQUIRED';
  end if;
  if nullif(trim(p_target_lang), '') is null or nullif(trim(p_native_lang), '') is null then
    raise exception 'LANGUAGES_REQUIRED';
  end if;

  select coalesce(tzn.name, 'UTC')
    into user_timezone
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
  where p.id = current_user_id;
  user_timezone := coalesce(user_timezone, 'UTC');

  select coalesce(sum(l.delta_seconds), 0)::bigint
    into listened_seconds
  from public.master_note_listening_ingest_log l
  cross join lateral (
    select case
      when l.local_day is not null then l.local_day
      when l.occurred_at is not null then
        (l.occurred_at at time zone coalesce(nullif(l.timezone_name, ''), user_timezone))::date
      when (l.created_at at time zone 'UTC')::date > l.day + 1 then l.day
      else (l.created_at at time zone user_timezone)::date
    end as listening_day
  ) event_day
  where l.user_id = current_user_id
    and l.delta_seconds > 0
    and lower(l.target_lang) = lower(trim(p_target_lang))
    and event_day.listening_day >= p_month_start
    and event_day.listening_day < (p_month_start + interval '1 month')::date;

  return listened_seconds;
end;
$function$
;

-- bump_master_note_listening_metrics
CREATE OR REPLACE FUNCTION public.bump_master_note_listening_metrics(p_event_id text, p_day date, p_target_lang text, p_native_lang text, p_delta_seconds integer DEFAULT 0)
 RETURNS TABLE(listened_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  safe_delta integer;
  safe_target_lang text;
  safe_native_lang text;
  inserted_log boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_day is null then
    raise exception 'DAY_REQUIRED';
  end if;

  if coalesce(trim(p_event_id), '') = '' then
    raise exception 'EVENT_ID_REQUIRED';
  end if;

  safe_target_lang := lower(trim(coalesce(p_target_lang, '')));
  safe_native_lang := lower(trim(coalesce(p_native_lang, '')));
  safe_delta := greatest(coalesce(p_delta_seconds, 0), 0);

  if safe_target_lang = '' then
    raise exception 'TARGET_LANG_REQUIRED';
  end if;

  if safe_native_lang = '' then
    raise exception 'NATIVE_LANG_REQUIRED';
  end if;

  insert into public.master_note_listening_ingest_log (
    user_id,
    event_id,
    day,
    target_lang,
    native_lang,
    delta_seconds
  )
  values (
    current_user_id,
    trim(p_event_id),
    p_day,
    safe_target_lang,
    safe_native_lang,
    safe_delta
  )
  on conflict (user_id, event_id) do nothing;

  inserted_log := found;

  if inserted_log and safe_delta > 0 then
    insert into public.master_note_listening_daily_metrics (
      user_id,
      day,
      target_lang,
      native_lang,
      listened_seconds
    )
    values (
      current_user_id,
      p_day,
      safe_target_lang,
      safe_native_lang,
      safe_delta
    )
    on conflict (user_id, day, target_lang)
    do update
    set listened_seconds = public.master_note_listening_daily_metrics.listened_seconds + safe_delta;
  end if;

  return query
  select mnl.listened_seconds
  from public.master_note_listening_daily_metrics mnl
  where mnl.user_id = current_user_id
    and mnl.day = p_day
    and mnl.target_lang = safe_target_lang;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_master_note_listening_metrics(p_event_id text, p_day date, p_target_lang text, p_native_lang text, p_delta_seconds integer, p_occurred_at timestamp with time zone)
 RETURNS TABLE(listened_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid := auth.uid();
  safe_delta integer := greatest(coalesce(p_delta_seconds, 0), 0);
  safe_target_lang text := lower(trim(coalesce(p_target_lang, '')));
  safe_native_lang text := lower(trim(coalesce(p_native_lang, '')));
  safe_event_id text := trim(coalesce(p_event_id, ''));
  user_timezone text;
  user_local_day date;
  inserted_log boolean;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_day is null then raise exception 'DAY_REQUIRED'; end if;
  if p_occurred_at is null then raise exception 'OCCURRED_AT_REQUIRED'; end if;
  if safe_event_id = '' then raise exception 'EVENT_ID_REQUIRED'; end if;
  if safe_target_lang = '' then raise exception 'TARGET_LANG_REQUIRED'; end if;
  if safe_native_lang = '' then raise exception 'NATIVE_LANG_REQUIRED'; end if;

  select coalesce(tzn.name, 'UTC')
    into user_timezone
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
  where p.id = current_user_id;
  user_timezone := coalesce(user_timezone, 'UTC');
  user_local_day := (p_occurred_at at time zone user_timezone)::date;

  insert into public.master_note_listening_ingest_log (
    user_id,
    event_id,
    day,
    target_lang,
    native_lang,
    delta_seconds,
    occurred_at,
    local_day,
    timezone_name
  )
  values (
    current_user_id,
    safe_event_id,
    p_day,
    safe_target_lang,
    safe_native_lang,
    safe_delta,
    p_occurred_at,
    user_local_day,
    user_timezone
  )
  on conflict (user_id, event_id) do nothing;

  inserted_log := found;

  if inserted_log and safe_delta > 0 then
    insert into public.master_note_listening_daily_metrics (
      user_id,
      day,
      target_lang,
      native_lang,
      listened_seconds
    )
    values (
      current_user_id,
      user_local_day,
      safe_target_lang,
      safe_native_lang,
      safe_delta
    )
    on conflict (user_id, day, target_lang)
    do update
      set listened_seconds = public.master_note_listening_daily_metrics.listened_seconds + safe_delta;
  end if;

  return query
  select m.listened_seconds
  from public.master_note_listening_daily_metrics m
  where m.user_id = current_user_id
    and m.day = user_local_day
    and m.target_lang = safe_target_lang;
end;
$function$
;

-- ica_challenge_directory_metrics
CREATE OR REPLACE FUNCTION public.ica_challenge_directory_metrics(p_current_user_id uuid, p_candidate_ids uuid[], p_language_pairs jsonb)
 RETURNS TABLE(user_id uuid, word_count bigint, active_challenges_count bigint, has_active_pair boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- prevent_meta_tracker_changes_after_confirmation
CREATE OR REPLACE FUNCTION public.prevent_meta_tracker_changes_after_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.confirmed_at is not null and (
    old.start_level is distinct from new.start_level
    or old.prior_ica_words is distinct from new.prior_ica_words
    or old.target_lang is distinct from new.target_lang
  ) then
    raise exception 'META_TRACKER_LOCKED';
  end if;

  return new;
end;
$function$
;


-- ---------------------------------------------------------------------------------------------
-- 4) Nivel de los alumnos con filas unidas: activaciones recalculadas por idioma objetivo
-- ---------------------------------------------------------------------------------------------
select public.recompute_lexicard_activation_metrics_for_user_lang(umt.user_id, umt.target_lang, umt.native_lang)
from public.user_meta_tracker umt
join _baul_tracker_merged m on m.user_id = umt.user_id and m.target_key = lower(trim(umt.target_lang));

commit;
