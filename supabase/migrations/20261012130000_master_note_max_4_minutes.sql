-- MASTER NOTE: 4:00 AT MOST (Luis, 12 Oct 2026)
-- A note is completed when it reaches 3:00, but no master note may go past 4:00. The app stops the
-- recording by itself at 4:00; this trigger is the server-side guarantee, for new chunks and for
-- re-recordings (rerecord_master_note_chunk updates the chunk, so it goes through here too).
-- One second of margin for the recorder's own timing (4:00.999 still shows as 4:00).
-- Notes already longer than 4:00 are left as they are: a re-recording there may keep or lower the
-- total, never raise it.

create or replace function public.master_note_chunks_max_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_others integer;
  v_new_total integer;
  v_old_total integer;
begin
  if tg_op = 'UPDATE' and new.duration_ms is not distinct from old.duration_ms
     and new.master_note_id is not distinct from old.master_note_id then
    return new;
  end if;

  select coalesce(sum(c.duration_ms), 0)::integer into v_others
  from public.master_note_chunks c
  where c.master_note_id = new.master_note_id
    and c.id <> new.id;

  v_new_total := v_others + coalesce(new.duration_ms, 0);
  v_old_total := v_others + case when tg_op = 'UPDATE' then coalesce(old.duration_ms, 0) else 0 end;

  if v_new_total > 240999 and (tg_op = 'INSERT' or v_new_total > v_old_total) then
    raise exception 'MASTER_NOTE_MAX_4_00';
  end if;
  return new;
end;
$$;

drop trigger if exists master_note_chunks_max_total_trigger on public.master_note_chunks;
create trigger master_note_chunks_max_total_trigger
before insert or update of duration_ms, master_note_id on public.master_note_chunks
for each row execute function public.master_note_chunks_max_total();
