begin;

create table if not exists public.master_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  state text not null default 'open' check (state in ('open', 'closed')),
  total_duration_ms integer not null default 0,
  final_audio_path text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name like 'NOTA MAESTRA:%')
);

create table if not exists public.master_note_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  master_note_id uuid not null references public.master_notes (id) on delete cascade,
  phrase_generation_id uuid not null references public.phrase_generations (id) on delete cascade,
  storage_path text not null,
  duration_ms integer not null check (duration_ms > 0),
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists master_notes_user_idx
  on public.master_notes (user_id, created_at desc);

create index if not exists master_note_chunks_note_idx
  on public.master_note_chunks (master_note_id, sort_order, created_at);

create unique index if not exists master_note_chunks_storage_path_key
  on public.master_note_chunks (storage_path);

drop trigger if exists master_notes_set_updated_at on public.master_notes;
create trigger master_notes_set_updated_at
before update on public.master_notes
for each row execute procedure public.set_updated_at();

alter table public.master_notes enable row level security;
alter table public.master_note_chunks enable row level security;

drop policy if exists "master_notes_all_own" on public.master_notes;
create policy "master_notes_all_own"
on public.master_notes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "master_note_chunks_all_own" on public.master_note_chunks;
create policy "master_note_chunks_all_own"
on public.master_note_chunks
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.master_notes mn
    where mn.id = master_note_id
      and mn.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.phrase_generations pg
    where pg.id = phrase_generation_id
      and pg.user_id = auth.uid()
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'master-notes',
  'master-notes',
  false,
  15728640,
  array[
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/ogg;codecs=opus'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "master_note_audio_select_own" on storage.objects;
create policy "master_note_audio_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'master-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "master_note_audio_insert_own" on storage.objects;
create policy "master_note_audio_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'master-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "master_note_audio_update_own" on storage.objects;
create policy "master_note_audio_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'master-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'master-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "master_note_audio_delete_own" on storage.objects;
create policy "master_note_audio_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'master-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
