begin;

create or replace function public.set_my_timezone(p_timezone text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid;
  resolved_timezone text;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(tzn.name, 'UTC')
  into resolved_timezone
  from pg_timezone_names tzn
  where tzn.name = nullif(trim(p_timezone), '')
  limit 1;

  update public.profiles
  set timezone = resolved_timezone
  where id = current_user_id;

  return resolved_timezone;
end;
$$;

revoke all on function public.set_my_timezone(text) from public;
grant execute on function public.set_my_timezone(text) to authenticated;

commit;
