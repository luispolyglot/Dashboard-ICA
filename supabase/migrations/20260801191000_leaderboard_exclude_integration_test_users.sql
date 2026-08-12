begin;

create or replace function public.get_total_icademers_clean()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.profiles p
  where coalesce(p.username, '') !~* '^integration\.'
    and coalesce(p.display_name, '') !~* '^integration\.';
$$;

revoke all on function public.get_total_icademers_clean() from public;
grant execute on function public.get_total_icademers_clean() to authenticated;

create or replace function public.get_monthly_streak_leaderboard_clean(limit_count integer default 20)
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
  total_points numeric
)
language sql
security definer
set search_path = public
as $$
  with raw as (
    select *
    from public.get_monthly_streak_leaderboard(greatest(limit_count * 10, 500))
  ),
  filtered as (
    select *
    from raw
    where coalesce(username, '') !~* '^integration\.'
      and coalesce(display_name, '') !~* '^integration\.'
  )
  select
    row_number() over (
      order by total_points desc, avg_percent desc, coalesce(ica_streak_days, 0) desc, user_id
    )::bigint as rank,
    user_id,
    username,
    display_name,
    ica_streak_days,
    avg_percent,
    review_percent,
    creation_percent,
    is_creation_streak_frozen,
    ica_test_points,
    listening_points,
    preguntica_points,
    instagram_points,
    total_points
  from filtered
  order by rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard_clean(integer) from public;
grant execute on function public.get_monthly_streak_leaderboard_clean(integer) to authenticated;

create or replace function public.get_monthly_snapshot_leaderboard_clean(
  p_period_start date,
  limit_count integer default 33,
  include_user_id uuid default auth.uid()
)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  ica_streak_days integer,
  avg_percent numeric,
  review_percent numeric,
  creation_percent numeric,
  ica_test_points numeric,
  listening_points numeric,
  preguntica_points numeric,
  instagram_points numeric,
  total_points numeric,
  score integer
)
language sql
security definer
set search_path = public
as $$
  with raw as (
    select *
    from public.get_monthly_snapshot_leaderboard(
      p_period_start,
      greatest(limit_count * 10, 500),
      include_user_id
    )
  ),
  filtered as (
    select *
    from raw
    where coalesce(username, '') !~* '^integration\.'
      and coalesce(display_name, '') !~* '^integration\.'
  )
  select
    row_number() over (order by rank, user_id)::bigint as rank,
    user_id,
    username,
    display_name,
    ica_streak_days,
    avg_percent,
    review_percent,
    creation_percent,
    ica_test_points,
    listening_points,
    preguntica_points,
    instagram_points,
    total_points,
    score
  from filtered
  order by rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_snapshot_leaderboard_clean(date, integer, uuid) from public;
grant execute on function public.get_monthly_snapshot_leaderboard_clean(date, integer, uuid) to authenticated;

commit;
