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
  creation_days as (
    select
      dm.user_id,
      dm.day,
      dm.day - (row_number() over (partition by dm.user_id order by dm.day))::integer as grp
    from public.daily_metrics dm
    join month_bounds mb on mb.user_id = dm.user_id
    where dm.creation_goal_completed
      and dm.day <= mb.today_local
  ),
  creation_streaks as (
    select
      cd.user_id,
      count(*)::integer as ica_streak_days,
      max(cd.day) as streak_end_day
    from creation_days cd
    group by cd.user_id, cd.grp
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
  ranked as (
    select
      row_number() over (order by s.avg_percent desc, s.user_id) as rank,
      s.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      coalesce(ccs.ica_streak_days, 0) as ica_streak_days,
      s.avg_percent,
      s.review_percent,
      s.creation_percent
    from scores s
    left join public.profiles p on p.id = s.user_id
    left join current_creation_streak ccs on ccs.user_id = s.user_id
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

create or replace function public.snapshot_monthly_leaderboard(
  p_month_start date default null,
  p_limit integer default 500
)
returns integer
language sql
security definer
set search_path = public
as $$
  with period as (
    select coalesce(
      p_month_start,
      date_trunc('month', (now() at time zone 'UTC') - interval '1 month')::date
    ) as month_start
  ),
  bounds as (
    select
      p.month_start,
      (p.month_start + interval '1 month')::date as month_end,
      (p.month_start + interval '27 days')::date as cutoff_day,
      28::numeric as month_days,
      ((p.month_start + interval '1 month')::date - interval '1 day')::date as month_last_day
    from period p
  ),
  user_progress as (
    select
      dm.user_id,
      sum(case when dm.review_goal_completed then 1 else 0 end)::numeric as review_days,
      sum(case when dm.creation_goal_completed then 1 else 0 end)::numeric as creation_days
    from public.daily_metrics dm
    cross join bounds b
    where dm.day >= b.month_start
      and dm.day < b.month_end
      and dm.day <= b.cutoff_day
    group by dm.user_id
  ),
  scores as (
    select
      up.user_id,
      round((up.review_days / nullif(b.month_days, 0)) * 100, 2) as review_percent,
      round((up.creation_days / nullif(b.month_days, 0)) * 100, 2) as creation_percent,
      round((((up.review_days / nullif(b.month_days, 0)) * 100) + ((up.creation_days / nullif(b.month_days, 0)) * 100)) / 2, 2) as avg_percent
    from user_progress up
    cross join bounds b
  ),
  creation_days as (
    select
      dm.user_id,
      dm.day,
      dm.day - (row_number() over (partition by dm.user_id order by dm.day))::integer as grp
    from public.daily_metrics dm
    cross join bounds b
    where dm.creation_goal_completed
      and dm.day <= b.month_last_day
  ),
  creation_streaks as (
    select
      cd.user_id,
      count(*)::integer as ica_streak_days,
      max(cd.day) as streak_end_day
    from creation_days cd
    group by cd.user_id, cd.grp
  ),
  current_creation_streak as (
    select distinct on (cs.user_id)
      cs.user_id,
      cs.ica_streak_days
    from creation_streaks cs
    cross join bounds b
    where cs.streak_end_day between (b.month_last_day - interval '1 day')::date and b.month_last_day
    order by cs.user_id, cs.streak_end_day desc
  ),
  ranked as (
    select
      row_number() over (order by s.avg_percent desc, s.user_id) as rank,
      s.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      coalesce(ccs.ica_streak_days, 0) as ica_streak_days,
      s.avg_percent,
      s.review_percent,
      s.creation_percent
    from scores s
    left join public.profiles p on p.id = s.user_id
    left join current_creation_streak ccs on ccs.user_id = s.user_id
  ),
  upserted as (
    insert into public.leaderboard_snapshots (
      period,
      period_start,
      period_end,
      user_id,
      score,
      rank,
      payload
    )
    select
      'monthly',
      b.month_start,
      b.cutoff_day,
      r.user_id,
      round(r.avg_percent)::integer as score,
      r.rank::integer,
      jsonb_build_object(
        'avg_percent', r.avg_percent,
        'review_percent', r.review_percent,
        'creation_percent', r.creation_percent,
        'ica_streak_days', r.ica_streak_days,
        'username', r.username,
        'display_name', r.display_name
      )
    from ranked r
    cross join bounds b
    where r.rank <= greatest(p_limit, 1)
    on conflict (period, period_start, user_id)
    do update set
      period_end = excluded.period_end,
      score = excluded.score,
      rank = excluded.rank,
      payload = excluded.payload,
      created_at = now()
    returning 1
  )
  select count(*)::integer from upserted;
$$;

create or replace function public.run_monthly_leaderboard_snapshot_if_needed()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  now_utc timestamp := (now() at time zone 'UTC');
  target_start date;
  affected_rows integer;
begin
  if extract(day from now_utc)::integer <> 1 or extract(hour from now_utc)::integer < 13 then
    return 'skip:not-ready-utc-window';
  end if;

  target_start := date_trunc('month', now_utc - interval '1 month')::date;
  affected_rows := public.snapshot_monthly_leaderboard(target_start, 500);
  return 'ok:' || affected_rows::text;
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in ('monthly_leaderboard_snapshot_spain', 'monthly_leaderboard_snapshot_utc')
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'monthly_leaderboard_snapshot_utc',
    '15 * 1 * *',
    $cron$select public.run_monthly_leaderboard_snapshot_if_needed();$cron$
  );
end;
$$;

update public.leaderboard_snapshots
set period_end = (date_trunc('month', period_start) + interval '27 days')::date
where period = 'monthly';

commit;
