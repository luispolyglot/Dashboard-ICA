-- COACHING: DOUBLE DAILY LIMITS (Luis, 16 Oct 2026)
--
-- A student with an active coaching (any language) gets twice the daily limits of ICA:
-- 30 new words, 4 phrases and 4 activations a day. «Ampliar» still doubles a phase on top.
--
-- 1. ica_daily_limit_multiplier(user): 2 with an active coaching session, otherwise 1.
-- 2. ica_record_daily_limit_usage: same function as 20261013120500_inmersion_15_words.sql, only the
--    base limit is multiplied.
-- 3. get_my_ica_coins_state: same function as 20261003120000_ica_coins_server_authority.sql plus
--    «dailyLimitMultiplier», so the app shows the limits the server applies.

begin;

create or replace function public.ica_daily_limit_multiplier(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
    select 1
    from public.coaching_sessions cs
    where cs.user_id = p_user_id
      and cs.status = 'active'
      and cs.is_active = true
  ) then 2 else 1 end;
$$;

revoke all on function public.ica_daily_limit_multiplier(uuid) from public, anon, authenticated;

create or replace function public.ica_record_daily_limit_usage(
  p_user_id uuid,
  p_kind text,
  p_source_id uuid,
  p_is_regeneration boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_day date;
  base_limit integer;
  active_limit integer;
  used_count integer;
  has_boost boolean;
begin
  if p_user_id is null or p_source_id is null then raise exception 'DAILY_LIMIT_USAGE_INVALID'; end if;
  if p_kind not in ('words', 'phrases', 'activations') then raise exception 'DAILY_LIMIT_KIND_INVALID'; end if;
  if p_kind = 'phrases' and coalesce(p_is_regeneration, false) then return; end if;

  local_day := public.ica_local_today(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ica-daily-limit:' || p_user_id::text || ':' || p_kind, 0));

  if exists (
    select 1 from public.ica_daily_limit_usage u
    where u.user_id = p_user_id and u.usage_day = local_day
      and u.usage_kind = p_kind and u.source_id = p_source_id
  ) then return; end if;

  if p_kind = 'activations' and exists (
    select 1 from public.ica_daily_limit_usage u
    where u.user_id = p_user_id and u.usage_kind = 'activations' and u.source_id = p_source_id
  ) then return; end if;

  -- Coaching students get double (30 words, 4 phrases, 4 activations); «Ampliar» doubles on top.
  base_limit := (case p_kind when 'words' then 15 when 'phrases' then 2 else 2 end)
    * public.ica_daily_limit_multiplier(p_user_id);
  select exists (
    select 1 from public.preguntica_token_ledger l
    where l.user_id = p_user_id and l.entry_type = 'phase_boost'
      and l.reference_day = local_day and l.reference_key = p_kind
  ) into has_boost;
  active_limit := base_limit * case when has_boost then 2 else 1 end;

  select count(*)::integer into used_count
  from public.ica_daily_limit_usage u
  where u.user_id = p_user_id and u.usage_day = local_day and u.usage_kind = p_kind;
  if used_count >= active_limit then
    raise exception using message = case p_kind
      when 'words' then 'DAILY_LIMIT_WORDS'
      when 'phrases' then 'DAILY_LIMIT_PHRASES'
      else 'DAILY_LIMIT_ACTIVATIONS'
    end;
  end if;

  insert into public.ica_daily_limit_usage (user_id, usage_day, usage_kind, source_id)
  values (p_user_id, local_day, p_kind, p_source_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.ica_record_daily_limit_usage(uuid, text, uuid, boolean) from public, anon, authenticated;

create or replace function public.get_my_ica_coins_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  week_start date;
  balance numeric(10,2);
  chest_row public.preguntica_token_ledger%rowtype;
  entries jsonb;
  boosts jsonb;
  claimed_ica jsonb;
  claimed_flash jsonb;
  unused_pass_count integer;
  wins numeric(10,2);
  usage_words integer;
  usage_phrases integer;
  usage_activations integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  local_day := public.ica_local_today(v_user_id);
  week_start := local_day - (extract(isodow from local_day)::integer - 1);

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into balance
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id;

  select l.* into chest_row
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'cycle_chest'
    and l.reference_day = local_day
  limit 1;

  select coalesce(jsonb_agg(l.reference_key), '[]'::jsonb)
  into boosts
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'phase_boost'
    and l.reference_day = local_day;

  select coalesce(jsonb_agg(l.reference_key::integer), '[]'::jsonb)
  into claimed_ica
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id and l.entry_type = 'streak_milestone';

  select coalesce(jsonb_agg(l.reference_key::integer), '[]'::jsonb)
  into claimed_flash
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id and l.entry_type = 'flash_milestone';

  select count(*)::integer into unused_pass_count
  from public.ica_challenge_passes cp
  where cp.user_id = v_user_id and cp.used_at is null;

  select coalesce(sum(l.tokens_delta), 0)::numeric(10,2) into wins
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'challenge_win'
    and l.reference_day >= week_start
    and l.reference_day <= local_day;

  select count(*) filter (where u.usage_kind = 'words')::integer,
         count(*) filter (where u.usage_kind = 'phrases')::integer,
         count(*) filter (where u.usage_kind = 'activations')::integer
  into usage_words, usage_phrases, usage_activations
  from public.ica_daily_limit_usage u
  where u.user_id = v_user_id and u.usage_day = local_day;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into entries
  from (
    select jsonb_build_object(
      'id', l.id,
      'type', case l.entry_type when 'challenge_pass' then 'challenge_slot' else l.entry_type end,
      'delta', l.tokens_delta,
      'day', coalesce(l.reference_day, (l.created_at at time zone coalesce(tzn.name, 'UTC'))::date),
      'createdAt', floor(extract(epoch from l.created_at) * 1000)::bigint,
      'milestoneDays', case when l.entry_type in ('streak_milestone', 'flash_milestone') then l.reference_key::integer else null end,
      'phase', case when l.entry_type = 'phase_boost' then l.reference_key else null end,
      'challengeId', case when l.entry_type = 'challenge_win' then l.reference_key else null end,
      'rolled', nullif(l.metadata ->> 'rolled', '')::integer,
      'used', case when l.entry_type = 'challenge_pass' then cp.used_at is not null else null end
    ) as item
    from public.preguntica_token_ledger l
    left join pg_timezone_names tzn on tzn.name = coalesce(
      (select nullif(trim(p.timezone), '') from public.profiles p where p.id = v_user_id), 'UTC'
    )
    left join public.ica_challenge_passes cp on cp.ledger_entry_id = l.id
    where l.user_id = v_user_id
    order by l.created_at desc, l.id desc
    limit 40
  ) recent;

  return jsonb_build_object(
    'balance', balance,
    'today', local_day,
    'chestOpened', chest_row.id is not null,
    'chestCoins', coalesce(chest_row.tokens_delta, 0),
    'chestRolled', nullif(chest_row.metadata ->> 'rolled', '')::integer,
    'phaseBoosts', boosts,
    'unusedPasses', unused_pass_count,
    'claimedIcaMilestones', claimed_ica,
    'claimedFlashMilestones', claimed_flash,
    'challengeWinsThisWeek', wins,
    'icaStreak', public.ica_current_streak(v_user_id, 'ica'),
    'flashStreak', public.ica_current_streak(v_user_id, 'flashcards'),
    -- Coaching (Luis, 16 Oct): the app shows the same limits the server applies.
    'dailyLimitMultiplier', public.ica_daily_limit_multiplier(v_user_id),
    'usageToday', jsonb_build_object(
      'words', coalesce(usage_words, 0),
      'phrases', coalesce(usage_phrases, 0),
      'activations', coalesce(usage_activations, 0)
    ),
    'entries', entries
  );
end;
$$;

revoke all on function public.get_my_ica_coins_state() from public, anon;
grant execute on function public.get_my_ica_coins_state() to authenticated;

commit;
