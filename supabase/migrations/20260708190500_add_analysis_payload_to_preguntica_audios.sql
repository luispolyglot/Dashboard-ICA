begin;

alter table public.preguntica_attempt_audios
  add column if not exists analysis_score numeric(4, 1),
  add column if not exists analysis_payload jsonb not null default '{}'::jsonb;

commit;
