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
  creation_percent numeric,
  is_creation_streak_frozen boolean
)
language sql
security definer
set search_path = public
as $$
  with user_context as (
    select distinct
      dm.user_id,
      coalesce(tzn.name, 'UTC') as timezone_name,
      (now() at time zone coalesce(tzn.name, 'UTC')) as now_local
    from public.daily_metrics dm
    left join public.profiles p on p.id = dm.user_id
    left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
  ),
  month_bounds as (
    select
      uc.user_id,
      date_trunc('month', uc.now_local)::date as month_start,
      (date_trunc('month', uc.now_local) + interval '1 month')::date as month_end,
      greatest(1, least(28, extract(day from uc.now_local)::integer))::numeric as elapsed_days,
      uc.now_local::date as today_local
    from user_context uc
  ),
  user_progress as (
    select
      mb.user_id,
      mb.elapsed_days,
      sum(case when dm.review_goal_completed then 1 else 0 end)::numeric as review_days,
      sum(case when dm.creation_goal_completed then 1 else 0 end)::numeric as creation_days
    from month_bounds mb
    join public.daily_metrics dm
      on dm.user_id = mb.user_id
     and dm.day >= mb.month_start
     and dm.day < mb.month_end
     and extract(day from dm.day)::integer <= mb.elapsed_days::integer
    group by mb.user_id, mb.elapsed_days
  ),
  scores as (
    select
      up.user_id,
      round((up.review_days / nullif(up.elapsed_days, 0)) * 100, 2) as review_percent,
      round((up.creation_days / nullif(up.elapsed_days, 0)) * 100, 2) as creation_percent,
      round((((up.review_days / nullif(up.elapsed_days, 0)) * 100) + ((up.creation_days / nullif(up.elapsed_days, 0)) * 100)) / 2, 2) as avg_percent
    from user_progress up
  ),
  creation_streaks as (
    select
      cst.user_id,
      sum(case when cst.creation_goal_completed then 1 else 0 end)::integer as ica_streak_days,
      max(cst.day) as streak_end_day
    from (
      select
        dm.user_id,
        dm.day,
        dm.creation_goal_completed,
        dm.day - (row_number() over (partition by dm.user_id order by dm.day))::integer as grp
      from public.daily_metrics dm
      join month_bounds mb on mb.user_id = dm.user_id
      where (dm.creation_goal_completed or dm.creation_streak_saved_at is not null)
        and dm.day <= mb.today_local
    ) cst
    group by cst.user_id, cst.grp
  ),
  current_creation_streak as (
    select distinct on (cs.user_id)
      cs.user_id,
      cs.ica_streak_days
    from creation_streaks cs
    join month_bounds mb on mb.user_id = cs.user_id
    where cs.streak_end_day between (mb.today_local - interval '1 day')::date and mb.today_local
    order by cs.user_id, cs.streak_end_day desc
  ),
  frozen_creation_streak as (
    select distinct on (cs.user_id)
      cs.user_id,
      cs.ica_streak_days
    from creation_streaks cs
    join month_bounds mb on mb.user_id = cs.user_id
    where cs.streak_end_day = (mb.today_local - interval '2 day')::date
    order by cs.user_id, cs.streak_end_day desc
  ),
  freeze_flags as (
    select
      mb.user_id,
      (
        not exists (
          select 1
          from public.daily_metrics dm
          where dm.user_id = mb.user_id
            and dm.day = mb.today_local
            and dm.creation_goal_completed
        )
        and (mb.today_local - interval '1 day')::date >= mb.month_start
        and not exists (
          select 1
          from public.daily_metrics dm
          where dm.user_id = mb.user_id
            and dm.day = (mb.today_local - interval '1 day')::date
            and (dm.creation_goal_completed or dm.creation_streak_saved_at is not null)
        )
        and exists (
          select 1
          from public.daily_metrics dm
          where dm.user_id = mb.user_id
            and dm.day = (mb.today_local - interval '2 day')::date
            and (dm.creation_goal_completed or dm.creation_streak_saved_at is not null)
        )
        and (
          select count(*)
          from public.daily_metrics dm
          where dm.user_id = mb.user_id
            and dm.day >= mb.month_start
            and dm.day < mb.month_end
            and dm.creation_streak_saved_at is not null
        ) < 3
      ) as is_creation_streak_frozen
    from month_bounds mb
  ),
  ranked as (
    select
      row_number() over (
        order by
          s.avg_percent desc,
          (
            case
              when coalesce(ff.is_creation_streak_frozen, false) and coalesce(ccs.ica_streak_days, 0) = 0
                then coalesce(fcs.ica_streak_days, 0)
              else coalesce(ccs.ica_streak_days, 0)
            end
          ) desc,
          s.user_id
      ) as rank,
      s.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      (
        case
          when coalesce(ff.is_creation_streak_frozen, false) and coalesce(ccs.ica_streak_days, 0) = 0
            then coalesce(fcs.ica_streak_days, 0)
          else coalesce(ccs.ica_streak_days, 0)
        end
      ) as ica_streak_days,
      s.avg_percent,
      s.review_percent,
      s.creation_percent,
      coalesce(ff.is_creation_streak_frozen, false) as is_creation_streak_frozen
    from scores s
    left join public.profiles p on p.id = s.user_id
    left join current_creation_streak ccs on ccs.user_id = s.user_id
    left join frozen_creation_streak fcs on fcs.user_id = s.user_id
    left join freeze_flags ff on ff.user_id = s.user_id
  )
  select
    r.rank,
    r.user_id,
    r.username,
    r.display_name,
    r.ica_streak_days,
    r.avg_percent,
    r.review_percent,
    r.creation_percent,
    r.is_creation_streak_frozen
  from ranked r
  order by r.rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard(integer) from public;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

commit;
