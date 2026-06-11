begin;

create table if not exists public.master_note_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_lang text,
  native_lang text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) >= 1),
  check (
    (target_lang is null and native_lang is null)
    or (target_lang is not null and native_lang is not null)
  )
);

create table if not exists public.master_note_playlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  playlist_id uuid not null references public.master_note_playlists (id) on delete cascade,
  master_note_id uuid not null references public.master_notes (id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists master_note_playlists_user_idx
  on public.master_note_playlists (user_id, target_lang, created_at desc);

create index if not exists master_note_playlist_items_playlist_idx
  on public.master_note_playlist_items (playlist_id, sort_order, created_at);

create unique index if not exists master_note_playlist_items_playlist_note_key
  on public.master_note_playlist_items (playlist_id, master_note_id);

drop trigger if exists master_note_playlists_set_updated_at on public.master_note_playlists;
create trigger master_note_playlists_set_updated_at
before update on public.master_note_playlists
for each row execute procedure public.set_updated_at();

alter table public.master_note_playlists enable row level security;
alter table public.master_note_playlist_items enable row level security;

drop policy if exists "master_note_playlists_all_own" on public.master_note_playlists;
create policy "master_note_playlists_all_own"
on public.master_note_playlists
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "master_note_playlist_items_all_own" on public.master_note_playlist_items;
create policy "master_note_playlist_items_all_own"
on public.master_note_playlist_items
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.master_note_playlists p
    where p.id = playlist_id
      and p.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.master_note_playlists p
    where p.id = playlist_id
      and p.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.master_notes mn
    where mn.id = master_note_id
      and mn.user_id = auth.uid()
      and mn.state = 'closed'
  )
);

commit;
