begin;

create or replace function public.get_monthly_snapshot_leaderboard(
  p_period_start date,
  limit_count integer default 30,
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
  score integer
)
language sql
security definer
set search_path = public
as $$
  with parsed as (
    select
      ls.rank::bigint as rank,
      ls.user_id,
      coalesce(nullif(ls.payload ->> 'username', ''), 'anon') as username,
      coalesce(
        nullif(ls.payload ->> 'display_name', ''),
        nullif(ls.payload ->> 'username', ''),
        'Usuario'
      ) as display_name,
      coalesce((ls.payload ->> 'ica_streak_days')::integer, 0) as ica_streak_days,
      coalesce((ls.payload ->> 'avg_percent')::numeric, 0) as avg_percent,
      coalesce((ls.payload ->> 'review_percent')::numeric, 0) as review_percent,
      coalesce((ls.payload ->> 'creation_percent')::numeric, 0) as creation_percent,
      ls.score
    from public.leaderboard_snapshots ls
    where ls.period = 'monthly'
      and ls.period_start = p_period_start
  ),
  top_rows as (
    select *
    from parsed
    order by rank
    limit greatest(limit_count, 1)
  ),
  user_row as (
    select *
    from parsed
    where user_id = include_user_id
    limit 1
  ),
  combined as (
    select * from top_rows
    union all
    select ur.*
    from user_row ur
    where not exists (
      select 1 from top_rows tr where tr.user_id = ur.user_id
    )
  )
  select
    c.rank,
    c.user_id,
    c.username,
    c.display_name,
    c.ica_streak_days,
    c.avg_percent,
    c.review_percent,
    c.creation_percent,
    c.score
  from combined c
  order by c.rank;
$$;

revoke all on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) from public;
grant execute on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) to authenticated;

commit;
