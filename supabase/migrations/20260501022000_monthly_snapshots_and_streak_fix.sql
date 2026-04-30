begin;

create unique index if not exists leaderboard_monthly_user_unique
  on public.leaderboard_snapshots (period, period_start, user_id);

drop policy if exists "leaderboard_read_all" on public.leaderboard_snapshots;
drop policy if exists "leaderboard_read_super_admin" on public.leaderboard_snapshots;
create policy "leaderboard_read_super_admin"
on public.leaderboard_snapshots
for select
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

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
  with madrid_now as (
    select (now() at time zone 'Europe/Madrid') as now_spain
  ),
  month_bounds as (
    select
      date_trunc('month', mn.now_spain)::date as month_start,
      (date_trunc('month', mn.now_spain) + interval '1 month')::date as month_end,
      extract(day from mn.now_spain)::numeric as elapsed_days,
      mn.now_spain::date as today_spain
    from madrid_now mn
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
    cross join month_bounds mb
    where dm.creation_goal_completed
      and dm.day <= mb.today_spain
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
    cross join month_bounds mb
    where cs.streak_end_day between (mb.today_spain - interval '1 day')::date and mb.today_spain
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
      date_trunc('month', (now() at time zone 'Europe/Madrid') - interval '1 month')::date
    ) as month_start
  ),
  bounds as (
    select
      p.month_start,
      (p.month_start + interval '1 month')::date as month_end,
      extract(day from ((p.month_start + interval '1 month')::date - interval '1 day'))::numeric as month_days,
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
      b.month_last_day,
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
  now_spain timestamp := (now() at time zone 'Europe/Madrid');
  target_start date;
  affected_rows integer;
begin
  if extract(day from now_spain)::integer <> 1 then
    return 'skip:not-first-day-spain';
  end if;

  target_start := date_trunc('month', now_spain - interval '1 month')::date;
  affected_rows := public.snapshot_monthly_leaderboard(target_start, 500);
  return 'ok:' || affected_rows::text;
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'monthly_leaderboard_snapshot_spain';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'monthly_leaderboard_snapshot_spain',
    '15 * * * *',
    $cron$select public.run_monthly_leaderboard_snapshot_if_needed();$cron$
  );
end;
$$;

commit;
