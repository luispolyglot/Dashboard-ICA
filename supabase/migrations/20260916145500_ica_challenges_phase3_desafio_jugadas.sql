begin;

create table if not exists public.desafio_jugadas (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.ica_challenges (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  indice smallint not null,
  acierto boolean not null,
  ms integer,
  payload jsonb not null default '{}'::jsonb,
  creado_at timestamptz not null default now(),
  constraint desafio_jugadas_indice_non_negative check (indice >= 0),
  constraint desafio_jugadas_ms_non_negative check (ms is null or ms >= 0),
  constraint desafio_jugadas_unique_turn_move unique (desafio_id, usuario_id, indice)
);

create index if not exists desafio_jugadas_desafio_usuario_idx
  on public.desafio_jugadas (desafio_id, usuario_id, indice asc);

create index if not exists desafio_jugadas_usuario_creado_idx
  on public.desafio_jugadas (usuario_id, creado_at desc);

alter table public.desafio_jugadas enable row level security;

drop policy if exists "desafio_jugadas_select_own_challenges" on public.desafio_jugadas;
create policy "desafio_jugadas_select_own_challenges"
on public.desafio_jugadas
for select
using (
  auth.uid() = usuario_id
  or exists (
    select 1
    from public.ica_challenges c
    where c.id = desafio_jugadas.desafio_id
      and (c.challenger_user_id = auth.uid() or c.challenged_user_id = auth.uid())
  )
);

drop policy if exists "desafio_jugadas_insert_own_rows" on public.desafio_jugadas;
create policy "desafio_jugadas_insert_own_rows"
on public.desafio_jugadas
for insert
with check (
  auth.uid() = usuario_id
  and exists (
    select 1
    from public.ica_challenges c
    where c.id = desafio_jugadas.desafio_id
      and (c.challenger_user_id = auth.uid() or c.challenged_user_id = auth.uid())
  )
);

drop policy if exists "desafio_jugadas_update_own_rows" on public.desafio_jugadas;
create policy "desafio_jugadas_update_own_rows"
on public.desafio_jugadas
for update
using (auth.uid() = usuario_id)
with check (auth.uid() = usuario_id);

grant select, insert, update on public.desafio_jugadas to authenticated;

commit;
