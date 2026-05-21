begin;

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  country text,
  timezone text default 'UTC',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  native_lang text not null,
  target_lang text not null,
  cefr_level text not null default 'A2',
  review_goal integer not null default 10,
  creation_goal integer not null default 5,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lexicards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target text not null,
  native text not null,
  importance text not null,
  interval integer not null default 1,
  ease_factor numeric(4,2) not null default 2.50,
  streak integer not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_attempts integer not null default 0,
  correct_attempts integer not null default 0,
  accuracy numeric(5,2),
  xp_gained integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lexicard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lexicard_id uuid not null references public.lexicards (id) on delete cascade,
  session_id uuid references public.review_sessions (id) on delete set null,
  knew boolean not null,
  response_time_ms integer,
  previous_interval integer,
  next_interval integer,
  previous_ease_factor numeric(4,2),
  next_ease_factor numeric(4,2),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.phrase_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_words text[] not null,
  generated_phrase text,
  translation text,
  model text,
  latency_ms integer,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  words_added integer not null default 0,
  correct_reviews integer not null default 0,
  phrase_generated boolean not null default false,
  xp_earned integer not null default 0,
  review_goal_completed boolean not null default false,
  creation_goal_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.goal_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  goal_type text not null,
  completed boolean not null default false,
  progress_value integer not null default 0,
  target_value integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, goal_type)
);

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  points integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id text primary key,
  title text not null,
  description text not null,
  icon text,
  category text not null,
  threshold integer,
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.leaderboard_snapshots (
  id bigserial primary key,
  period text not null,
  period_start date not null,
  period_end date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null,
  rank integer not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_whitelist (
  email text primary key,
  can_register boolean not null default true,
  can_login boolean not null default true,
  source text not null default 'manual',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.daily_metrics enable row level security;
alter table public.goal_completions enable row level security;

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
