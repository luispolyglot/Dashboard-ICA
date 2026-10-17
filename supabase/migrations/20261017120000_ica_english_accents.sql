-- INGLÉS AMERICANO O BRITÁNICO VISIBLE PARA LOS DEMÁS (Luis, 17 Oct).
-- Cada alumno elige el acento del inglés (voz, micro y bandera). Se guardaba solo en su cuenta
-- (user_metadata.english_accent), que nadie más puede leer, así que en el ranking, el podio, el
-- perfil de otro icademer o el rival del reto aleatorio su bandera salía siempre americana.
-- Esta tabla guarda el acento de cada uno para que los demás vean su bandera.
-- Sin fila = americano (el acento por defecto). Leerla no cuenta nada privado: es solo una bandera.

create table if not exists public.ica_english_accents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  accent text not null check (accent in ('us', 'uk')),
  updated_at timestamptz not null default now()
);

alter table public.ica_english_accents enable row level security;

-- Todos los alumnos con sesión ven el acento de todos (como la bandera del ranking).
drop policy if exists ica_english_accents_select_all on public.ica_english_accents;
create policy ica_english_accents_select_all
  on public.ica_english_accents for select to authenticated
  using (true);

-- Cada uno solo escribe el suyo.
drop policy if exists ica_english_accents_insert_own on public.ica_english_accents;
create policy ica_english_accents_insert_own
  on public.ica_english_accents for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ica_english_accents_update_own on public.ica_english_accents;
create policy ica_english_accents_update_own
  on public.ica_english_accents for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.ica_english_accents from public, anon, authenticated;
grant select, insert, update on public.ica_english_accents to authenticated;

-- Los que ya lo eligieron hoy (antes de esta tabla): se copia de su cuenta.
insert into public.ica_english_accents (user_id, accent)
select id, raw_user_meta_data ->> 'english_accent'
from auth.users
where raw_user_meta_data ->> 'english_accent' in ('us', 'uk')
on conflict (user_id) do nothing;
