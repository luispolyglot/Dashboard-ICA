begin;

create table if not exists public.user_push_notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ica_streak_enabled boolean not null default false,
  ica_streak_hour smallint not null default 20,
  flashcards_streak_enabled boolean not null default false,
  flashcards_streak_hour smallint not null default 20,
  habit_loss_enabled boolean not null default false,
  habit_loss_last_stage smallint not null default 0,
  habit_loss_last_notified_at timestamptz,
  ica_streak_last_reminded_day date,
  flashcards_streak_last_reminded_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_notification_preferences_ica_hour_range
    check (ica_streak_hour between 5 and 23),
  constraint user_push_notification_preferences_flashcards_hour_range
    check (flashcards_streak_hour between 5 and 23),
  constraint user_push_notification_preferences_habit_stage_range
    check (habit_loss_last_stage in (0, 1, 2, 3))
);

create index if not exists user_push_notification_preferences_enabled_idx
  on public.user_push_notification_preferences (
    ica_streak_enabled,
    flashcards_streak_enabled,
    habit_loss_enabled,
    updated_at desc
  );

drop trigger if exists user_push_notification_preferences_set_updated_at on public.user_push_notification_preferences;
create trigger user_push_notification_preferences_set_updated_at
before update on public.user_push_notification_preferences
for each row execute procedure public.set_updated_at();

alter table public.user_push_notification_preferences enable row level security;

drop policy if exists "user_push_notification_preferences_all_own" on public.user_push_notification_preferences;
create policy "user_push_notification_preferences_all_own"
on public.user_push_notification_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
