begin;

alter table public.user_coaching_notification_preferences
  add column if not exists class_schedule_reminder_minutes integer not null default 30;

alter table public.user_coaching_notification_preferences
  drop constraint if exists user_coaching_notification_preferences_class_schedule_reminder_minutes_check;

alter table public.user_coaching_notification_preferences
  add constraint user_coaching_notification_preferences_class_schedule_reminder_minutes_check
  check (class_schedule_reminder_minutes in (10, 30, 60));

commit;
