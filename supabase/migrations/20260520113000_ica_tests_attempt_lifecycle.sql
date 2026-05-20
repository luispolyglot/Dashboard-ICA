begin;

alter table public.ica_tests
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists answers_json jsonb not null default '[]'::jsonb,
  add column if not exists current_question_index integer not null default 0,
  add column if not exists fail_reason text;

alter table public.ica_tests
  alter column completed_at drop not null,
  alter column completed_at drop default;

update public.ica_tests
set
  status = coalesce(status, 'completed'),
  started_at = coalesce(started_at, completed_at, created_at),
  finalized_at = coalesce(finalized_at, completed_at),
  current_question_index = greatest(0, least(15, coalesce(current_question_index, 0))),
  answers_json = coalesce(answers_json, '[]'::jsonb)
where
  status is null
  or started_at is null
  or finalized_at is null
  or answers_json is null
  or current_question_index is null;

alter table public.ica_tests
  alter column status set default 'completed',
  alter column status set not null,
  alter column started_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ica_tests_status_check'
      and conrelid = 'public.ica_tests'::regclass
  ) then
    alter table public.ica_tests
      add constraint ica_tests_status_check
      check (status in ('running', 'completed', 'failed'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ica_tests_current_question_index_check'
      and conrelid = 'public.ica_tests'::regclass
  ) then
    alter table public.ica_tests
      add constraint ica_tests_current_question_index_check
      check (current_question_index between 0 and 15);
  end if;
end
$$;

commit;
