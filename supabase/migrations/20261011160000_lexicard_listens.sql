-- ESCUCHAR MI BAÚL ICA (Luis, 11 Oct 2026; idea de Natalia): the vault words a student has already
-- heard in the «Escuchar» player, so the filter «Sin escuchar aún» can leave them out.
-- One row per student and word, written the first time the word is played. Each student only sees
-- and adds their own rows, and only for their own words.

begin;

create table if not exists public.lexicard_listens (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lexicard_id uuid not null references public.lexicards (id) on delete cascade,
  first_listened_at timestamptz not null default now(),
  primary key (user_id, lexicard_id)
);

alter table public.lexicard_listens enable row level security;

revoke all on table public.lexicard_listens from anon, authenticated;
grant select, insert on table public.lexicard_listens to authenticated;

drop policy if exists lexicard_listens_select_own on public.lexicard_listens;
create policy lexicard_listens_select_own on public.lexicard_listens
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists lexicard_listens_insert_own on public.lexicard_listens;
create policy lexicard_listens_insert_own on public.lexicard_listens
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.lexicards l
      where l.id = lexicard_id and l.user_id = auth.uid()
    )
  );

commit;
