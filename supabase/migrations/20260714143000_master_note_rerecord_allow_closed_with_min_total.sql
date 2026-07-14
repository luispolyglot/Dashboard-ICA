begin;

create or replace function public.rerecord_master_note_chunk(
  p_user_id uuid,
  p_note_id uuid,
  p_chunk_id uuid,
  p_phrase_generation_id uuid,
  p_storage_path text,
  p_duration_ms integer,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (
  chunk_id uuid,
  note_id uuid,
  phrase_generation_id uuid,
  storage_path text,
  duration_ms integer,
  mime_type text,
  size_bytes bigint,
  total_duration_ms integer,
  previous_chunk_storage_path text,
  previous_activation_storage_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note_user_id uuid;
  v_note_state text;
  v_note_total_duration_ms integer;
  v_chunk_phrase_generation_id uuid;
  v_chunk_storage_path text;
  v_chunk_duration_ms integer;
  v_activation_id uuid;
  v_activation_storage_path text;
  v_total_duration_ms integer;
  v_next_total_duration_ms integer;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_note_id is null or p_chunk_id is null or p_phrase_generation_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  if coalesce(trim(p_storage_path), '') = '' then
    raise exception 'INVALID_STORAGE_PATH';
  end if;

  if p_duration_ms is null or p_duration_ms <= 0 then
    raise exception 'INVALID_DURATION';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'INVALID_SIZE';
  end if;

  select mn.user_id, mn.state, mn.total_duration_ms
  into v_note_user_id, v_note_state, v_note_total_duration_ms
  from public.master_notes mn
  where mn.id = p_note_id
  for update;

  if not found or v_note_user_id <> p_user_id then
    raise exception 'MASTER_NOTE_NOT_FOUND';
  end if;

  if v_note_state not in ('open', 'closed') then
    raise exception 'MASTER_NOTE_NOT_EDITABLE';
  end if;

  select c.phrase_generation_id, c.storage_path, c.duration_ms
  into v_chunk_phrase_generation_id, v_chunk_storage_path, v_chunk_duration_ms
  from public.master_note_chunks c
  where c.id = p_chunk_id
    and c.master_note_id = p_note_id
    and c.user_id = p_user_id
  for update;

  if not found then
    raise exception 'MASTER_NOTE_CHUNK_NOT_FOUND';
  end if;

  if v_chunk_phrase_generation_id <> p_phrase_generation_id then
    raise exception 'CHUNK_PHRASE_MISMATCH';
  end if;

  v_next_total_duration_ms := greatest(
    0,
    coalesce(v_note_total_duration_ms, 0) - coalesce(v_chunk_duration_ms, 0) + p_duration_ms
  );

  if v_note_state = 'closed' and v_next_total_duration_ms < 210000 then
    raise exception 'CLOSED_NOTE_MIN_TOTAL_3_30';
  end if;

  select pva.id, pva.storage_path
  into v_activation_id, v_activation_storage_path
  from public.phrase_voice_activations pva
  where pva.user_id = p_user_id
    and pva.activation_source = 'master_note_chunk'
    and pva.activation_source_id = p_chunk_id
  for update;

  if not found then
    raise exception 'CHUNK_ACTIVATION_NOT_FOUND';
  end if;

  update public.master_note_chunks
  set
    storage_path = p_storage_path,
    duration_ms = p_duration_ms,
    mime_type = p_mime_type,
    size_bytes = p_size_bytes
  where id = p_chunk_id;

  update public.phrase_voice_activations
  set
    storage_path = p_storage_path,
    duration_ms = p_duration_ms,
    mime_type = p_mime_type,
    size_bytes = p_size_bytes,
    status = 'uploaded'
  where id = v_activation_id;

  select coalesce(sum(c.duration_ms), 0)::integer
  into v_total_duration_ms
  from public.master_note_chunks c
  where c.master_note_id = p_note_id;

  update public.master_notes
  set total_duration_ms = v_total_duration_ms
  where id = p_note_id;

  return query
  select
    p_chunk_id,
    p_note_id,
    p_phrase_generation_id,
    p_storage_path,
    p_duration_ms,
    p_mime_type,
    p_size_bytes,
    v_total_duration_ms,
    v_chunk_storage_path,
    v_activation_storage_path;
end;
$$;

commit;
