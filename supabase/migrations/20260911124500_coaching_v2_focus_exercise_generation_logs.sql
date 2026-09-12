create table if not exists public.coaching_v2_focus_exercise_generation_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions(id) on delete cascade,
  focus_id uuid not null references public.coaching_v2_focuses(id) on delete cascade,
  period_number integer not null,
  trigger_source text not null default 'unknown',
  stage text not null,
  status text not null,
  message text null,
  payload jsonb null,
  requested_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists coaching_v2_focus_exercise_generation_logs_session_idx
  on public.coaching_v2_focus_exercise_generation_logs (session_id, created_at desc);

create index if not exists coaching_v2_focus_exercise_generation_logs_focus_idx
  on public.coaching_v2_focus_exercise_generation_logs (focus_id, created_at desc);

create index if not exists coaching_v2_focus_exercise_generation_logs_status_idx
  on public.coaching_v2_focus_exercise_generation_logs (status, created_at desc);
