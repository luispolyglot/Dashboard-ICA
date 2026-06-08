begin;

create or replace function public.lexicards_block_delete_when_activated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  if exists (
    select 1
    from public.phrase_lexicard_activations pla
    where pla.lexicard_id = old.id
  ) then
    raise exception 'LEXICARD_HAS_ACTIVATIONS';
  end if;

  return old;
end;
$$;

drop trigger if exists lexicards_block_delete_when_activated_trigger on public.lexicards;
create trigger lexicards_block_delete_when_activated_trigger
before delete on public.lexicards
for each row execute procedure public.lexicards_block_delete_when_activated();

commit;
