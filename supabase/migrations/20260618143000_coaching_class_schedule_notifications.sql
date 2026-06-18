begin;

create table if not exists public.coaching_class_schedule_notifications (
  id bigserial primary key,
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  notification_type text not null check (notification_type in ('scheduled', 'rescheduled', 'reminder')),
  schedule_signature text not null,
  reminder_minutes integer not null default 0 check (reminder_minutes in (0, 10, 30, 60)),
  scheduled_at timestamptz,
  class_join_url text,
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, week_number, notification_type, schedule_signature, reminder_minutes)
);

create index if not exists coaching_class_schedule_notifications_session_week_idx
  on public.coaching_class_schedule_notifications (session_id, week_number, created_at desc);

create index if not exists coaching_class_schedule_notifications_user_idx
  on public.coaching_class_schedule_notifications (user_id, created_at desc);

alter table public.coaching_class_schedule_notifications enable row level security;

drop policy if exists "coaching_class_schedule_notifications_select_own" on public.coaching_class_schedule_notifications;
create policy "coaching_class_schedule_notifications_select_own"
on public.coaching_class_schedule_notifications
for select
using (auth.uid() = user_id);

commit;
