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
      uc.timezone_name,
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
  listening_daily_points as (
    select
      mb.user_id,
      mnl.day,
      least(sum(mnl.listened_seconds)::numeric / 6000, 0.1::numeric) as daily_points
    from month_bounds mb
    join public.master_note_listening_daily_metrics mnl
      on mnl.user_id = mb.user_id
     and mnl.day >= mb.month_start
     and mnl.day < mb.month_end
     and extract(day from mnl.day)::integer <= mb.elapsed_days::integer
    group by mb.user_id, mnl.day
  ),
  listening_scores as (
    select
      ldp.user_id,
      round(sum(ldp.daily_points), 2) as listening_points
    from listening_daily_points ldp
    group by ldp.user_id
  ),
  preguntica_scores as (
    select
      mb.user_id,
      least(count(*)::numeric * 2, 8::numeric) as preguntica_points
    from month_bounds mb
    join public.preguntica_attempts pa
      on pa.user_id = mb.user_id
     and pa.attempt_kind = 'weekly'
     and pa.status = 'completed'
     and (pa.created_at at time zone mb.timezone_name)::date >= mb.month_start
     and (pa.created_at at time zone mb.timezone_name)::date < mb.month_end
     and (pa.updated_at at time zone mb.timezone_name)::date >= mb.month_start
     and (pa.updated_at at time zone mb.timezone_name)::date < mb.month_end
     and extract(day from (pa.created_at at time zone mb.timezone_name)::date)::integer <= mb.elapsed_days::integer
     and extract(day from (pa.updated_at at time zone mb.timezone_name)::date)::integer <= mb.elapsed_days::integer
    group by mb.user_id
  ),
  instagram_scores as (
    select
      mb.user_id,
      least(count(distinct itp.day_index)::numeric * 0.5, 14::numeric) as instagram_points
    from month_bounds mb
    join public.instagram_track_posts itp
      on itp.user_id = mb.user_id
     and itp.track_month = mb.month_start
     and itp.day_index <= mb.elapsed_days::integer
     and nullif(btrim(itp.post_url), '') is not null
    group by mb.user_id
  ),
  scores_with_points as (
    select
      s.user_id,
      s.avg_percent,
      s.review_percent,
      s.creation_percent,
      ics.ica_test_points,
      coalesce(ls.listening_points, 0) as listening_points,
      coalesce(ps.preguntica_points, 0) as preguntica_points,
      coalesce(igs.instagram_points, 0) as instagram_points,
      round(
        (s.avg_percent / 10)
        + coalesce(ics.ica_test_points, 0)
        + coalesce(ls.listening_points, 0)
        + coalesce(ps.preguntica_points, 0)
        + coalesce(igs.instagram_points, 0),
        2
      ) as total_points
    from scores s
    left join ica_scores ics on ics.user_id = s.user_id
    left join listening_scores ls on ls.user_id = s.user_id
    left join preguntica_scores ps on ps.user_id = s.user_id
    left join instagram_scores igs on igs.user_id = s.user_id
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
          swp.total_points desc,
          swp.avg_percent desc,
          (
            case
              when coalesce(ff.is_creation_streak_frozen, false) and coalesce(ccs.ica_streak_days, 0) = 0
                then coalesce(fcs.ica_streak_days, 0)
              else coalesce(ccs.ica_streak_days, 0)
            end
          ) desc,
          swp.user_id
      ) as rank,
      swp.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      (
        case
          when coalesce(ff.is_creation_streak_frozen, false) and coalesce(ccs.ica_streak_days, 0) = 0
            then coalesce(fcs.ica_streak_days, 0)
          else coalesce(ccs.ica_streak_days, 0)
        end
      ) as ica_streak_days,
      swp.avg_percent,
      swp.review_percent,
      swp.creation_percent,
      coalesce(ff.is_creation_streak_frozen, false) as is_creation_streak_frozen,
      swp.ica_test_points,
      swp.listening_points,
      swp.preguntica_points,
      swp.instagram_points,
      swp.total_points
    from scores_with_points swp
    left join public.profiles p on p.id = swp.user_id
    left join current_creation_streak ccs on ccs.user_id = swp.user_id
    left join frozen_creation_streak fcs on fcs.user_id = swp.user_id
    left join freeze_flags ff on ff.user_id = swp.user_id
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
    r.is_creation_streak_frozen,
    r.ica_test_points,
    r.listening_points,
    r.preguntica_points,
    r.instagram_points,
    r.total_points
  from ranked r
  order by r.rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard(integer) from public;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

create or replace function public.get_monthly_snapshot_leaderboard(
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
      nullif(ls.payload ->> 'ica_test_points', '')::numeric as ica_test_points,
      coalesce(nullif(ls.payload ->> 'listening_points', '')::numeric, 0) as listening_points,
      coalesce(nullif(ls.payload ->> 'preguntica_points', '')::numeric, 0) as preguntica_points,
      coalesce(nullif(ls.payload ->> 'instagram_points', '')::numeric, 0) as instagram_points,
      coalesce(
        nullif(ls.payload ->> 'total_points', '')::numeric,
        round(
          (coalesce((ls.payload ->> 'avg_percent')::numeric, 0) / 10)
          + coalesce(nullif(ls.payload ->> 'ica_test_points', '')::numeric, 0)
          + coalesce(nullif(ls.payload ->> 'listening_points', '')::numeric, 0)
          + coalesce(nullif(ls.payload ->> 'preguntica_points', '')::numeric, 0)
          + coalesce(nullif(ls.payload ->> 'instagram_points', '')::numeric, 0),
          2
        )
      ) as total_points,
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
    c.ica_test_points,
    c.listening_points,
    c.preguntica_points,
    c.instagram_points,
    c.total_points,
    c.score
  from combined c
  order by c.rank;
$$;

revoke all on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) from public;
grant execute on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) to authenticated;

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
  listening_daily_points as (
    select
      mnl.user_id,
      mnl.day,
      least(sum(mnl.listened_seconds)::numeric / 6000, 0.1::numeric) as daily_points
    from public.master_note_listening_daily_metrics mnl
    cross join bounds b
    where mnl.day >= b.month_start
      and mnl.day < b.month_end
      and mnl.day <= b.cutoff_day
    group by mnl.user_id, mnl.day
  ),
  listening_scores as (
    select
      ldp.user_id,
      round(sum(ldp.daily_points), 2) as listening_points
    from listening_daily_points ldp
    group by ldp.user_id
  ),
  preguntica_scores as (
    select
      pa.user_id,
      least(count(*)::numeric * 2, 8::numeric) as preguntica_points
    from public.preguntica_attempts pa
    cross join bounds b
    where pa.attempt_kind = 'weekly'
      and pa.status = 'completed'
      and (pa.created_at at time zone 'UTC')::date >= b.month_start
      and (pa.created_at at time zone 'UTC')::date <= b.cutoff_day
      and (pa.updated_at at time zone 'UTC')::date >= b.month_start
      and (pa.updated_at at time zone 'UTC')::date <= b.cutoff_day
    group by pa.user_id
  ),
  instagram_scores as (
    select
      itp.user_id,
      least(count(distinct itp.day_index)::numeric * 0.5, 14::numeric) as instagram_points
    from public.instagram_track_posts itp
    cross join bounds b
    where itp.track_month = b.month_start
      and itp.day_index <= 28
      and nullif(btrim(itp.post_url), '') is not null
    group by itp.user_id
  ),
  scores_with_points as (
    select
      s.user_id,
      s.avg_percent,
      s.review_percent,
      s.creation_percent,
      ics.ica_test_points,
      coalesce(ls.listening_points, 0) as listening_points,
      coalesce(ps.preguntica_points, 0) as preguntica_points,
      coalesce(igs.instagram_points, 0) as instagram_points,
      round(
        (s.avg_percent / 10)
        + coalesce(ics.ica_test_points, 0)
        + coalesce(ls.listening_points, 0)
        + coalesce(ps.preguntica_points, 0)
        + coalesce(igs.instagram_points, 0),
        2
      ) as total_points
    from scores s
    left join ica_scores ics on ics.user_id = s.user_id
    left join listening_scores ls on ls.user_id = s.user_id
    left join preguntica_scores ps on ps.user_id = s.user_id
    left join instagram_scores igs on igs.user_id = s.user_id
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
      row_number() over (
        order by swp.total_points desc, swp.avg_percent desc, coalesce(ccs.ica_streak_days, 0) desc, swp.user_id
      ) as rank,
      swp.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      coalesce(ccs.ica_streak_days, 0) as ica_streak_days,
      swp.avg_percent,
      swp.review_percent,
      swp.creation_percent,
      swp.ica_test_points,
      swp.listening_points,
      swp.preguntica_points,
      swp.instagram_points,
      swp.total_points
    from scores_with_points swp
    left join public.profiles p on p.id = swp.user_id
    left join current_creation_streak ccs on ccs.user_id = swp.user_id
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
        'listening_points', r.listening_points,
        'preguntica_points', r.preguntica_points,
        'instagram_points', r.instagram_points,
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
