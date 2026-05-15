alter table public.master_notes
  add column if not exists coaching_feedback_loom_url text;
