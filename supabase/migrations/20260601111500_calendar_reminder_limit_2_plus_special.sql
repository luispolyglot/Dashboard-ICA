begin;

create or replace function public.enforce_calendar_icademy_pref_limit()
returns trigger
language plpgsql
as $$
declare
  enabled_non_special_count integer;
begin
  if new.notifications_enabled is distinct from true then
    return new;
  end if;

  if new.class_key = 'destripando_niveles' then
    return new;
  end if;

  select count(*)
  into enabled_non_special_count
  from public.users_calendar_icademy uci
  where uci.user_id = new.user_id
    and uci.notifications_enabled = true
    and uci.class_key <> new.class_key
    and uci.class_key <> 'destripando_niveles';

  if enabled_non_special_count >= 2 then
    raise exception 'CALENDAR_REMINDERS_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

commit;
