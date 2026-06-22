begin;

alter table public.daily_metrics
  add column if not exists creation_streak_saved_at timestamptz;

create or replace function public.save_creation_streak_day(p_day date default null)
returns table (
  saved_day date,
  saves_used_this_month integer,
  saves_left_this_month integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  tz text;
  today_local date;
  month_start date;
  month_end date;
  target_day date;
  used_count integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = current_user_id),
    'UTC'
  );

  today_local := (now() at time zone tz)::date;
  month_start := date_trunc('month', today_local::timestamp)::date;
  month_end := (month_start + interval '1 month - 1 day')::date;
  target_day := coalesce(p_day, today_local - 1);

  if target_day < month_start or target_day > month_end then
    raise exception 'DAY_OUT_OF_CURRENT_MONTH';
  end if;

  if target_day >= today_local then
    raise exception 'DAY_NOT_ELIGIBLE';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text || ':salvadica:' || month_start::text));

  select count(*)::integer
  into used_count
  from public.daily_metrics dm
  where dm.user_id = current_user_id
    and dm.day >= month_start
    and dm.day <= month_end
    and dm.creation_streak_saved_at is not null;

  if used_count >= 3 then
    raise exception 'SAVE_LIMIT_REACHED';
  end if;

  insert into public.daily_metrics (user_id, day)
  values (current_user_id, target_day)
  on conflict (user_id, day)
  do nothing;

  if exists (
    select 1
    from public.daily_metrics dm
    where dm.user_id = current_user_id
      and dm.day = target_day
      and dm.creation_goal_completed
  ) then
    raise exception 'DAY_ALREADY_COMPLETED';
  end if;

  if exists (
    select 1
    from public.daily_metrics dm
    where dm.user_id = current_user_id
      and dm.day = target_day
      and dm.creation_streak_saved_at is not null
  ) then
    raise exception 'DAY_ALREADY_SAVED';
  end if;

  update public.daily_metrics dm
  set
    creation_streak_saved_at = now(),
    day = dm.day
  where dm.user_id = current_user_id
    and dm.day = target_day
    and dm.creation_streak_saved_at is null
  returning dm.day
  into saved_day;

  if saved_day is null then
    raise exception 'DAY_NOT_ELIGIBLE';
  end if;

  select count(*)::integer
  into used_count
  from public.daily_metrics dm
  where dm.user_id = current_user_id
    and dm.day >= month_start
    and dm.day <= month_end
    and dm.creation_streak_saved_at is not null;

  return query
  select
    saved_day,
    used_count,
    greatest(0, 3 - used_count);
end;
$$;

revoke all on function public.save_creation_streak_day(date) from public;
grant execute on function public.save_creation_streak_day(date) to authenticated;

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
  ica_test_points numeric,
  total_points numeric
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
  ica_scores as (
    select
      it.user_id,
      round(max(it.score)::numeric / 10, 2) as ica_test_points
    from public.ica_tests it
    join month_bounds mb
      on mb.user_id = it.user_id
     and it.test_month = mb.month_start
    where it.status = 'completed'
    group by it.user_id
  ),
  scores_with_ica as (
    select
      s.user_id,
      s.avg_percent,
      s.review_percent,
      s.creation_percent,
      ics.ica_test_points,
      round((s.avg_percent / 10) + coalesce(ics.ica_test_points, 0), 2) as total_points
    from scores s
    left join ica_scores ics on ics.user_id = s.user_id
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
  ranked as (
    select
      row_number() over (
        order by swi.total_points desc, swi.avg_percent desc, coalesce(ccs.ica_streak_days, 0) desc, swi.user_id
      ) as rank,
      swi.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      coalesce(ccs.ica_streak_days, 0) as ica_streak_days,
      swi.avg_percent,
      swi.review_percent,
      swi.creation_percent,
      swi.ica_test_points,
      swi.total_points
    from scores_with_ica swi
    left join public.profiles p on p.id = swi.user_id
    left join current_creation_streak ccs on ccs.user_id = swi.user_id
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
    r.ica_test_points,
    r.total_points
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
  ica_scores as (
    select
      it.user_id,
      round(max(it.score)::numeric / 10, 2) as ica_test_points
    from public.ica_tests it
    cross join bounds b
    where it.status = 'completed'
      and it.test_month = b.month_start
    group by it.user_id
  ),
  scores_with_ica as (
    select
      s.user_id,
      s.avg_percent,
      s.review_percent,
      s.creation_percent,
      ics.ica_test_points,
      round((s.avg_percent / 10) + coalesce(ics.ica_test_points, 0), 2) as total_points
    from scores s
    left join ica_scores ics on ics.user_id = s.user_id
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
      cross join bounds b
      where (dm.creation_goal_completed or dm.creation_streak_saved_at is not null)
        and dm.day <= b.month_last_day
    ) cst
    group by cst.user_id, cst.grp
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
      row_number() over (
        order by swi.total_points desc, swi.avg_percent desc, coalesce(ccs.ica_streak_days, 0) desc, swi.user_id
      ) as rank,
      swi.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      coalesce(ccs.ica_streak_days, 0) as ica_streak_days,
      swi.avg_percent,
      swi.review_percent,
      swi.creation_percent,
      swi.ica_test_points,
      swi.total_points
    from scores_with_ica swi
    left join public.profiles p on p.id = swi.user_id
    left join current_creation_streak ccs on ccs.user_id = swi.user_id
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
      round(r.total_points * 10)::integer as score,
      r.rank::integer,
      jsonb_build_object(
        'avg_percent', r.avg_percent,
        'review_percent', r.review_percent,
        'creation_percent', r.creation_percent,
        'ica_streak_days', r.ica_streak_days,
        'username', r.username,
        'display_name', r.display_name,
        'ica_test_points', r.ica_test_points,
        'total_points', r.total_points
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

commit;
