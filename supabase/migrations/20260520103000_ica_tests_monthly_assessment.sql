begin;

create table if not exists public.ica_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  test_month date not null,
  score integer not null,
  total_questions integer not null default 15,
  completed_at timestamptz not null default now(),
  questions jsonb not null default '[]'::jsonb,
  words_used text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ica_tests_score_range_check check (score between 0 and 15),
  constraint ica_tests_total_questions_check check (total_questions = 15),
  constraint ica_tests_month_floor_check check (test_month >= date '2026-05-01'),
  constraint ica_tests_month_start_check check (test_month = date_trunc('month', test_month)::date)
);

create unique index if not exists ica_tests_unique_user_month_lang_idx
  on public.ica_tests (user_id, target_lang, native_lang, test_month);

create index if not exists ica_tests_user_month_idx
  on public.ica_tests (user_id, test_month desc);

drop trigger if exists ica_tests_set_updated_at on public.ica_tests;
create trigger ica_tests_set_updated_at
before update on public.ica_tests
for each row execute procedure public.set_updated_at();

alter table public.ica_tests enable row level security;

drop policy if exists "ica_tests_all_own" on public.ica_tests;
create policy "ica_tests_all_own"
on public.ica_tests
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
