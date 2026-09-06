begin;

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_enabled boolean not null default false,
  rollout_percentage integer not null default 100,
  app_env text not null default 'all',
  payload jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_not_empty check (length(trim(key)) > 0),
  constraint feature_flags_name_not_empty check (length(trim(name)) > 0),
  constraint feature_flags_rollout_range check (rollout_percentage >= 0 and rollout_percentage <= 100),
  constraint feature_flags_env_check check (app_env in ('all', 'development', 'staging', 'production')),
  constraint feature_flags_time_range check (starts_at is null or ends_at is null or starts_at <= ends_at),
  constraint feature_flags_key_unique unique (key)
);

create index if not exists feature_flags_enabled_idx
  on public.feature_flags (is_enabled, key);

create index if not exists feature_flags_env_idx
  on public.feature_flags (app_env, key);

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute procedure public.set_updated_at();

alter table public.feature_flags enable row level security;

drop policy if exists "feature_flags_select_authenticated" on public.feature_flags;
create policy "feature_flags_select_authenticated"
on public.feature_flags
for select
using (auth.role() = 'authenticated');

insert into public.feature_flags (
  key,
  name,
  description,
  is_enabled,
  rollout_percentage,
  app_env,
  payload
)
values (
  'ica-challenges',
  'ICA Challenges',
  'Habilita la card y vistas de Desafios ICA.',
  false,
  100,
  'all',
  '{"owner":"product","notes":"default off"}'::jsonb
)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  is_enabled = excluded.is_enabled,
  rollout_percentage = excluded.rollout_percentage,
  app_env = excluded.app_env,
  payload = excluded.payload,
  updated_at = now();

commit;
