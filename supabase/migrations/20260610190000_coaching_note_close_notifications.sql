begin;

create table if not exists public.user_coaching_notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  master_note_closed_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_coaching_notification_preferences_set_updated_at on public.user_coaching_notification_preferences;
create trigger user_coaching_notification_preferences_set_updated_at
before update on public.user_coaching_notification_preferences
for each row execute procedure public.set_updated_at();

alter table public.user_coaching_notification_preferences enable row level security;

drop policy if exists "user_coaching_notification_preferences_all_own" on public.user_coaching_notification_preferences;
create policy "user_coaching_notification_preferences_all_own"
on public.user_coaching_notification_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.coaching_note_close_notifications (
  id bigserial primary key,
  note_id uuid not null references public.master_notes (id) on delete cascade,
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  week_number integer check (week_number between 1 and 12),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (note_id, coach_user_id)
);

create index if not exists coaching_note_close_notifications_coach_idx
  on public.coaching_note_close_notifications (coach_user_id, created_at desc);

create index if not exists coaching_note_close_notifications_status_idx
  on public.coaching_note_close_notifications (status, created_at desc);

alter table public.coaching_note_close_notifications enable row level security;

drop policy if exists "coaching_note_close_notifications_select_own" on public.coaching_note_close_notifications;
create policy "coaching_note_close_notifications_select_own"
on public.coaching_note_close_notifications
for select
using (auth.uid() = coach_user_id);

commit;
