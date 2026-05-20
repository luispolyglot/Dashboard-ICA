begin;

create table if not exists public.ica_tests_dev (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  test_month date not null,
  status text not null default 'completed',
  score integer not null,
  total_questions integer not null default 15,
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  completed_at timestamptz,
  answers_json jsonb not null default '[]'::jsonb,
  current_question_index integer not null default 0,
  fail_reason text,
  questions jsonb not null default '[]'::jsonb,
  words_used text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ica_tests_dev_score_range_check check (score between 0 and 15),
  constraint ica_tests_dev_total_questions_check check (total_questions = 15),
  constraint ica_tests_dev_month_floor_check check (test_month >= date '2026-05-01'),
  constraint ica_tests_dev_month_start_check check (test_month = date_trunc('month', test_month)::date),
  constraint ica_tests_dev_status_check check (status in ('running', 'completed', 'failed')),
  constraint ica_tests_dev_current_question_index_check check (current_question_index between 0 and 15)
);

create unique index if not exists ica_tests_dev_unique_user_month_lang_idx
  on public.ica_tests_dev (user_id, target_lang, native_lang, test_month);

create index if not exists ica_tests_dev_user_month_idx
  on public.ica_tests_dev (user_id, test_month desc);

drop trigger if exists ica_tests_dev_set_updated_at on public.ica_tests_dev;
create trigger ica_tests_dev_set_updated_at
before update on public.ica_tests_dev
for each row execute procedure public.set_updated_at();

alter table public.ica_tests_dev enable row level security;

drop policy if exists "ica_tests_dev_all_own" on public.ica_tests_dev;
create policy "ica_tests_dev_all_own"
on public.ica_tests_dev
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
