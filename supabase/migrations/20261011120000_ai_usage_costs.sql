-- GASTOS DE IA (Luis, 11 Oct)
--
-- Until now only the premium voice (Gemini) saved what it costs (premium_tts_daily_usage).
-- This adds the same for Claude (Sonnet and Haiku) and for the PreguntICA transcriptions
-- (OpenAI): every Edge Function call adds its tokens and an estimated price to one row per
-- day (UTC), student, model and feature. The admin page «Gastos de IA» (super admins only) reads
-- both tables together through admin_ai_costs() and admin_ai_cost_people().
-- The price is estimated from the public price list (supabase/functions/_shared/ai-prices.ts);
-- the invoice of each provider can differ a little. Nothing is counted before this migration.

begin;

create table if not exists public.ai_usage_daily (
  id bigint generated always as identity primary key,
  day date not null,
  -- Null for background work that is not one student's request (flashcard examples).
  user_id uuid references auth.users (id) on delete set null,
  provider text not null check (provider in ('anthropic', 'openai', 'google')),
  model text not null check (char_length(model) between 1 and 120),
  feature text not null check (char_length(feature) between 1 and 80),
  calls integer not null default 0 check (calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  seconds numeric(14, 2) not null default 0 check (seconds >= 0),
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  updated_at timestamptz not null default now()
);

-- One row per day, student (or none), provider, model and feature.
create unique index if not exists ai_usage_daily_key
  on public.ai_usage_daily (
    day,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    model,
    feature
  );

create index if not exists ai_usage_daily_day_idx on public.ai_usage_daily (day);

-- Server-only table: RLS on and no policies, so students and anon cannot read or write it.
alter table public.ai_usage_daily enable row level security;
revoke all on table public.ai_usage_daily from public, anon, authenticated;

-- Adds one call to today's row. Called only by the Edge Functions with the service role.
create or replace function public.ai_usage_track(
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_feature text,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_cache_write_tokens bigint default 0,
  p_cache_read_tokens bigint default 0,
  p_seconds numeric default 0,
  p_cost_usd numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_model text := left(trim(coalesce(p_model, '')), 120);
  v_feature text := left(trim(coalesce(p_feature, '')), 80);
begin
  if v_model = '' or v_feature = '' or p_provider not in ('anthropic', 'openai', 'google') then
    raise exception 'AI_USAGE_TRACK_INVALID';
  end if;

  insert into public.ai_usage_daily as u (
    day, user_id, provider, model, feature, calls,
    input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, seconds, cost_usd
  )
  values (
    v_day,
    p_user_id,
    p_provider,
    v_model,
    v_feature,
    1,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_cache_write_tokens, 0), 0),
    greatest(coalesce(p_cache_read_tokens, 0), 0),
    greatest(coalesce(p_seconds, 0), 0),
    greatest(coalesce(p_cost_usd, 0), 0)
  )
  on conflict (
    day,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    model,
    feature
  ) do update
  set calls = u.calls + 1,
      input_tokens = u.input_tokens + excluded.input_tokens,
      output_tokens = u.output_tokens + excluded.output_tokens,
      cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
      cache_read_tokens = u.cache_read_tokens + excluded.cache_read_tokens,
      seconds = u.seconds + excluded.seconds,
      cost_usd = u.cost_usd + excluded.cost_usd,
      updated_at = now();
end;
$$;

revoke all on function public.ai_usage_track(uuid, text, text, text, bigint, bigint, bigint, bigint, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.ai_usage_track(uuid, text, text, text, bigint, bigint, bigint, bigint, numeric, numeric)
  to service_role;

-- Costs per day, provider, model and feature between two days (UTC), all students added up.
-- The premium voice comes from its own table as provider 'google', feature 'voice'.
-- Only active super admins.
create or replace function public.admin_ai_costs(p_from date, p_to date)
returns table (
  day date,
  provider text,
  model text,
  feature text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  seconds numeric,
  cost_usd numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.role = 'super_admin'
      and a.is_active = true
  ) then
    raise exception 'FORBIDDEN_SUPER_ADMIN_ONLY';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'AI_COSTS_RANGE_INVALID';
  end if;

  return query
  select
    u.day,
    u.provider,
    u.model,
    u.feature,
    sum(u.calls)::bigint,
    sum(u.input_tokens + u.cache_write_tokens + u.cache_read_tokens)::bigint,
    sum(u.output_tokens)::bigint,
    sum(u.seconds),
    sum(u.cost_usd)
  from public.ai_usage_daily u
  where u.day between p_from and p_to
  group by u.day, u.provider, u.model, u.feature
  union all
  select
    t.day,
    'google'::text,
    t.model,
    'voice'::text,
    sum(t.generated)::bigint,
    sum(t.input_tokens)::bigint,
    sum(t.output_tokens)::bigint,
    sum(t.seconds),
    sum(t.cost_usd)
  from public.premium_tts_daily_usage t
  where t.day between p_from and p_to
  group by t.day, t.model
  order by 1, 2, 3, 4;
end;
$$;

revoke all on function public.admin_ai_costs(date, date) from public, anon;
grant execute on function public.admin_ai_costs(date, date) to authenticated;

-- How many different students used something paid between two days (to divide the cost).
create or replace function public.admin_ai_cost_people(p_from date, p_to date)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_people integer;
begin
  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.role = 'super_admin'
      and a.is_active = true
  ) then
    raise exception 'FORBIDDEN_SUPER_ADMIN_ONLY';
  end if;

  select count(distinct x.user_id)::integer
  into v_people
  from (
    select u.user_id from public.ai_usage_daily u
    where u.day between p_from and p_to and u.user_id is not null
    union
    select t.user_id from public.premium_tts_daily_usage t
    where t.day between p_from and p_to and t.generated > 0
  ) x;

  return coalesce(v_people, 0);
end;
$$;

revoke all on function public.admin_ai_cost_people(date, date) from public, anon;
grant execute on function public.admin_ai_cost_people(date, date) to authenticated;

commit;
