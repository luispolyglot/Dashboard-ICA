begin;

alter table public.lexicards
  add column if not exists last_seen_session integer,
  add column if not exists target_lang text,
  add column if not exists native_lang text,
  add column if not exists example_phrase text,
  add column if not exists example_translation text;

update public.lexicards as l
set
  native_lang = us.native_lang,
  target_lang = us.target_lang
from public.user_settings as us
where us.user_id = l.user_id
  and (l.native_lang is null or l.target_lang is null);

create index if not exists lexicards_user_lang_idx
  on public.lexicards (user_id, native_lang, target_lang, created_at desc);

create or replace function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
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
  ranked as (
    select
      row_number() over (order by s.avg_percent desc, s.user_id) as rank,
      s.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      s.avg_percent,
      s.review_percent,
      s.creation_percent
    from scores s
    left join public.profiles p on p.id = s.user_id
  )
  select
    r.rank,
    r.user_id,
    r.username,
    r.display_name,
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
