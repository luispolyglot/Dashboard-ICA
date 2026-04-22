create or replace function public.enforce_whitelist_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  can_register_user boolean;
begin
  normalized_email := lower(trim(new.email));

  select w.can_register
  into can_register_user
  from public.auth_whitelist w
  where w.email = normalized_email;

  if coalesce(can_register_user, false) is false then
    raise exception 'SIGNUP_NOT_ALLOWED';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_whitelist_on_signup on auth.users;
create trigger enforce_whitelist_on_signup
before insert on auth.users
for each row execute procedure public.enforce_whitelist_on_signup();
