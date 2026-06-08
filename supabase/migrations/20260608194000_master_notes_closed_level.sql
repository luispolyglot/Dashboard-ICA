begin;

alter table public.master_notes
  add column if not exists closed_level text;

commit;
