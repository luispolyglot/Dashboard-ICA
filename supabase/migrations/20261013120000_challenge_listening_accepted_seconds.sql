-- NOTA DESAFIANTE: QUE NO SE PIERDA LO ESCUCHADO (Luis, 13 Oct 2026)
--
-- In production the challenge notes showed unlocked on the phone and locked on the computer.
-- The phone counted everything it played; the server got much less. Two reasons:
--   1. The app waited for 10 s of silence before sending, so while listening it sent nothing and
--      then a whole note (200 s or more) in one go.
--   2. This function counts at most what fits in the time since the last send (+5 s), and 120 s
--      per call (on a note's first send of the week, only 20 s). The app then threw the rest away.
-- The rule stays the same (no faking listening). This only adds `accepted_seconds`, so the app
-- knows how much was counted and sends the rest again a little later. The app now also sends
-- every 10 s while listening (src/modules/services/challengeUnlocks.ts).
-- The return type changes, so the function is dropped and created again; the old app ignores
-- the new column.

begin;

drop function if exists public.bump_master_note_challenge_listening(uuid, date, double precision);

create or replace function public.bump_master_note_challenge_listening(
  p_note_id uuid,
  p_day date,
  p_delta_seconds double precision
)
returns table (
  listened_seconds double precision,
  unlocked boolean,
  just_unlocked boolean,
  -- What was counted from p_delta_seconds (the rest was too fast and the app sends it again later).
  accepted_seconds double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_duration_ms bigint;
  local_day date;
  week_day date;
  cap_seconds double precision;
  needed_seconds double precision;
  delta_seconds double precision;
  elapsed_seconds double precision;
  last_update_at timestamptz;
  before_unlocked boolean;
  unlock_row public.master_note_challenge_unlocks%rowtype;
begin
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Keep the historical argument for app compatibility; its value never chooses the week.
  if p_day is null then raise exception 'DAY_REQUIRED'; end if;
  v_duration_ms := public.ica_assert_note_challenge_eligibility(v_user_id, p_note_id);
  local_day := public.ica_local_today(v_user_id);
  week_day := local_day - (extract(isodow from local_day)::integer - 1);
  perform pg_advisory_xact_lock(hashtextextended('ica-note-challenge:' || v_user_id::text || ':' || week_day::text, 0));

  cap_seconds := greatest(coalesce(v_duration_ms, 0), 0) / 1000.0;
  needed_seconds := cap_seconds * 0.8;

  insert into public.master_note_challenge_unlocks as u (user_id, note_id, day, listened_seconds, updated_at)
  values (v_user_id, p_note_id, week_day, 0, clock_timestamp() - interval '15 seconds')
  on conflict (user_id, note_id, day) do nothing;

  select u.unlocked_at is not null, u.updated_at into before_unlocked, last_update_at
  from public.master_note_challenge_unlocks u
  where u.user_id = v_user_id and u.note_id = p_note_id and u.day = week_day
  for update;

  elapsed_seconds := greatest(0, extract(epoch from (clock_timestamp() - last_update_at)) + 5);
  delta_seconds := least(greatest(coalesce(p_delta_seconds, 0), 0), 120, elapsed_seconds);

  update public.master_note_challenge_unlocks u
  set listened_seconds = least(u.listened_seconds + delta_seconds, cap_seconds),
      unlocked_at = coalesce(
        u.unlocked_at,
        case when needed_seconds > 0 and least(u.listened_seconds + delta_seconds, cap_seconds) >= needed_seconds
          then now() else null end
      ),
      updated_at = now()
  where u.user_id = v_user_id and u.note_id = p_note_id and u.day = week_day
  returning u.* into unlock_row;

  listened_seconds := unlock_row.listened_seconds;
  unlocked := unlock_row.unlocked_at is not null;
  just_unlocked := unlocked and not coalesce(before_unlocked, false);
  accepted_seconds := delta_seconds;
  return next;
end;
$$;
revoke all on function public.bump_master_note_challenge_listening(uuid, date, double precision) from public, anon;
grant execute on function public.bump_master_note_challenge_listening(uuid, date, double precision) to authenticated;

commit;
