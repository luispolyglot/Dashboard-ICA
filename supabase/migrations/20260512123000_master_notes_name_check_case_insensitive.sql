begin;

alter table public.master_notes
  drop constraint if exists master_notes_name_check;

alter table public.master_notes
  add constraint master_notes_name_check
  check (lower(btrim(name)) like 'nota maestra:%');

commit;
