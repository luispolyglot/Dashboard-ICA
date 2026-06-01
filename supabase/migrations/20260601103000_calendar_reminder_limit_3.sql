begin;

create or replace function public.enforce_calendar_icademy_pref_limit()
returns trigger
language plpgsql
as $$
declare
  enabled_count integer;
begin
  if new.notifications_enabled is distinct from true then
    return new;
  end if;

  select count(*)
  into enabled_count
  from public.users_calendar_icademy uci
  where uci.user_id = new.user_id
    and uci.notifications_enabled = true
    and uci.class_key <> new.class_key;

  if enabled_count >= 3 then
    raise exception 'CALENDAR_REMINDERS_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

commit;
