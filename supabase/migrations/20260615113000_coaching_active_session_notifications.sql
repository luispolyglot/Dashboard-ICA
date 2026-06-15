begin;

alter table public.user_coaching_notification_preferences
  add column if not exists active_session_enabled boolean not null default true;

commit;
