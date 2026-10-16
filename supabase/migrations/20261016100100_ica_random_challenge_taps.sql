-- DESAFÍO ALEATORIO: CONTAR LOS CLICS (Luis, 16 Oct 2026)
--
-- Hasta hoy no se guardaba quién pulsa «Desafío aleatorio» en Inicio ni qué pasa después, así que
-- no se podía saber si la gente lo usa. Cada pulsación guarda una fila al pulsar y otra con lo
-- que pasó al final, unidas por tap_id:
--   tap          pulsó el botón y empezó la búsqueda
--   locked       pulsó con menos de 20 palabras ICA activadas (el botón está bloqueado)
--   sent         se envió el desafío (el reto es el de ica_challenges de esa persona en ese segundo)
--   no_rival     no había nadie libre para retar
--   needs_pass   ya tenía 3 desafíos y se le ofreció «Un desafío más» por ICA Coins
--   cancelled    cerró la pantalla antes de que se enviara
--   error        algo falló (sin conexión, el servidor dijo que no…)
-- Cada alumno solo añade sus propias filas y no puede leerlas; se consultan desde Supabase
-- (por ejemplo: select event, count(*) from public.ica_random_challenge_taps group by 1).

begin;

create table if not exists public.ica_random_challenge_taps (
  id bigint generated always as identity primary key,
  tap_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event text not null
    constraint ica_random_challenge_taps_event_check
    check (event in ('tap', 'locked', 'sent', 'no_rival', 'needs_pass', 'cancelled', 'error')),
  created_at timestamptz not null default now()
);

create index if not exists ica_random_challenge_taps_created_idx
  on public.ica_random_challenge_taps (created_at desc);
create index if not exists ica_random_challenge_taps_tap_idx
  on public.ica_random_challenge_taps (tap_id);

alter table public.ica_random_challenge_taps enable row level security;

revoke all on table public.ica_random_challenge_taps from anon, authenticated;
grant insert on table public.ica_random_challenge_taps to authenticated;

drop policy if exists ica_random_challenge_taps_insert_own on public.ica_random_challenge_taps;
create policy ica_random_challenge_taps_insert_own on public.ica_random_challenge_taps
  for insert to authenticated
  with check (user_id = auth.uid());

commit;
