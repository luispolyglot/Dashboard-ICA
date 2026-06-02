begin;

create table if not exists public.users_calendar_icademy_session_blacklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  calendar_entry_id uuid not null references public.calendar_icademy (id) on delete cascade,
  class_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_calendar_icademy_session_blacklist_class_key_not_empty
    check (length(trim(class_key)) > 0),
  constraint users_calendar_icademy_session_blacklist_unique_session
    unique (user_id, calendar_entry_id)
);

create index if not exists users_calendar_icademy_session_blacklist_user_idx
  on public.users_calendar_icademy_session_blacklist (user_id, created_at desc);

create index if not exists users_calendar_icademy_session_blacklist_entry_idx
  on public.users_calendar_icademy_session_blacklist (calendar_entry_id);

drop trigger if exists users_calendar_icademy_session_blacklist_set_updated_at on public.users_calendar_icademy_session_blacklist;
create trigger users_calendar_icademy_session_blacklist_set_updated_at
before update on public.users_calendar_icademy_session_blacklist
for each row execute procedure public.set_updated_at();

alter table public.users_calendar_icademy_session_blacklist enable row level security;

drop policy if exists "users_calendar_icademy_session_blacklist_all_own" on public.users_calendar_icademy_session_blacklist;
create policy "users_calendar_icademy_session_blacklist_all_own"
on public.users_calendar_icademy_session_blacklist
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
