begin;

alter table public.ica_tests
  alter column total_questions set default 12;

alter table public.ica_tests
  drop constraint if exists ica_tests_score_range_check,
  drop constraint if exists ica_tests_total_questions_check,
  drop constraint if exists ica_tests_current_question_index_check;

alter table public.ica_tests
  add constraint ica_tests_total_questions_check
    check (total_questions in (12, 15)),
  add constraint ica_tests_score_range_check
    check (score >= 0 and score <= total_questions),
  add constraint ica_tests_current_question_index_check
    check (current_question_index >= 0 and current_question_index <= total_questions);

alter table public.ica_tests_dev
  alter column total_questions set default 12;

alter table public.ica_tests_dev
  drop constraint if exists ica_tests_dev_score_range_check,
  drop constraint if exists ica_tests_dev_total_questions_check,
  drop constraint if exists ica_tests_dev_current_question_index_check;

alter table public.ica_tests_dev
  add constraint ica_tests_dev_total_questions_check
    check (total_questions in (12, 15)),
  add constraint ica_tests_dev_score_range_check
    check (score >= 0 and score <= total_questions),
  add constraint ica_tests_dev_current_question_index_check
    check (current_question_index >= 0 and current_question_index <= total_questions);

commit;
