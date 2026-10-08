begin;

alter table public.master_note_listening_ingest_log
  add column if not exists occurred_at timestamptz,
  add column if not exists local_day date,
  add column if not exists timezone_name text;

create index if not exists master_note_listening_ingest_log_user_local_day_idx
  on public.master_note_listening_ingest_log (user_id, local_day)
  where local_day is not null;

create table if not exists public.master_note_listening_monthly_score_floors (
  period_start date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  listening_points numeric not null default 0,
  captured_at timestamptz not null default now(),
  primary key (period_start, user_id),
  check (listening_points >= 0)
);

alter table public.master_note_listening_monthly_score_floors enable row level security;
revoke all on public.master_note_listening_monthly_score_floors from public, anon, authenticated;

-- Freeze every user's current October score so the correction cannot take points away.
with profile_clock as (
  select
    p.id as user_id,
    coalesce(tzn.name, 'UTC') as timezone_name,
    now() at time zone coalesce(tzn.name, 'UTC') as local_now
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
),
bounds as (
  select
    pc.user_id,
    pc.timezone_name,
    date_trunc('month', pc.local_now)::date as month_start,
    least(28, greatest(1, extract(day from pc.local_now)::integer)) as day_cap
  from profile_clock pc
),
daily_seconds as (
  select
    m.user_id,
    m.day,
    sum(m.listened_seconds)::bigint as listened_seconds
  from public.master_note_listening_daily_metrics m
  join bounds b on b.user_id = m.user_id
  where date_trunc('month', m.day)::date = date '2026-10-01'
    and m.day >= date '2026-10-01'
    and m.day < date '2026-11-01'
    and extract(day from m.day)::integer <= b.day_cap
  group by m.user_id, m.day
),
legacy_points as (
  select
    b.user_id,
    coalesce(
      sum(case when d.listened_seconds >= 600 then 0.1::numeric else 0::numeric end),
      0::numeric
    ) as listening_points
  from bounds b
  left join daily_seconds d on d.user_id = b.user_id
  where b.month_start = date '2026-10-01'
  group by b.user_id
)
insert into public.master_note_listening_monthly_score_floors (
  period_start,
  user_id,
  listening_points
)
select date '2026-10-01', lp.user_id, lp.listening_points
from legacy_points lp
on conflict (period_start, user_id) do nothing;

create or replace function public.get_user_monthly_listening_score(
  p_user_id uuid,
  p_month_start date default null,
  p_day_cap integer default null
)
returns table (
  listening_points numeric,
  listening_day_cap integer
)
language sql
stable
security definer
set search_path = public
as $$
  with user_clock as (
    select
      coalesce(
        (
          select tzn.name
          from public.profiles p
          left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
          where p.id = p_user_id
        ),
        'UTC'
      ) as timezone_name,
      now() as now_utc
  ),
  bounds as (
    select
      uc.timezone_name,
      (uc.now_utc at time zone uc.timezone_name) as now_local,
      coalesce(
        p_month_start,
        date_trunc('month', uc.now_utc at time zone uc.timezone_name)::date
      ) as month_start,
      least(
        28,
        greatest(
          1,
          coalesce(
            p_day_cap,
            case
              when p_month_start is null
                or p_month_start = date_trunc('month', uc.now_utc at time zone uc.timezone_name)::date
                then extract(day from (uc.now_utc at time zone uc.timezone_name))::integer
              else 28
            end
          )
        )
      ) as day_cap
    from user_clock uc
  ),
  event_days as (
    select
      case
        when l.local_day is not null then l.local_day
        when l.occurred_at is not null then
          (l.occurred_at at time zone coalesce(nullif(l.timezone_name, ''), b.timezone_name))::date
        when (l.created_at at time zone 'UTC')::date > l.day + 1 then null
        else (l.created_at at time zone b.timezone_name)::date
      end as listening_day,
      l.delta_seconds
    from public.master_note_listening_ingest_log l
    cross join bounds b
    where l.user_id = p_user_id
      and l.delta_seconds > 0
  ),
  daily_seconds as (
    select
      ed.listening_day,
      sum(ed.delta_seconds)::bigint as listened_seconds
    from event_days ed
    cross join bounds b
    where ed.listening_day >= b.month_start
      and ed.listening_day < (b.month_start + interval '1 month')::date
      and extract(day from ed.listening_day)::integer <= b.day_cap
    group by ed.listening_day
  )
  select
    coalesce(
      sum(case when ds.listened_seconds >= 600 then 0.1::numeric else 0::numeric end),
      0::numeric
    ),
    b.day_cap
  from bounds b
  left join daily_seconds ds on true
  group by b.day_cap;
$$;

revoke all on function public.get_user_monthly_listening_score(uuid, date, integer)
  from public, anon, authenticated;

create or replace function public.get_my_monthly_listening_seconds(
  p_month_start date,
  p_target_lang text,
  p_native_lang text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
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
    and lower(l.native_lang) = lower(trim(p_native_lang))
    and event_day.listening_day >= p_month_start
    and event_day.listening_day < (p_month_start + interval '1 month')::date;

  return listened_seconds;
end;
$$;

revoke all on function public.get_my_monthly_listening_seconds(date, text, text)
  from public, anon;
grant execute on function public.get_my_monthly_listening_seconds(date, text, text)
  to authenticated;

create or replace function public.bump_master_note_listening_metrics(
  p_event_id text,
  p_day date,
  p_target_lang text,
  p_native_lang text,
  p_delta_seconds integer,
  p_occurred_at timestamptz
)
returns table (listened_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
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
    on conflict (user_id, day, target_lang, native_lang)
    do update
      set listened_seconds = public.master_note_listening_daily_metrics.listened_seconds + safe_delta;
  end if;

  return query
  select m.listened_seconds
  from public.master_note_listening_daily_metrics m
  where m.user_id = current_user_id
    and m.day = user_local_day
    and m.target_lang = safe_target_lang
    and m.native_lang = safe_native_lang;
end;
$$;

revoke all on function public.bump_master_note_listening_metrics(text, date, text, text, integer, timestamptz)
  from public, anon;
grant execute on function public.bump_master_note_listening_metrics(text, date, text, text, integer, timestamptz)
  to authenticated;

drop function public.get_monthly_streak_leaderboard(integer);
create function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  ica_streak_days integer,
  avg_percent numeric,
  review_percent numeric,
  creation_percent numeric,
  is_creation_streak_frozen boolean,
  ica_test_points numeric,
  listening_points numeric,
  preguntica_points numeric,
  instagram_points numeric,
  total_points numeric,
  featured_badge text,
  listening_day_cap integer
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      core.*,
      coalesce(tzn.name, 'UTC') as profile_timezone,
      date_trunc('month', now() at time zone coalesce(tzn.name, 'UTC'))::date as profile_month,
      fb.badge as featured_badge,
      floor.listening_points as october_score_floor,
      listening.listening_points as local_listening_points,
      listening.listening_day_cap
    from public.get_monthly_streak_leaderboard_core(100000) core
    left join public.profiles p on p.id = core.user_id
    left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
    left join public.ica_featured_badges fb on fb.user_id = core.user_id
    left join public.master_note_listening_monthly_score_floors floor
      on floor.user_id = core.user_id and floor.period_start = date '2026-10-01'
    cross join lateral public.get_user_monthly_listening_score(core.user_id, null, null) listening
  ),
  adjusted as (
    select
      b.*,
      case
        when b.profile_month = date '2026-10-01'
          then greatest(
            coalesce(b.october_score_floor, 0),
            coalesce(b.listening_points, 0),
            b.local_listening_points
          )
        else b.local_listening_points
      end as adjusted_listening_points
    from base b
  ),
  scored as (
    select
      a.*,
      round(
        a.total_points - coalesce(a.listening_points, 0) + a.adjusted_listening_points,
        2
      ) as adjusted_total_points
    from adjusted a
  ),
  ranked as (
    select
      row_number() over (
        order by
          s.adjusted_total_points desc,
          s.avg_percent desc,
          s.ica_streak_days desc,
          s.user_id
      ) as adjusted_rank,
      s.*
    from scored s
  )
  select
    r.adjusted_rank,
    r.user_id,
    r.username,
    r.display_name,
    r.ica_streak_days,
    r.avg_percent,
    r.review_percent,
    r.creation_percent,
    r.is_creation_streak_frozen,
    r.ica_test_points,
    r.adjusted_listening_points,
    r.preguntica_points,
    r.instagram_points,
    r.adjusted_total_points,
    r.featured_badge,
    r.listening_day_cap
  from ranked r
  order by r.adjusted_rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard(integer) from public, anon;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

alter function public.snapshot_monthly_leaderboard(date, integer)
  rename to snapshot_monthly_leaderboard_core;
revoke all on function public.snapshot_monthly_leaderboard_core(date, integer)
  from public, anon, authenticated;

create function public.snapshot_monthly_leaderboard(
  p_month_start date default null,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_month date := coalesce(
    p_month_start,
    date_trunc('month', (now() at time zone 'UTC') - interval '1 month')::date
  );
  affected_rows integer;
begin
  if target_month < date '2026-10-01' then
    return public.snapshot_monthly_leaderboard_core(target_month, p_limit);
  end if;

  affected_rows := public.snapshot_monthly_leaderboard_core(
    target_month,
    greatest(coalesce(p_limit, 500), 100000)
  );

  with base as (
      select
        s.user_id,
        s.payload,
        floor.listening_points as october_score_floor,
        coalesce(nullif(s.payload ->> 'listening_points', '')::numeric, 0) as previous_listening_points,
        coalesce(nullif(s.payload ->> 'total_points', '')::numeric, 0) as previous_total_points,
        listening.listening_points as local_listening_points
      from public.leaderboard_snapshots s
      left join public.master_note_listening_monthly_score_floors floor
        on floor.user_id = s.user_id and floor.period_start = date '2026-10-01'
      cross join lateral public.get_user_monthly_listening_score(s.user_id, target_month, 28) listening
      where s.period = 'monthly'
        and s.period_start = target_month
    ),
    adjusted as (
      select
        b.user_id,
        case
          when target_month = date '2026-10-01'
            then greatest(
              coalesce(b.october_score_floor, 0),
              b.previous_listening_points,
              b.local_listening_points
            )
          else b.local_listening_points
        end as listening_points,
        round(
          b.previous_total_points - b.previous_listening_points
          + case
              when target_month = date '2026-10-01'
                then greatest(
                  coalesce(b.october_score_floor, 0),
                  b.previous_listening_points,
                  b.local_listening_points
                )
              else b.local_listening_points
            end,
          2
        ) as total_points,
        coalesce(nullif(b.payload ->> 'avg_percent', '')::numeric, 0) as avg_percent,
        coalesce(nullif(b.payload ->> 'ica_streak_days', '')::integer, 0) as ica_streak_days
      from base b
    ),
    ranked as (
      select
        a.*,
        row_number() over (
          order by a.total_points desc, a.avg_percent desc, a.ica_streak_days desc, a.user_id
        )::integer as new_rank
      from adjusted a
    )
  update public.leaderboard_snapshots s
  set
    rank = r.new_rank,
    score = round(r.total_points * 10)::integer,
    payload = s.payload || jsonb_build_object(
      'listening_points', r.listening_points,
      'total_points', r.total_points
    )
  from ranked r
  where s.period = 'monthly'
    and s.period_start = target_month
    and s.user_id = r.user_id;

  return affected_rows;
end;
$$;

revoke all on function public.snapshot_monthly_leaderboard(date, integer)
  from public, anon, authenticated;
grant execute on function public.snapshot_monthly_leaderboard(date, integer)
  to service_role;

commit;
