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
  last_seen_session integer,
  target_lang text,
  native_lang text,
  example_phrase text,
  example_translation text,
  source text not null default 'manual',
  activation_count integer not null default 0,
  first_activated_at timestamptz,
  last_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lexicards_user_id_idx on public.lexicards (user_id);
create index if not exists lexicards_user_created_idx on public.lexicards (user_id, created_at desc);
create index if not exists lexicards_user_lang_idx on public.lexicards (user_id, native_lang, target_lang, created_at desc);

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

create index if not exists review_sessions_user_id_idx on public.review_sessions (user_id, started_at desc);

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

create index if not exists lexicard_reviews_user_id_idx on public.lexicard_reviews (user_id, reviewed_at desc);

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

create index if not exists phrase_generations_user_id_idx on public.phrase_generations (user_id, created_at desc);

create table if not exists public.daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  words_added integer not null default 0,
  reviews_done integer not null default 0,
  correct_reviews integer not null default 0,
  phrase_generated boolean not null default false,
  xp_earned integer not null default 0,
  review_goal_completed boolean not null default false,
  creation_goal_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.user_meta_tracker (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  start_level text not null default '0',
  prior_ica_words integer not null default 0,
  activation_words_total integer not null default 0,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_lang, native_lang)
);

create table if not exists public.word_activation_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  word_normalized text not null,
  activations_count integer not null default 0,
  first_activated_at timestamptz,
  last_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_lang, native_lang, word_normalized)
);

create index if not exists word_activation_counters_lookup_idx
  on public.word_activation_counters (user_id, target_lang, native_lang);

create table if not exists public.lexicard_activation_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  lexicard_id uuid not null references public.lexicards (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  activations_count integer not null default 0,
  first_activated_at timestamptz,
  last_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lexicard_id)
);

create index if not exists lexicard_activation_counters_user_lang_idx
  on public.lexicard_activation_counters (user_id, target_lang, native_lang);

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

create index if not exists xp_events_user_id_idx on public.xp_events (user_id, created_at desc);

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

create index if not exists leaderboard_period_idx on public.leaderboard_snapshots (period, period_start, rank);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_user_id_idx on public.activity_events (user_id, created_at desc);

create table if not exists public.auth_whitelist (
  email text primary key,
  can_register boolean not null default true,
  can_login boolean not null default true,
  source text not null default 'manual',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop table if exists public.user_state cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_meta_tracker_changes_after_confirmation()
returns trigger
language plpgsql
as $$
begin
  if old.confirmed_at is not null and (
    old.start_level is distinct from new.start_level
    or old.prior_ica_words is distinct from new.prior_ica_words
    or old.target_lang is distinct from new.target_lang
    or old.native_lang is distinct from new.native_lang
  ) then
    raise exception 'META_TRACKER_LOCKED';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists lexicards_set_updated_at on public.lexicards;
create trigger lexicards_set_updated_at
before update on public.lexicards
for each row execute procedure public.set_updated_at();

drop trigger if exists daily_metrics_set_updated_at on public.daily_metrics;
create trigger daily_metrics_set_updated_at
before update on public.daily_metrics
for each row execute procedure public.set_updated_at();

drop trigger if exists user_meta_tracker_set_updated_at on public.user_meta_tracker;
create trigger user_meta_tracker_set_updated_at
before update on public.user_meta_tracker
for each row execute procedure public.set_updated_at();

drop trigger if exists word_activation_counters_set_updated_at on public.word_activation_counters;
create trigger word_activation_counters_set_updated_at
before update on public.word_activation_counters
for each row execute procedure public.set_updated_at();

drop trigger if exists lexicard_activation_counters_set_updated_at on public.lexicard_activation_counters;
create trigger lexicard_activation_counters_set_updated_at
before update on public.lexicard_activation_counters
for each row execute procedure public.set_updated_at();

drop trigger if exists user_meta_tracker_lock_after_confirmation on public.user_meta_tracker;
create trigger user_meta_tracker_lock_after_confirmation
before update on public.user_meta_tracker
for each row execute procedure public.prevent_meta_tracker_changes_after_confirmation();

drop trigger if exists goal_completions_set_updated_at on public.goal_completions;
create trigger goal_completions_set_updated_at
before update on public.goal_completions
for each row execute procedure public.set_updated_at();

drop trigger if exists auth_whitelist_set_updated_at on public.auth_whitelist;
create trigger auth_whitelist_set_updated_at
before update on public.auth_whitelist
for each row execute procedure public.set_updated_at();

create or replace function public.enforce_whitelist_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  can_register_user boolean;
begin
  normalized_email := lower(trim(new.email));

  select w.can_register
  into can_register_user
  from public.auth_whitelist w
  where w.email = normalized_email;

  if coalesce(can_register_user, false) is false then
    raise exception 'SIGNUP_NOT_ALLOWED';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_whitelist_on_signup on auth.users;
create trigger enforce_whitelist_on_signup
before insert on auth.users
for each row execute procedure public.enforce_whitelist_on_signup();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_name text;
  requested_display_name text;
begin
  fallback_name := split_part(new.email, '@', 1);
  requested_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    fallback_name,
    coalesce(requested_display_name, fallback_name)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.lexicards enable row level security;
alter table public.review_sessions enable row level security;
alter table public.lexicard_reviews enable row level security;
alter table public.phrase_generations enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.user_meta_tracker enable row level security;
alter table public.word_activation_counters enable row level security;
alter table public.lexicard_activation_counters enable row level security;
alter table public.goal_completions enable row level security;
alter table public.xp_events enable row level security;
alter table public.user_achievements enable row level security;
alter table public.activity_events enable row level security;
alter table public.auth_whitelist enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lexicards_all_own" on public.lexicards;
create policy "lexicards_all_own" on public.lexicards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "review_sessions_all_own" on public.review_sessions;
create policy "review_sessions_all_own" on public.review_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lexicard_reviews_all_own" on public.lexicard_reviews;
create policy "lexicard_reviews_all_own" on public.lexicard_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "phrase_generations_all_own" on public.phrase_generations;
create policy "phrase_generations_all_own" on public.phrase_generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "daily_metrics_all_own" on public.daily_metrics;
create policy "daily_metrics_all_own" on public.daily_metrics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_meta_tracker_all_own" on public.user_meta_tracker;
create policy "user_meta_tracker_all_own" on public.user_meta_tracker for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "word_activation_counters_all_own" on public.word_activation_counters;
create policy "word_activation_counters_all_own" on public.word_activation_counters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lexicard_activation_counters_all_own" on public.lexicard_activation_counters;
create policy "lexicard_activation_counters_all_own" on public.lexicard_activation_counters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goal_completions_all_own" on public.goal_completions;
create policy "goal_completions_all_own" on public.goal_completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "xp_events_all_own" on public.xp_events;
create policy "xp_events_all_own" on public.xp_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_achievements_all_own" on public.user_achievements;
create policy "user_achievements_all_own" on public.user_achievements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "activity_events_all_own" on public.activity_events;
create policy "activity_events_all_own" on public.activity_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.achievements enable row level security;
drop policy if exists "achievements_read_all" on public.achievements;
create policy "achievements_read_all" on public.achievements for select using (true);

alter table public.leaderboard_snapshots enable row level security;
drop policy if exists "leaderboard_read_all" on public.leaderboard_snapshots;
create policy "leaderboard_read_all" on public.leaderboard_snapshots for select using (true);

create or replace function public.whitelist_check_registration(email_input text)
returns table (
  allowed boolean,
  reason text
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select lower(trim(email_input)) as email
  )
  select
    case
      when w.email is null then false
      when w.can_register is false then false
      else true
    end as allowed,
    case
      when w.email is null then 'Este email no pertence a Icademy.'
      when w.can_register is false then 'El registro para este email esta deshabilitado por el administrador.'
      else 'Email habilitado para registro.'
    end as reason
  from normalized n
  left join public.auth_whitelist w on w.email = n.email;
$$;

create or replace function public.whitelist_check_login(email_input text)
returns table (
  allowed boolean,
  reason text
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select lower(trim(email_input)) as email
  )
  select
    case
      when w.email is null then false
      when w.can_login is false then false
      else true
    end as allowed,
    case
      when w.email is null then 'Este email no tiene acceso habilitado.'
      when w.can_login is false then 'El acceso de login para este email esta deshabilitado.'
      else 'Email habilitado para login.'
    end as reason
  from normalized n
  left join public.auth_whitelist w on w.email = n.email;
$$;

revoke all on function public.whitelist_check_registration(text) from public;
revoke all on function public.whitelist_check_login(text) from public;
grant execute on function public.whitelist_check_registration(text) to anon, authenticated;
grant execute on function public.whitelist_check_login(text) to anon, authenticated;

insert into public.achievements (id, title, description, icon, category, threshold)
values
  ('first_word', 'Primera palabra', 'Agrega tu primera palabra al mazo.', 'book-open', 'vocabulary', 1),
  ('vocab_25', 'Vocab 25', 'Alcanza 25 palabras guardadas.', 'library', 'vocabulary', 25),
  ('review_100', 'Centurion', 'Completa 100 reviews de flashcards.', 'target', 'review', 100),
  ('phrase_10', 'Frases x10', 'Genera 10 frases de activación.', 'bolt', 'phrase', 10),
  ('xp_500', 'XP 500', 'Consigue 500 XP totales.', 'trophy', 'xp', 500)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  threshold = excluded.threshold;

create or replace function public.get_weekly_leaderboard(limit_count integer default 20)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  score integer
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('week', now()) as week_start,
      date_trunc('week', now()) + interval '7 days' as week_end
  ),
  scores as (
    select
      xe.user_id,
      sum(xe.points)::integer as score
    from public.xp_events xe
    cross join bounds b
    where xe.created_at >= b.week_start
      and xe.created_at < b.week_end
    group by xe.user_id
  ),
  ranked as (
    select
      row_number() over (order by s.score desc, s.user_id) as rank,
      s.user_id,
      coalesce(p.username, 'anon') as username,
      coalesce(p.display_name, p.username, 'Usuario') as display_name,
      s.score
    from scores s
    left join public.profiles p on p.id = s.user_id
  )
  select r.rank, r.user_id, r.username, r.display_name, r.score
  from ranked r
  order by r.rank
  limit greatest(limit_count, 1);
$$;

revoke all on function public.get_weekly_leaderboard(integer) from public;
grant execute on function public.get_weekly_leaderboard(integer) to authenticated;

create or replace function public.register_word_activations(
  p_words text[],
  p_target_lang text,
  p_native_lang text
)
returns table (activation_words_total integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(p_target_lang), '') is null or nullif(trim(p_native_lang), '') is null then
    raise exception 'LANG_REQUIRED';
  end if;

  return query
  with normalized as (
    select
      lower(trim(regexp_replace(word, '\s+', ' ', 'g'))) as normalized_word
    from unnest(coalesce(p_words, array[]::text[])) as word
    where nullif(trim(word), '') is not null
  ),
  upsert_words as (
    insert into public.word_activation_counters (
      user_id,
      target_lang,
      native_lang,
      word_normalized,
      activations_count,
      first_activated_at,
      last_activated_at
    )
    select
      current_user_id,
      p_target_lang,
      p_native_lang,
      normalized_word,
      1,
      now(),
      now()
    from normalized
    on conflict (user_id, target_lang, native_lang, word_normalized)
    do update set
      activations_count = public.word_activation_counters.activations_count + 1,
      last_activated_at = now()
  ),
  upsert_tracker as (
    insert into public.user_meta_tracker (
      user_id,
      target_lang,
      native_lang,
      activation_words_total
    )
    values (
      current_user_id,
      p_target_lang,
      p_native_lang,
      (select count(*) from normalized)
    )
    on conflict (user_id, target_lang, native_lang)
    do update set
      activation_words_total = public.user_meta_tracker.activation_words_total + excluded.activation_words_total
    returning activation_words_total
  )
  select activation_words_total from upsert_tracker;
end;
$$;

revoke all on function public.register_word_activations(text[], text, text) from public;
grant execute on function public.register_word_activations(text[], text, text) to authenticated;

create or replace function public.register_lexicard_activations(
  p_lexicard_ids uuid[],
  p_target_lang text,
  p_native_lang text
)
returns table (activation_words_total integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  updated as (
    update public.lexicards l
    set
      activation_count = l.activation_count + e.uses,
      first_activated_at = coalesce(l.first_activated_at, now()),
      last_activated_at = now()
    from expanded e
    where l.id = e.lexicard_id
      and l.user_id = current_user_id
      and coalesce(l.target_lang, p_target_lang) = p_target_lang
      and coalesce(l.native_lang, p_native_lang) = p_native_lang
    returning e.uses
  ),
  delta as (
    select coalesce(sum(uses), 0)::integer as amount from updated
  ),
  upsert_tracker as (
    insert into public.user_meta_tracker (
      user_id,
      target_lang,
      native_lang,
      activation_words_total
    )
    values (
      current_user_id,
      p_target_lang,
      p_native_lang,
      (select amount from delta)
    )
    on conflict (user_id, target_lang, native_lang)
    do update set
      activation_words_total = public.user_meta_tracker.activation_words_total + excluded.activation_words_total
    returning activation_words_total
  )
  select activation_words_total from upsert_tracker;
end;
$$;

revoke all on function public.register_lexicard_activations(uuid[], text, text) from public;
grant execute on function public.register_lexicard_activations(uuid[], text, text) to authenticated;

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
