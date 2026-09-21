begin;

alter table public.ica_challenges
  add column if not exists accept_until timestamptz,
  add column if not exists turn_user_id uuid references auth.users (id) on delete set null,
  add column if not exists turn_expires_at timestamptz;

alter table public.ica_challenges
  drop constraint if exists ica_challenges_turn_user_participant_check;

alter table public.ica_challenges
  add constraint ica_challenges_turn_user_participant_check
  check (
    turn_user_id is null
    or turn_user_id = challenger_user_id
    or turn_user_id = challenged_user_id
  );

update public.ica_challenges
set accept_until = coalesce(accept_until, created_at + interval '12 hours')
where status = 'created';

create index if not exists ica_challenges_accept_until_idx
  on public.ica_challenges (accept_until)
  where status = 'created';

create index if not exists ica_challenges_turn_expires_at_idx
  on public.ica_challenges (turn_expires_at)
  where status = 'in_progress';

create or replace function public.expire_ica_challenge_invitations_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  update public.ica_challenges c
  set
    status = 'not_accepted',
    result_type = 'not_accepted',
    winner_user_id = null,
    finalized_at = coalesce(c.finalized_at, now()),
    turn_user_id = null,
    turn_expires_at = null,
    updated_at = now()
  where c.status = 'created'
    and c.accept_until is not null
    and c.accept_until <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

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
  timed_out_user_id uuid;
  next_turn_user_id uuid;
  affected integer := 0;
  result_type_value text;
  winner_user_id_value uuid;
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
    select comp.score
    into challenger_score
    from public.ica_challenge_competitors comp
    where comp.challenge_id = challenge_row.id
      and comp.user_id = challenge_row.challenger_user_id;

    select comp.score
    into challenged_score
    from public.ica_challenge_competitors comp
    where comp.challenge_id = challenge_row.id
      and comp.user_id = challenge_row.challenged_user_id;

    timed_out_user_id := challenge_row.turn_user_id;
    next_turn_user_id := case
      when timed_out_user_id = challenge_row.challenger_user_id then challenge_row.challenged_user_id
      else challenge_row.challenger_user_id
    end;

    if challenger_score is not null and challenged_score is not null then
      result_type_value := case
        when challenger_score > challenged_score then 'challenger_win'
        when challenged_score > challenger_score then 'challenged_win'
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

create or replace function public.run_ica_challenges_expiration_job()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_updates integer;
  turn_updates integer;
  expiration_updates integer;
begin
  invitation_updates := public.expire_ica_challenge_invitations_due();
  turn_updates := public.process_ica_challenge_turn_timeouts();
  expiration_updates := public.expire_ica_challenges_due();

  return 'ok:invites=' || invitation_updates::text || ',turns=' || turn_updates::text || ',expired=' || expiration_updates::text;
end;
$$;

commit;
