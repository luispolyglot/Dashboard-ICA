alter table public.coaching_session_classes
  add column if not exists student_guideline_response_1 text,
  add column if not exists student_guideline_response_2 text,
  add column if not exists student_guideline_response_3 text;
