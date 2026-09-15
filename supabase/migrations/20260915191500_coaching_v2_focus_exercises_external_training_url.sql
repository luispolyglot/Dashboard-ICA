alter table public.coaching_v2_focus_exercises
  add column if not exists external_training_url text null;
