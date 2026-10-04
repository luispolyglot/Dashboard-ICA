-- RANKING TIEBREAK: DAILY GAME (Luis, 4 Oct)
--
-- When two students have the same points (same efficacy), the one with more correct answers in
-- the daily game ("reto del día") during the month wins (days 1-28, like the rest of the score).
-- Only the FIRST attempt of each day counts: the game can be replayed and the best attempt is
-- still kept for the path, but replaying does not help in the ranking.
-- Order: points -> daily game correct answers -> previous tiebreaks (avg %, ICA streak).
-- - ica_daily_game_results.first_correct: correct answers of the first attempt of the day.
--   Rows saved before this migration only know the best attempt, so they keep that value.
-- - Live ranking (get_monthly_streak_leaderboard_core) and month close (snapshot_monthly_leaderboard)
--   use the same order. The RPCs also return daily_game_correct so the app can tell a real tie.

begin;

-- 1. First attempt of the day.
alter table public.ica_daily_game_results
  add column if not exists first_correct integer;
update public.ica_daily_game_results set first_correct = correct where first_correct is null;
alter table public.ica_daily_game_results
  drop constraint if exists ica_daily_game_results_first_correct_check;
alter table public.ica_daily_game_results
  add constraint ica_daily_game_results_first_correct_check
  check (first_correct is null or (first_correct >= 0 and first_correct <= total));

create or replace function public.save_daily_game_result(p_kind text, p_correct integer, p_total integer)
returns public.ica_daily_game_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  result_row public.ica_daily_game_results%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('pairs', 'choice', 'write', 'listen', 'speak') then raise exception 'DAILY_GAME_KIND_INVALID'; end if;
  if p_total is null or p_correct is null or p_total <> 10 or p_correct < 0 or p_correct > p_total then
    raise exception 'DAILY_GAME_RESULT_INVALID';
  end if;
  local_day := public.ica_local_today(v_user_id);

  -- first_correct is only written by the first attempt of the day; later attempts keep the best.
  insert into public.ica_daily_game_results (user_id, day, kind, correct, total, finished_at, first_correct)
  values (v_user_id, local_day, p_kind, p_correct, p_total, now(), p_correct)
  on conflict (user_id, day) do update
  set kind = excluded.kind, correct = excluded.correct, total = excluded.total, finished_at = excluded.finished_at
  where excluded.correct > public.ica_daily_game_results.correct;

  select r.* into result_row
  from public.ica_daily_game_results r
  where r.user_id = v_user_id and r.day = local_day;
  return result_row;
end;
$$;
revoke all on function public.save_daily_game_result(text, integer, integer) from public, anon;
grant execute on function public.save_daily_game_result(text, integer, integer) to authenticated;

-- 2. Live ranking. The return type changes, so the internal function is recreated.
-- (The public wrappers are plain SQL functions, so they do not block the drop.)
drop function if exists public.get_monthly_streak_leaderboard_core(integer);
create function public.get_monthly_streak_leaderboard_core(limit_count integer default 20)
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
  daily_game_correct integer
)
language sql
security definer
set search_path = public
as $$
  with requester_timezone as (
    select coalesce(tzn.name, 'UTC') as timezone_name
    from public.profiles p
    left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
    where p.id = auth.uid()
    union all
    select 'UTC'
    limit 1
  ),
  user_context as (
    select distinct
      dm.user_id,
      rt.timezone_name,
      (now() at time zone rt.timezone_name) as now_local
    from public.daily_metrics dm
    cross join requester_timezone rt
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
      case
        when sum(mnl.listened_seconds)::numeric >= 600 then 0.1::numeric
        else 0::numeric
      end as daily_points
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
  -- Tiebreak (Luis, 4 Oct): correct answers in the first daily-game attempt of each day, days 1-28.
  daily_game_scores as (
    select
      mb.user_id,
      sum(coalesce(dg.first_correct, dg.correct))::integer as daily_game_correct
    from month_bounds mb
    join public.ica_daily_game_results dg
      on dg.user_id = mb.user_id
     and dg.day >= mb.month_start
     and dg.day < mb.month_end
     and extract(day from dg.day)::integer <= mb.elapsed_days::integer
    group by mb.user_id
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
          coalesce(dgs.daily_game_correct, 0) desc,
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
      swp.total_points,
      coalesce(dgs.daily_game_correct, 0) as daily_game_correct
    from scores_with_points swp
    left join public.profiles p on p.id = swp.user_id
    left join current_creation_streak ccs on ccs.user_id = swp.user_id
    left join frozen_creation_streak fcs on fcs.user_id = swp.user_id
    left join freeze_flags ff on ff.user_id = swp.user_id
    left join daily_game_scores dgs on dgs.user_id = swp.user_id
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
    r.total_points,
    r.daily_game_correct
  from ranked r
  order by r.rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_monthly_streak_leaderboard_core(integer) from public, anon, authenticated;

drop function if exists public.get_monthly_streak_leaderboard(integer);
create function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint, user_id uuid, username text, display_name text, ica_streak_days integer,
  avg_percent numeric, review_percent numeric, creation_percent numeric, is_creation_streak_frozen boolean,
  ica_test_points numeric, listening_points numeric, preguntica_points numeric,
  instagram_points numeric, total_points numeric, featured_badge text, display_flag text,
  daily_game_correct integer
)
language sql
security definer
set search_path = public
as $$
  select core.rank, core.user_id, core.username, core.display_name, core.ica_streak_days,
    core.avg_percent, core.review_percent, core.creation_percent, core.is_creation_streak_frozen,
    core.ica_test_points, core.listening_points, core.preguntica_points, core.instagram_points,
    core.total_points, fb.badge, df.lang, core.daily_game_correct
  from public.get_monthly_streak_leaderboard_core(limit_count) core
  left join public.ica_featured_badges fb on fb.user_id = core.user_id
  left join public.ica_display_flags df on df.user_id = core.user_id
$$;
revoke all on function public.get_monthly_streak_leaderboard(integer) from public, anon;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

-- 3. Month close: same order, and the count is kept in the snapshot payload.
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
      case
        when sum(mnl.listened_seconds)::numeric >= 600 then 0.1::numeric
        else 0::numeric
      end as daily_points
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
  -- Tiebreak (Luis, 4 Oct): correct answers in the first daily-game attempt of each day, days 1-28.
  daily_game_scores as (
    select
      dg.user_id,
      sum(coalesce(dg.first_correct, dg.correct))::integer as daily_game_correct
    from public.ica_daily_game_results dg
    cross join bounds b
    where dg.day >= b.month_start
      and dg.day <= b.cutoff_day
    group by dg.user_id
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
        and dm.day <= b.cutoff_day
    ) cst
    group by cst.user_id, cst.grp
  ),
  current_creation_streak as (
    select distinct on (cs.user_id)
      cs.user_id,
      cs.ica_streak_days
    from creation_streaks cs
    cross join bounds b
    where cs.streak_end_day between (b.cutoff_day - interval '1 day')::date and b.cutoff_day
    order by cs.user_id, cs.streak_end_day desc
  ),
  ranked as (
    select
      row_number() over (
        order by
          swp.total_points desc,
          coalesce(dgs.daily_game_correct, 0) desc,
          swp.avg_percent desc,
          coalesce(ccs.ica_streak_days, 0) desc,
          swp.user_id
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
      swp.total_points,
      coalesce(dgs.daily_game_correct, 0) as daily_game_correct
    from scores_with_points swp
    left join public.profiles p on p.id = swp.user_id
    left join current_creation_streak ccs on ccs.user_id = swp.user_id
    left join daily_game_scores dgs on dgs.user_id = swp.user_id
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
        'total_points', r.total_points,
        'daily_game_correct', r.daily_game_correct
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

revoke all on function public.snapshot_monthly_leaderboard(date, integer) from public, anon, authenticated;

-- 4. Closed months: return the stored count (null for months closed before this migration).
drop function if exists public.get_monthly_snapshot_leaderboard(date, integer, uuid);
create function public.get_monthly_snapshot_leaderboard(
  p_period_start date,
  limit_count integer default 33,
  include_user_id uuid default auth.uid()
)
returns table (
  rank bigint, user_id uuid, username text, display_name text, ica_streak_days integer,
  avg_percent numeric, review_percent numeric, creation_percent numeric, ica_test_points numeric,
  listening_points numeric, preguntica_points numeric, instagram_points numeric,
  total_points numeric, score integer, featured_badge text, display_flag text,
  daily_game_correct integer
)
language sql
security definer
set search_path = public
as $$
  select core.rank, core.user_id, core.username, core.display_name, core.ica_streak_days,
    core.avg_percent, core.review_percent, core.creation_percent, core.ica_test_points,
    core.listening_points, core.preguntica_points, core.instagram_points, core.total_points,
    core.score, ls.payload ->> 'featured_badge', df.lang,
    nullif(ls.payload ->> 'daily_game_correct', '')::integer
  from public.get_monthly_snapshot_leaderboard_core(p_period_start, limit_count, include_user_id) core
  left join public.leaderboard_snapshots ls
    on ls.period = 'monthly' and ls.period_start = p_period_start and ls.user_id = core.user_id
  left join public.ica_display_flags df on df.user_id = core.user_id
$$;
revoke all on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) from public, anon;
grant execute on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) to authenticated;

commit;
