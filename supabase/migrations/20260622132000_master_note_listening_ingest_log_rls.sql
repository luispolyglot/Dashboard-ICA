begin;

alter table public.master_note_listening_ingest_log enable row level security;

drop policy if exists "master_note_listening_ingest_log_select_own" on public.master_note_listening_ingest_log;
create policy "master_note_listening_ingest_log_select_own"
on public.master_note_listening_ingest_log
for select
using (auth.uid() = user_id);

commit;
