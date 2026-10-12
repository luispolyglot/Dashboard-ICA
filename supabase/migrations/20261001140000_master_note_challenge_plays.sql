-- NOTA DESAFIANTE: guardar cada partida terminada (tabla master_note_challenge_plays).
-- De momento solo se guarda. El 0,1 diario del ranking sigue siendo «10 minutos de escucha»
-- (Luis, 3 oct): estos datos servirán si en el futuro la nota desafiante cuenta para el ranking.

begin;

-- ---------------------------------------------------------------------------
-- 1. Notas desafiantes terminadas (una fila por partida)
-- ---------------------------------------------------------------------------
create table if not exists public.master_note_challenge_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.master_notes (id) on delete cascade,
  day date not null,
  correct integer not null default 0,
  total integer not null default 0,
  created_at timestamptz not null default now(),
  constraint master_note_challenge_plays_counts check (correct >= 0 and total >= 0 and correct <= total)
);

create index if not exists master_note_challenge_plays_user_day_idx
  on public.master_note_challenge_plays (user_id, day);

alter table public.master_note_challenge_plays enable row level security;

drop policy if exists "master_note_challenge_plays_select_own" on public.master_note_challenge_plays;
create policy "master_note_challenge_plays_select_own"
on public.master_note_challenge_plays
for select
using (auth.uid() = user_id);

-- Se escribe solo con esta función: comprueba que la nota es tuya y está cerrada.
create or replace function public.record_master_note_challenge_play(
  p_note_id uuid,
  p_day date,
  p_correct integer,
  p_total integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_state text;
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

  select mn.state into v_state
  from public.master_notes mn
  where mn.id = p_note_id
    and mn.user_id = v_user_id;

  if not found then
    raise exception 'MASTER_NOTE_NOT_FOUND';
  end if;

  if v_state is distinct from 'closed' then
    raise exception 'MASTER_NOTE_NOT_CLOSED';
  end if;

  insert into public.master_note_challenge_plays (user_id, note_id, day, correct, total)
  values (
    v_user_id,
    p_note_id,
    p_day,
    greatest(0, least(coalesce(p_correct, 0), coalesce(p_total, 0))),
    greatest(0, coalesce(p_total, 0))
  );
end;
$$;

revoke all on function public.record_master_note_challenge_play(uuid, date, integer, integer) from public, anon;
grant execute on function public.record_master_note_challenge_play(uuid, date, integer, integer) to authenticated;

commit;
