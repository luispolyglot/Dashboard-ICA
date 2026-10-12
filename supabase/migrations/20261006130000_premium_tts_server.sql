-- PREMIUM VOICE ON THE SERVER (Luis, 6 Oct)
--
-- Until now the Gemini voice (gemini-3.8-flash-lite-tts, voice Kore) only existed in Luis's local
-- copy (scripts/vite-premium-voice.mjs). The premium-tts Edge Function does the same for
-- development and production:
--   * each text is generated once and saved in the private "premium-tts" bucket, shared by everyone;
--   * every generated or reused audio adds to one row per day, student and model below, so the
--     admin panel shows the cost and the function can cap new audios per student per day.
-- Without the GEMINI_API_KEY secret the function answers 404 and the app keeps its old voices.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('premium-tts', 'premium-tts', false, 5242880, array['audio/wav'])
on conflict (id) do nothing;

-- No storage.objects policies on purpose: only the Edge Function (service role) reads and writes it.

create table if not exists public.premium_tts_daily_usage (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  generated integer not null default 0 check (generated >= 0),
  reused integer not null default 0 check (reused >= 0),
  seconds numeric(12, 2) not null default 0 check (seconds >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, user_id, model)
);

-- Server-only table: RLS on and no policies, so students and anon cannot read or write it.
alter table public.premium_tts_daily_usage enable row level security;
revoke all on table public.premium_tts_daily_usage from public, anon, authenticated;
-- The Edge Function reads today's count with the service role (writes go through premium_tts_track).
grant select on table public.premium_tts_daily_usage to service_role;

create index if not exists premium_tts_daily_usage_day_idx
  on public.premium_tts_daily_usage (day);

-- Adds one audio to today's row (UTC day) and returns how many audios that student generated today.
-- Called only by the premium-tts Edge Function with the service role.
create or replace function public.premium_tts_track(
  p_user_id uuid,
  p_model text,
  p_generated boolean,
  p_seconds numeric default 0,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_cost_usd numeric default 0
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_generated integer;
begin
  if p_user_id is null or nullif(trim(coalesce(p_model, '')), '') is null then
    raise exception 'PREMIUM_TTS_TRACK_INVALID';
  end if;

  insert into public.premium_tts_daily_usage as u (
    day, user_id, model, generated, reused, seconds, input_tokens, output_tokens, cost_usd
  )
  values (
    v_day,
    p_user_id,
    p_model,
    case when p_generated then 1 else 0 end,
    case when p_generated then 0 else 1 end,
    greatest(coalesce(p_seconds, 0), 0),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_cost_usd, 0), 0)
  )
  on conflict (day, user_id, model) do update
  set generated = u.generated + excluded.generated,
      reused = u.reused + excluded.reused,
      seconds = u.seconds + excluded.seconds,
      input_tokens = u.input_tokens + excluded.input_tokens,
      output_tokens = u.output_tokens + excluded.output_tokens,
      cost_usd = u.cost_usd + excluded.cost_usd,
      updated_at = now();

  select coalesce(sum(generated), 0)::integer
  into v_generated
  from public.premium_tts_daily_usage
  where day = v_day
    and user_id = p_user_id;

  return v_generated;
end;
$$;

revoke all on function public.premium_tts_track(uuid, text, boolean, numeric, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.premium_tts_track(uuid, text, boolean, numeric, bigint, bigint, numeric)
  to service_role;

-- Cost per day for the admin panel («Voz premium (Gemini)»), all students and models added up.
-- Only active admins and super admins.
create or replace function public.admin_premium_tts_usage()
returns table (
  day date,
  generated bigint,
  reused bigint,
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
      and a.role in ('admin', 'super_admin')
      and a.is_active = true
  ) then
    raise exception 'FORBIDDEN_ADMIN_ONLY';
  end if;

  return query
  select
    u.day,
    sum(u.generated)::bigint,
    sum(u.reused)::bigint,
    sum(u.seconds),
    sum(u.cost_usd)
  from public.premium_tts_daily_usage u
  group by u.day
  order by u.day desc
  limit 800;
end;
$$;

revoke all on function public.admin_premium_tts_usage() from public, anon;
grant execute on function public.admin_premium_tts_usage() to authenticated;

commit;
