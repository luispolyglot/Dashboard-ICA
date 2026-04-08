create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.auth_whitelist (
  email text primary key,
  can_register boolean not null default true,
  can_login boolean not null default true,
  source text not null default 'manual',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists auth_whitelist_set_updated_at on public.auth_whitelist;
create trigger auth_whitelist_set_updated_at
before update on public.auth_whitelist
for each row execute procedure public.set_updated_at();

alter table public.auth_whitelist enable row level security;

create or replace function public.whitelist_check_registration(email_input text)
returns table (
  allowed boolean,
  reason text
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select lower(trim(email_input)) as email
  )
  select
    case
      when w.email is null then false
      when w.can_register is false then false
      else true
    end as allowed,
    case
      when w.email is null then 'Este email no pertenece a la comunidad habilitada.'
      when w.can_register is false then 'El registro para este email esta deshabilitado por el administrador.'
      else 'Email habilitado para registro.'
    end as reason
  from normalized n
  left join public.auth_whitelist w on w.email = n.email;
$$;

create or replace function public.whitelist_check_login(email_input text)
returns table (
  allowed boolean,
  reason text
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select lower(trim(email_input)) as email
  )
  select
    case
      when w.email is null then false
      when w.can_login is false then false
      else true
    end as allowed,
    case
      when w.email is null then 'Este email no tiene acceso habilitado.'
      when w.can_login is false then 'El acceso de login para este email esta deshabilitado.'
      else 'Email habilitado para login.'
    end as reason
  from normalized n
  left join public.auth_whitelist w on w.email = n.email;
$$;

revoke all on function public.whitelist_check_registration(text) from public;
revoke all on function public.whitelist_check_login(text) from public;
grant execute on function public.whitelist_check_registration(text) to anon, authenticated;
grant execute on function public.whitelist_check_login(text) to anon, authenticated;
