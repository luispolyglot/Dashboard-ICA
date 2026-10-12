-- DESAFÍO EXTRA AL ACEPTAR (Luis, 11 Oct 2026)
-- Before: nobody could send a challenge to someone who already had 3 open challenges.
-- Now: everyone can have up to 4 open challenges; the 4th one costs a «desafío extra»
-- (ica_challenge_passes, 15 ICA Coins), both for whoever sends it and for whoever accepts it.
--   * Sending: the rival may already have 3 open challenges (not 4).
--   * Accepting: when the person accepting already has 3 challenges they are committed to
--     (games in progress plus invitations they sent), they need an unused pass; with 4, they
--     must finish one first. Invitations they received and have not answered do not count here.
-- A challenge can now carry two passes (challenger's and challenged's), one per user.

begin;

alter table public.ica_challenge_passes
  drop constraint if exists ica_challenge_passes_used_challenge_id_key;

create unique index if not exists ica_challenge_passes_used_challenge_user_uidx
  on public.ica_challenge_passes (used_challenge_id, user_id)
  where used_challenge_id is not null;

-- Same trigger (ica_challenges_active_limits_trigger), new rules. The checks depend on the
-- transition: creating an invitation checks both players' open challenges; accepting it checks
-- what the person accepting is already committed to.
create or replace function public.enforce_ica_challenges_active_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  challenger_active_count integer;
  challenged_active_count integer;
  challenged_committed_count integer;
  extra_pass_id uuid;
  pass_valid boolean := false;
begin
  if new.status not in ('created', 'in_progress') then return new; end if;
  if new.challenger_user_id = new.challenged_user_id then raise exception 'ICA_CHALLENGE_SELF_NOT_ALLOWED'; end if;

  -- Updates that keep the same status and players (e.g. turn changes) were already checked.
  if tg_op = 'UPDATE'
    and old.status = new.status
    and old.challenger_user_id = new.challenger_user_id
    and old.challenged_user_id = new.challenged_user_id then
    return new;
  end if;

  -- Accepting an invitation.
  if tg_op = 'UPDATE'
    and old.status = 'created'
    and new.status = 'in_progress'
    and old.challenger_user_id = new.challenger_user_id
    and old.challenged_user_id = new.challenged_user_id then
    select count(*)::integer into challenged_committed_count
    from public.ica_challenges c
    where c.id <> new.id
      and (
        (c.status = 'in_progress'
          and (c.challenger_user_id = new.challenged_user_id or c.challenged_user_id = new.challenged_user_id))
        or (c.status = 'created' and c.challenger_user_id = new.challenged_user_id)
      );
    if challenged_committed_count >= 4 then
      raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED';
    end if;
    if challenged_committed_count >= 3 and not exists (
      select 1 from public.ica_challenge_passes cp
      where cp.user_id = new.challenged_user_id
        and cp.used_challenge_id = new.id
    ) then
      raise exception 'ICA_CHALLENGE_PASS_REQUIRED';
    end if;
    return new;
  end if;

  -- Creating an invitation (or any other change into an open state).
  select count(*)::integer into challenger_active_count
  from public.ica_challenges c
  where (c.challenger_user_id = new.challenger_user_id or c.challenged_user_id = new.challenger_user_id)
    and c.status in ('created', 'in_progress')
    and c.id <> coalesce(new.id, gen_random_uuid());

  if challenger_active_count >= 3 then
    begin
      extra_pass_id := nullif(new.game_metadata ->> 'ica_extra_slot_pass_id', '')::uuid;
    exception when invalid_text_representation then
      extra_pass_id := null;
    end;
    if extra_pass_id is not null then
      select exists (
        select 1 from public.ica_challenge_passes cp
        where cp.id = extra_pass_id
          and cp.user_id = new.challenger_user_id
          and (cp.used_challenge_id is null or cp.used_challenge_id = new.id)
      ) into pass_valid;
    end if;
    if challenger_active_count >= 4 or not pass_valid then
      raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED';
    end if;
  end if;

  select count(*)::integer into challenged_active_count
  from public.ica_challenges c
  where (c.challenger_user_id = new.challenged_user_id or c.challenged_user_id = new.challenged_user_id)
    and c.status in ('created', 'in_progress')
    and c.id <> coalesce(new.id, gen_random_uuid());
  if challenged_active_count >= 4 then
    raise exception 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

-- Same function as in 20261003120000_ica_coins_server_authority.sql; only the rival limit
-- changes from 3 to 4.
create or replace function public.create_ica_challenge_with_pass(
  p_user_id uuid,
  p_challenged_user_id uuid,
  p_challenge_slug text,
  p_scope text,
  p_target_lang text,
  p_native_lang text,
  p_duration_seconds integer,
  p_expires_at timestamptz,
  p_accept_until timestamptz,
  p_game_metadata jsonb,
  p_phases_json jsonb,
  p_use_extra_slot boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_id uuid := gen_random_uuid();
  active_count integer;
  rival_active_count integer;
  pass_id uuid;
  first_lock text;
  second_lock text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_user_id is null or p_challenged_user_id is null or p_user_id = p_challenged_user_id then
    raise exception 'INVALID_CHALLENGE_PARTICIPANTS';
  end if;

  first_lock := least(p_user_id::text, p_challenged_user_id::text);
  second_lock := greatest(p_user_id::text, p_challenged_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-active:' || first_lock, 0));
  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-active:' || second_lock, 0));

  select count(*)::integer into active_count
  from public.ica_challenges c
  where c.status in ('created', 'in_progress')
    and (c.challenger_user_id = p_user_id or c.challenged_user_id = p_user_id);
  select count(*)::integer into rival_active_count
  from public.ica_challenges c
  where c.status in ('created', 'in_progress')
    and (c.challenger_user_id = p_challenged_user_id or c.challenged_user_id = p_challenged_user_id);

  if active_count >= 4 then raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED'; end if;
  if active_count >= 3 then
    if not coalesce(p_use_extra_slot, false) then raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED'; end if;
    select cp.id into pass_id
    from public.ica_challenge_passes cp
    where cp.user_id = p_user_id and cp.used_at is null
    order by cp.created_at, cp.id
    for update skip locked
    limit 1;
    if pass_id is null then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
    p_game_metadata := coalesce(p_game_metadata, '{}'::jsonb)
      || jsonb_build_object('ica_extra_slot_pass_id', pass_id);
  end if;
  if rival_active_count >= 4 then raise exception 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED'; end if;
  if exists (
    select 1 from public.ica_challenges c
    where c.status in ('created', 'in_progress')
      and ((c.challenger_user_id = p_user_id and c.challenged_user_id = p_challenged_user_id)
        or (c.challenger_user_id = p_challenged_user_id and c.challenged_user_id = p_user_id))
  ) then raise exception 'ICA_CHALLENGE_ACTIVE_PAIR_EXISTS'; end if;

  insert into public.ica_challenges (
    id, challenge_slug, status, result_type, scope, target_lang, native_lang,
    challenger_user_id, challenged_user_id, duration_seconds, expires_at,
    accept_until, game_metadata, phases_json
  ) values (
    challenge_id, p_challenge_slug, 'created', 'pending', p_scope,
    case when p_scope = 'language' then p_target_lang else null end,
    case when p_scope = 'language' then p_native_lang else null end,
    p_user_id, p_challenged_user_id, p_duration_seconds, p_expires_at,
    p_accept_until, coalesce(p_game_metadata, '{}'::jsonb), coalesce(p_phases_json, '[]'::jsonb)
  );

  insert into public.ica_challenge_competitors (
    challenge_id, user_id, competitor_order, invitation_status, accepted_at
  ) values
    (challenge_id, p_user_id, 1, 'accepted', now()),
    (challenge_id, p_challenged_user_id, 2, 'pending', null);

  if pass_id is not null then
    update public.ica_challenge_passes
    set used_challenge_id = challenge_id, used_at = now()
    where id = pass_id and used_at is null;
    if not found then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
  end if;

  return challenge_id;
end;
$$;

revoke all on function public.create_ica_challenge_with_pass(uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.create_ica_challenge_with_pass(uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, jsonb, boolean) to service_role;

-- Accepting an invitation in one transaction: limit check, pass use and both row updates.
-- Called only by the ica-challenges-center Edge Function (service role), which has already
-- validated words and modes. Returns whether a pass was used.
create or replace function public.accept_ica_challenge_with_pass(
  p_user_id uuid,
  p_challenge_id uuid,
  p_turn_expires_at timestamptz,
  p_use_extra_slot boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.ica_challenges%rowtype;
  committed_count integer;
  pass_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_user_id is null or p_challenge_id is null then raise exception 'INVALID_CHALLENGE_PARTICIPANTS'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-active:' || p_user_id::text, 0));

  select c.* into challenge_row
  from public.ica_challenges c
  where c.id = p_challenge_id and c.challenged_user_id = p_user_id
  for update;
  if not found then raise exception 'ICA_CHALLENGE_NOT_FOUND'; end if;
  if challenge_row.status <> 'created' then raise exception 'ICA_CHALLENGE_ALREADY_ANSWERED'; end if;

  select count(*)::integer into committed_count
  from public.ica_challenges c
  where c.id <> p_challenge_id
    and (
      (c.status = 'in_progress' and (c.challenger_user_id = p_user_id or c.challenged_user_id = p_user_id))
      or (c.status = 'created' and c.challenger_user_id = p_user_id)
    );

  if committed_count >= 4 then raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED'; end if;
  if committed_count >= 3 then
    if not coalesce(p_use_extra_slot, false) then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
    select cp.id into pass_id
    from public.ica_challenge_passes cp
    where cp.user_id = p_user_id and cp.used_at is null
    order by cp.created_at, cp.id
    for update skip locked
    limit 1;
    if pass_id is null then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
    update public.ica_challenge_passes
    set used_challenge_id = p_challenge_id, used_at = now()
    where id = pass_id and used_at is null;
    if not found then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
  end if;

  update public.ica_challenge_competitors
  set invitation_status = 'accepted', accepted_at = now(), rejected_at = null
  where challenge_id = p_challenge_id and user_id = p_user_id;

  update public.ica_challenges
  set status = 'in_progress',
      result_type = 'pending',
      started_at = now(),
      finalized_at = null,
      winner_user_id = null,
      turn_user_id = p_user_id,
      turn_expires_at = p_turn_expires_at
  where id = p_challenge_id;

  return pass_id is not null;
end;
$$;

revoke all on function public.accept_ica_challenge_with_pass(uuid, uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.accept_ica_challenge_with_pass(uuid, uuid, timestamptz, boolean) to service_role;

commit;
