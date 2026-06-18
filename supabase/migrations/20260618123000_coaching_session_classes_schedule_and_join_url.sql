alter table public.coaching_session_classes
  add column if not exists scheduled_at timestamptz,
  add column if not exists class_join_url text;
