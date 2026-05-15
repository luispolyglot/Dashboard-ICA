begin;

alter table public.master_notes
  drop constraint if exists master_notes_name_check;

update public.master_notes
set name = regexp_replace(name, '^\s*NOTA\s+MAESTRA\s*:\s*', 'Nota Maestra: ', 'i')
where name ~* '^\s*NOTA\s+MAESTRA\s*:';

alter table public.master_notes
  add constraint master_notes_name_check
  check (name like 'Nota Maestra:%');

commit;
