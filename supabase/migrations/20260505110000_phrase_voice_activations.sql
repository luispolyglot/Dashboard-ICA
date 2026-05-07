begin;

create table if not exists public.phrase_voice_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase_generation_id uuid not null references public.phrase_generations (id) on delete cascade,
  storage_path text not null,
  duration_ms integer,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phrase_voice_activations_user_phrase_idx
  on public.phrase_voice_activations (user_id, phrase_generation_id, created_at desc);

create unique index if not exists phrase_voice_activations_storage_path_key
  on public.phrase_voice_activations (storage_path);

drop trigger if exists phrase_voice_activations_set_updated_at on public.phrase_voice_activations;
create trigger phrase_voice_activations_set_updated_at
before update on public.phrase_voice_activations
for each row execute procedure public.set_updated_at();

alter table public.phrase_voice_activations enable row level security;

drop policy if exists "phrase_voice_activations_all_own" on public.phrase_voice_activations;
create policy "phrase_voice_activations_all_own"
on public.phrase_voice_activations
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
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
  'phrase-activations',
  'phrase-activations',
  false,
  10485760,
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

drop policy if exists "phrase_activation_audio_select_own" on storage.objects;
create policy "phrase_activation_audio_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'phrase-activations'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "phrase_activation_audio_insert_own" on storage.objects;
create policy "phrase_activation_audio_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'phrase-activations'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "phrase_activation_audio_update_own" on storage.objects;
create policy "phrase_activation_audio_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'phrase-activations'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'phrase-activations'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "phrase_activation_audio_delete_own" on storage.objects;
create policy "phrase_activation_audio_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'phrase-activations'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
