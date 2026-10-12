begin;

-- Rebuild the live RPC on top of the branch's daily-game and display-flag contract.
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
  display_flag text,
  daily_game_correct integer,
  listening_day_cap integer
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      core.*,
      date_trunc('month', now() at time zone coalesce(tzn.name, 'UTC'))::date as profile_month,
      fb.badge as featured_badge,
      df.lang as display_flag,
      floor.listening_points as october_score_floor,
      listening.listening_points as local_listening_points,
      listening.listening_day_cap
    from public.get_monthly_streak_leaderboard_core(100000) core
    left join public.profiles p on p.id = core.user_id
    left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
    left join public.ica_featured_badges fb on fb.user_id = core.user_id
    left join public.ica_display_flags df on df.user_id = core.user_id
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
          case
            when date_trunc('month', now())::date >= date '2026-11-01'
              then coalesce(s.daily_game_correct, 0)
            else 0
          end desc,
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
    r.display_flag,
    r.daily_game_correct,
    r.listening_day_cap
  from ranked r
  order by r.adjusted_rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard(integer) from public, anon;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

-- Keep the daily-game tie-break when the snapshot wrapper adjusts listening points.
create or replace function public.snapshot_monthly_leaderboard(
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
      coalesce(nullif(s.payload ->> 'daily_game_correct', '')::integer, 0) as daily_game_correct,
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
      b.daily_game_correct,
      coalesce(nullif(b.payload ->> 'avg_percent', '')::numeric, 0) as avg_percent,
      coalesce(nullif(b.payload ->> 'ica_streak_days', '')::integer, 0) as ica_streak_days
    from base b
  ),
  ranked as (
    select
      a.*,
      row_number() over (
        order by
          a.total_points desc,
          case
            when target_month >= date '2026-11-01' then a.daily_game_correct
            else 0
          end desc,
          a.avg_percent desc,
          a.ica_streak_days desc,
          a.user_id
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
