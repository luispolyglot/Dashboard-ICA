begin;

create or replace function public.lexicards_protect_activation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.activation_count := greatest(
    coalesce(old.activation_count, 0),
    coalesce(new.activation_count, 0)
  );

  new.first_activated_at := coalesce(
    least(old.first_activated_at, new.first_activated_at),
    old.first_activated_at,
    new.first_activated_at
  );

  new.last_activated_at := coalesce(
    greatest(old.last_activated_at, new.last_activated_at),
    old.last_activated_at,
    new.last_activated_at
  );

  return new;
end;
$$;

drop trigger if exists lexicards_protect_activation_fields_trigger on public.lexicards;
create trigger lexicards_protect_activation_fields_trigger
before update on public.lexicards
for each row execute procedure public.lexicards_protect_activation_fields();

commit;
