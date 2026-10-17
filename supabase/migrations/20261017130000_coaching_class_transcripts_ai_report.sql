-- COACHING: TRANSCRIPTS, AI TASKS AND STRUCTURED WEEKLY REPORT (Luis, 15 Oct)
--
-- 1. coaching_v2_class_transcripts: the Loom transcript of each class, pasted by the coach.
--    Only coaches use it (through the coaching-center function): the student never reads it.
-- 2. coaching_v2_period_report_drafts: the weekly report the AI writes from the two transcripts,
--    while the coach reviews it. Not visible to the student.
-- 3. coaching_v2_period_reports.report_data: the published structured report (corrections,
--    suggestions, words, foco note, challenge). Same visibility as the existing report text:
--    the student of the session and the coaches in scope.

begin;

-- 1. Transcripts ------------------------------------------------------------------------------

create table if not exists public.coaching_v2_class_transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 20),
  class_index integer not null check (class_index between 1 and 2),
  transcript text not null check (char_length(transcript) between 1 and 200000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, period_number, class_index)
);

drop trigger if exists coaching_v2_class_transcripts_set_updated_at on public.coaching_v2_class_transcripts;
create trigger coaching_v2_class_transcripts_set_updated_at
before update on public.coaching_v2_class_transcripts
for each row execute procedure public.set_updated_at();

-- Server-only: the coaching-center function reads and writes it with the service role.
alter table public.coaching_v2_class_transcripts enable row level security;
revoke all on table public.coaching_v2_class_transcripts from public, anon, authenticated;

-- 2. Report drafts ----------------------------------------------------------------------------

create table if not exists public.coaching_v2_period_report_drafts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 20),
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object'),
  model text,
  generated_by uuid references auth.users (id) on delete set null,
  generated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, period_number)
);

drop trigger if exists coaching_v2_period_report_drafts_set_updated_at on public.coaching_v2_period_report_drafts;
create trigger coaching_v2_period_report_drafts_set_updated_at
before update on public.coaching_v2_period_report_drafts
for each row execute procedure public.set_updated_at();

alter table public.coaching_v2_period_report_drafts enable row level security;
revoke all on table public.coaching_v2_period_report_drafts from public, anon, authenticated;

-- 3. Published structured report ------------------------------------------------------------------

alter table public.coaching_v2_period_reports
  add column if not exists report_data jsonb;

alter table public.coaching_v2_period_reports
  drop constraint if exists coaching_v2_period_reports_report_data_object;
alter table public.coaching_v2_period_reports
  add constraint coaching_v2_period_reports_report_data_object
  check (report_data is null or jsonb_typeof(report_data) = 'object');

commit;
