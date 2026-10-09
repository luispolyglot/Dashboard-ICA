-- POTENCIAR UNA PALABRA ICA (Luis, 8 Oct)
--
-- In Inmersión, when the word is already in the Baúl ICA, the student can "potenciar" it instead
-- of saving it again. A boosted word becomes Vital and comes FIRST in the next 2 games of each
-- kind: flashcards (2 rounds), the daily challenge (2 days) and Desafíos ICA (2 challenges).
-- - lexicards.boost_flash / boost_daily / boost_duel: games left with the boost (0 = none).
-- - boost_lexicard(id): the student boosts one of their own words (2 games of each kind).
-- - consume_lexicard_boosts(ids, game, user): one game played with those words. Students can
--   only use up their own boosts; the Desafíos server (service role) passes the owner.
-- Nothing changes for words that were never boosted.

begin;

alter table public.lexicards
  add column if not exists boost_flash smallint not null default 0,
  add column if not exists boost_daily smallint not null default 0,
  add column if not exists boost_duel smallint not null default 0;

-- Only the few boosted words are ever looked up by these columns.
create index if not exists lexicards_boosted_idx
  on public.lexicards (user_id)
  where boost_flash > 0 or boost_daily > 0 or boost_duel > 0;

create or replace function public.boost_lexicard(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.lexicards
     set importance = 'vital',
         boost_flash = 2,
         boost_daily = 2,
         boost_duel = 2,
         updated_at = now()
   where id = p_id
     and user_id = auth.uid();
  if not found then
    raise exception 'LEXICARD_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.boost_lexicard(uuid) from public, anon;
grant execute on function public.boost_lexicard(uuid) to authenticated;

create or replace function public.consume_lexicard_boosts(
  p_ids uuid[],
  p_game text,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- A signed-in student always uses up their own boosts; p_user_id is only for the server.
  v_user uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_user is null or p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  if p_game = 'flash' then
    update public.lexicards set boost_flash = boost_flash - 1
     where user_id = v_user and id = any(p_ids) and boost_flash > 0;
  elsif p_game = 'daily' then
    update public.lexicards set boost_daily = boost_daily - 1
     where user_id = v_user and id = any(p_ids) and boost_daily > 0;
  elsif p_game = 'duel' then
    update public.lexicards set boost_duel = boost_duel - 1
     where user_id = v_user and id = any(p_ids) and boost_duel > 0;
  end if;
end;
$$;

revoke all on function public.consume_lexicard_boosts(uuid[], text, uuid) from public, anon;
grant execute on function public.consume_lexicard_boosts(uuid[], text, uuid) to authenticated, service_role;

commit;
