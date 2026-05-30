begin;

create table if not exists public.users_calendar_icademy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_key text not null,
  language_code text not null,
  notifications_enabled boolean not null default false,
  minutes_before integer not null default 30,
  quiet_hours_start time,
  quiet_hours_end time,
  last_notified_for_session_id uuid references public.calendar_icademy (id) on delete set null,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_calendar_icademy_class_key_not_empty
    check (length(trim(class_key)) > 0),
  constraint users_calendar_icademy_language_code_not_empty
    check (length(trim(language_code)) > 0),
  constraint users_calendar_icademy_minutes_before_allowed
    check (minutes_before in (10, 15, 30, 60, 120)),
  constraint users_calendar_icademy_unique_class
    unique (user_id, class_key)
);

create index if not exists users_calendar_icademy_user_enabled_idx
  on public.users_calendar_icademy (user_id, notifications_enabled, class_key);

drop trigger if exists users_calendar_icademy_set_updated_at on public.users_calendar_icademy;
create trigger users_calendar_icademy_set_updated_at
before update on public.users_calendar_icademy
for each row execute procedure public.set_updated_at();

alter table public.users_calendar_icademy enable row level security;

drop policy if exists "users_calendar_icademy_all_own" on public.users_calendar_icademy;
create policy "users_calendar_icademy_all_own"
on public.users_calendar_icademy
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
