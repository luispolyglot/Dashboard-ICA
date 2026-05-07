begin;

alter table public.master_notes
  add column if not exists close_type text not null default 'final'
  check (close_type in ('final', 'temporal'));

commit;
