begin;

create table if not exists public.users_calendar_icademy_teacher_notifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notifications_enabled boolean not null default false,
  minutes_before integer not null default 30,
  quiet_hours_start time,
  quiet_hours_end time,
  last_notified_for_session_id uuid references public.calendar_icademy (id) on delete set null,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_calendar_icademy_teacher_notifications_minutes_before_allowed
    check (minutes_before in (10, 20, 30, 60, 120))
);

create index if not exists users_calendar_icademy_teacher_notifications_enabled_idx
  on public.users_calendar_icademy_teacher_notifications (user_id, notifications_enabled);

drop trigger if exists users_calendar_icademy_teacher_notifications_set_updated_at on public.users_calendar_icademy_teacher_notifications;
create trigger users_calendar_icademy_teacher_notifications_set_updated_at
before update on public.users_calendar_icademy_teacher_notifications
for each row execute procedure public.set_updated_at();

alter table public.users_calendar_icademy_teacher_notifications enable row level security;

drop policy if exists "users_calendar_icademy_teacher_notifications_all_own" on public.users_calendar_icademy_teacher_notifications;
create policy "users_calendar_icademy_teacher_notifications_all_own"
on public.users_calendar_icademy_teacher_notifications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
