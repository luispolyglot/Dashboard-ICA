-- NOTA DESAFIANTE: interruptor, trozos solo escritos por el servidor y desbloqueo por escucha.
-- Requiere 20260924120000_nota_desafiante_phrase_chunks.sql (columnas challenge_*).

begin;

-- ---------------------------------------------------------------------------
-- 1. Feature flag (apagado por defecto). Se enciende desde la tabla, sin deploy.
--    "on conflict do nothing": volver a aplicar la migración no apaga un flag ya encendido.
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, name, description, is_enabled, rollout_percentage, app_env, payload)
values (
  'nota-desafiante',
  'Nota desafiante',
  'Juego de repaso de cada nota maestra (trozos de frase) y su desbloqueo al escuchar el 80 % de la nota.',
  false,
  100,
  'all',
  '{"owner":"product","notes":"default off"}'::jsonb
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Los trozos (challenge_*) solo los escribe el servidor (anthropic-proxy con service role).
--    Aunque exista una política de update para el alumno, sus cambios en estas columnas se ignoran.
-- ---------------------------------------------------------------------------
create or replace function public.phrase_generations_protect_challenge_columns()
returns trigger
language plpgsql
as $$
begin
  -- service_role = Edge Functions; postgres = SQL desde el panel o pasadas únicas.
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.challenge_chunks := null;
    new.challenge_ready := null;
    new.challenge_problem := null;
  else
    new.challenge_chunks := old.challenge_chunks;
    new.challenge_ready := old.challenge_ready;
    new.challenge_problem := old.challenge_problem;
  end if;
  return new;
end;
$$;

drop trigger if exists phrase_generations_protect_challenge_columns on public.phrase_generations;
create trigger phrase_generations_protect_challenge_columns
before insert or update on public.phrase_generations
for each row execute procedure public.phrase_generations_protect_challenge_columns();

-- ---------------------------------------------------------------------------
-- 3. Desbloqueo por escucha: segundos escuchados de cada nota, por día local del alumno.
--    Se desbloquea al llegar al 80 % de la duración de la nota y queda abierto ese día.
-- ---------------------------------------------------------------------------
create table if not exists public.master_note_challenge_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.master_notes (id) on delete cascade,
  day date not null,
  listened_seconds double precision not null default 0,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, note_id, day),
  constraint master_note_challenge_unlocks_listened_non_negative check (listened_seconds >= 0)
);

create index if not exists master_note_challenge_unlocks_user_day_idx
  on public.master_note_challenge_unlocks (user_id, day);

alter table public.master_note_challenge_unlocks enable row level security;

-- El alumno solo lee lo suyo. No hay políticas de escritura: solo se escribe con la RPC.
drop policy if exists "master_note_challenge_unlocks_select_own" on public.master_note_challenge_unlocks;
create policy "master_note_challenge_unlocks_select_own"
on public.master_note_challenge_unlocks
for select
using (auth.uid() = user_id);

create or replace function public.bump_master_note_challenge_listening(
  p_note_id uuid,
  p_day date,
  p_delta_seconds double precision
)
returns table (listened_seconds double precision, unlocked boolean, just_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_duration_ms bigint;
  v_cap_seconds double precision;
  v_needed_seconds double precision;
  v_delta double precision;
  v_before_unlocked boolean;
  v_row public.master_note_challenge_unlocks%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- El día lo decide el dispositivo (hora local), pero solo se acepta hoy ± 1 día.
  if p_day is null
    or p_day < (now() at time zone 'utc')::date - 1
    or p_day > (now() at time zone 'utc')::date + 1 then
    raise exception 'INVALID_DAY';
  end if;

  select mn.total_duration_ms
  into v_duration_ms
  from public.master_notes mn
  where mn.id = p_note_id
    and mn.user_id = v_user_id;

  if not found then
    raise exception 'MASTER_NOTE_NOT_FOUND';
  end if;

  -- Como mucho 2 minutos por envío, y nunca más que la duración de la nota en total.
  v_delta := least(greatest(coalesce(p_delta_seconds, 0), 0), 120);
  v_cap_seconds := greatest(coalesce(v_duration_ms, 0), 0) / 1000.0;
  v_needed_seconds := v_cap_seconds * 0.8;

  insert into public.master_note_challenge_unlocks as u (user_id, note_id, day, listened_seconds)
  values (v_user_id, p_note_id, p_day, 0)
  on conflict (user_id, note_id, day) do nothing;

  select u.unlocked_at is not null
  into v_before_unlocked
  from public.master_note_challenge_unlocks u
  where u.user_id = v_user_id and u.note_id = p_note_id and u.day = p_day
  for update;

  update public.master_note_challenge_unlocks u
  set
    listened_seconds = least(u.listened_seconds + v_delta, v_cap_seconds),
    unlocked_at = coalesce(
      u.unlocked_at,
      case
        when v_needed_seconds > 0 and least(u.listened_seconds + v_delta, v_cap_seconds) >= v_needed_seconds
          then now()
        else null
      end
    ),
    updated_at = now()
  where u.user_id = v_user_id and u.note_id = p_note_id and u.day = p_day
  returning u.* into v_row;

  listened_seconds := v_row.listened_seconds;
  unlocked := v_row.unlocked_at is not null;
  just_unlocked := unlocked and not v_before_unlocked;
  return next;
end;
$$;

revoke all on function public.bump_master_note_challenge_listening(uuid, date, double precision) from public, anon;
grant execute on function public.bump_master_note_challenge_listening(uuid, date, double precision) to authenticated;

commit;
