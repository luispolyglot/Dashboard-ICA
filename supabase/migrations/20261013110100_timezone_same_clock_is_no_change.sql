-- ZONA HORARIA: NO CONTAR COMO CAMBIO LO QUE NO CAMBIA NADA (Luis, 13 Oct 2026)
--
-- After the launch, some students went back and forth between two zones with the same clock
-- (one device on Europe/Madrid and another on Europe/Vienna, Warsaw or Zurich). Every switch was
-- saved as a change, and after 4 in a day the app got TIMEZONE_CHANGE_RATE_LIMIT again and again
-- (84 errors from 2 students on 12 Oct). Now a zone with the same clock as the saved one, now and
-- in six months, keeps the saved one and is not counted. Everything else is as before.
-- The app also stops asking after the limit (src/auth/AuthContext.tsx).

begin;

create or replace function public.set_my_timezone(p_timezone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  previous_timezone text;
  resolved_timezone text;
  recent_changes integer;
  old_today_local date;
  new_today_local date;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(nullif(p.timezone, ''), 'UTC') into previous_timezone
  from public.profiles p where p.id = v_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  -- The app asks with the zone it already has most of the time: answer at once, without the slow
  -- pg_timezone_names lookup below (~220 ms).
  if nullif(trim(p_timezone), '') = previous_timezone then return previous_timezone; end if;

  select tzn.name into resolved_timezone
  from pg_timezone_names tzn
  where tzn.name = nullif(trim(p_timezone), '')
  limit 1;
  if resolved_timezone is null then raise exception 'TIMEZONE_INVALID'; end if;
  if resolved_timezone = coalesce(previous_timezone, 'UTC') then return resolved_timezone; end if;

  -- Same clock as the zone already saved (Madrid and Vienna, Warsaw or Zurich): nothing changes
  -- for the student's days, so it is not a change. Checked now and every 3 months for a year, so
  -- two zones that differ in some season (summer time) still count as different (Luis, 13 Oct).
  -- ica_valid_timezone, not pg_timezone_names: that view reads every zone from disk (~220 ms).
  if public.ica_valid_timezone(previous_timezone) is not null
     and not exists (
       select 1
       from generate_series(0, 3) as q(n),
            lateral (select now() + make_interval(months => 3 * q.n) as at) moment
       where (moment.at at time zone resolved_timezone) <> (moment.at at time zone previous_timezone)
     ) then
    return previous_timezone;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':timezone-change'));
  select count(*)::integer into recent_changes
  from public.ica_timezone_change_log l
  where l.user_id = v_user_id and l.changed_at > now() - interval '24 hours';
  if recent_changes >= 4 then raise exception 'TIMEZONE_CHANGE_RATE_LIMIT'; end if;

  insert into public.ica_timezone_change_log (user_id, previous_timezone, next_timezone)
  values (v_user_id, coalesce(previous_timezone, 'UTC'), resolved_timezone);
  update public.profiles set timezone = resolved_timezone where id = v_user_id;
  update public.ica_daily_limit_usage u
  set usage_day = public.ica_local_date(v_user_id, u.created_at)
  where u.user_id = v_user_id;

  old_today_local := (now() at time zone coalesce(previous_timezone, 'UTC'))::date;
  new_today_local := (now() at time zone resolved_timezone)::date;
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, old_today_local);
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, old_today_local - 1);
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, new_today_local);
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, new_today_local - 1);
  return resolved_timezone;
end;
$$;
revoke all on function public.set_my_timezone(text) from public, anon;
grant execute on function public.set_my_timezone(text) to authenticated;

commit;
