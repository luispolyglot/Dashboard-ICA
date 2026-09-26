-- NOTA DESAFIANTE: solo las notas maestras CERRADAS cuentan escucha para el desbloqueo.
-- Mientras la nota está abierta (menos de 3:00) no suma nada ni se puede desbloquear.

begin;

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
  v_state text;
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

  select mn.total_duration_ms, mn.state
  into v_duration_ms, v_state
  from public.master_notes mn
  where mn.id = p_note_id
    and mn.user_id = v_user_id;

  if not found then
    raise exception 'MASTER_NOTE_NOT_FOUND';
  end if;

  if v_state is distinct from 'closed' then
    raise exception 'MASTER_NOTE_NOT_CLOSED';
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
