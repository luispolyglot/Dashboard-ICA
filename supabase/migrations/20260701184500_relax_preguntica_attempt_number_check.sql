begin;

alter table public.preguntica_attempts
  drop constraint if exists preguntica_attempts_attempt_number_check;

alter table public.preguntica_attempts
  add constraint preguntica_attempts_attempt_number_check
  check (attempt_number >= 1);

commit;
