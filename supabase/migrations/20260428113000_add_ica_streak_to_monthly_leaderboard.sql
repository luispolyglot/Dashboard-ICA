begin;

drop function if exists public.get_monthly_streak_leaderboard(integer);

create or replace function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  ica_streak_days integer,
  avg_percent numeric,
  review_percent numeric,
  creation_percent numeric
)
language sql
security definer
set search_path = public
as $$
  with month_bounds as (
    select
      date_trunc('month', now())::date as month_start,
      (date_trunc('month', now()) + interval '1 month')::date as month_end,
      extract(day from now())::numeric as elapsed_days
  ),
  user_progress as (
    select
      dm.user_id,
      sum(case when dm.review_goal_completed then 1 else 0 end)::numeric as review_days,
      sum(case when dm.creation_goal_completed then 1 else 0 end)::numeric as creation_days
    from public.daily_metrics dm
    cross join month_bounds mb
    where dm.day >= mb.month_start
      and dm.day < mb.month_end
    group by dm.user_id
  ),
  scores as (
    select
      up.user_id,
      round((up.review_days / nullif(mb.elapsed_days, 0)) * 100, 2) as review_percent,
      round((up.creation_days / nullif(mb.elapsed_days, 0)) * 100, 2) as creation_percent,
      round((((up.review_days / nullif(mb.elapsed_days, 0)) * 100) + ((up.creation_days / nullif(mb.elapsed_days, 0)) * 100)) / 2, 2) as avg_percent
    from user_progress up
    cross join month_bounds mb
  ),
  creation_days as (
    select
      dm.user_id,
      dm.day,
      dm.day - (row_number() over (partition by dm.user_id order by dm.day))::integer as grp
    from public.daily_metrics dm
    where dm.creation_goal_completed
      and dm.day <= current_date
  ),
  creation_streaks as (
    select
      cd.user_id,
      count(*)::integer as ica_streak_days,
      max(cd.day) as streak_end_day
    from creation_days cd
    group by cd.user_id, cd.grp
  ),
  latest_creation_streak as (
    select distinct on (cs.user_id)
      cs.user_id,
      cs.ica_streak_days
    from creation_streaks cs
    order by cs.user_id, cs.streak_end_day desc
  ),
  ranked as (
    select
      row_number() over (order by s.avg_percent desc, s.user_id) as rank,
      s.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      coalesce(lcs.ica_streak_days, 0) as ica_streak_days,
      s.avg_percent,
      s.review_percent,
      s.creation_percent
    from scores s
    left join public.profiles p on p.id = s.user_id
    left join latest_creation_streak lcs on lcs.user_id = s.user_id
  )
  select
    r.rank,
    r.user_id,
    r.username,
    r.display_name,
    r.ica_streak_days,
    r.avg_percent,
    r.review_percent,
    r.creation_percent
  from ranked r
  order by r.rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard(integer) from public;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

commit;
