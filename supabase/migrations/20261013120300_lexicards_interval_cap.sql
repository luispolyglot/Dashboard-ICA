-- FLASHCARDS: UN INTERVALO NUNCA PASA DE 365 DÍAS (Luis, 13 Oct 2026)
--
-- 20261013110000_flashcard_intervals_fix.sql lowers the intervals that went too far. But an app
-- that was already open (old or new version) keeps its words in memory and, on the next review,
-- uploads all of them again with the old intervals. This makes the database itself keep every
-- interval between 1 and 365 days, whoever saves it.
-- (A value above 2,147,483,647 still fails before reaching here, as before; the new app never
-- sends more than 365.)

begin;

create or replace function public.lexicards_cap_interval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.interval := least(greatest(coalesce(new.interval, 1), 1), 365);
  return new;
end;
$$;

revoke all on function public.lexicards_cap_interval() from public, anon, authenticated;

drop trigger if exists lexicards_cap_interval_trigger on public.lexicards;
create trigger lexicards_cap_interval_trigger
  before insert or update of interval on public.lexicards
  for each row execute function public.lexicards_cap_interval();

commit;
