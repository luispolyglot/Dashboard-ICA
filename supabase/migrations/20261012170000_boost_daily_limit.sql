-- POTENCIAR: MÁXIMO 3 AL DÍA (Luis, 12 Oct 2026)
--
-- A student can now boost words from three places (Inmersión, the results of a Desafío ICA and
-- PreguntICA), but never more than 3 words a day in total, counted by the server.
-- - lexicard_boost_uses: one row per boost, with the student's local day and where it came from.
--   Written only by boost_lexicard (a student can read their own rows, nothing else).
-- - boost_lexicard(id, source): boosts the word as before and returns { used, remaining, limit }.
--   The 4th boost of the day fails with BOOST_DAILY_LIMIT. Boosting a word that was boosted a
--   moment ago (nothing used up yet) costs nothing.
-- - get_my_lexicard_boost_usage(): the same numbers, to show «quedan N hoy».
-- Nothing changes for words that were never boosted; games and counters work as before.

begin;

create table if not exists public.lexicard_boost_uses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  lexicard_id uuid references public.lexicards (id) on delete set null,
  boost_day date not null,
  source text not null default 'immersion'
    check (source in ('immersion', 'challenge', 'preguntica')),
  created_at timestamptz not null default now()
);

create index if not exists lexicard_boost_uses_user_day_idx
  on public.lexicard_boost_uses (user_id, boost_day);

-- So that deleting a word does not have to read the whole table.
create index if not exists lexicard_boost_uses_lexicard_idx
  on public.lexicard_boost_uses (lexicard_id)
  where lexicard_id is not null;

alter table public.lexicard_boost_uses enable row level security;

revoke all on table public.lexicard_boost_uses from anon, authenticated;
grant select on table public.lexicard_boost_uses to authenticated;

drop policy if exists lexicard_boost_uses_select_own on public.lexicard_boost_uses;
create policy lexicard_boost_uses_select_own on public.lexicard_boost_uses
  for select to authenticated
  using (user_id = auth.uid());

-- The old version returned nothing; the new one returns the numbers of the day. Old app versions
-- that call it with only the id keep working (source defaults to 'immersion').
drop function if exists public.boost_lexicard(uuid);

create or replace function public.boost_lexicard(p_id uuid, p_source text default 'immersion')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit constant integer := 3;
  v_day date;
  v_used integer;
  v_source text := case when p_source in ('immersion', 'challenge', 'preguntica') then p_source else 'immersion' end;
  v_fresh boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Two taps at once from the same student cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('boost_lexicard:' || v_user::text, 0));

  v_day := public.ica_local_today(v_user);
  select count(*) into v_used
    from public.lexicard_boost_uses u
   where u.user_id = v_user and u.boost_day = v_day;

  select (l.boost_flash >= 2 and l.boost_daily >= 2 and l.boost_duel >= 2)
    into v_fresh
    from public.lexicards l
   where l.id = p_id and l.user_id = v_user;
  if not found then
    raise exception 'LEXICARD_NOT_FOUND';
  end if;

  -- Already boosted and not played yet: nothing to do, nothing used up.
  if v_fresh then
    return jsonb_build_object('used', v_used, 'remaining', greatest(0, v_limit - v_used), 'limit', v_limit);
  end if;

  if v_used >= v_limit then
    raise exception 'BOOST_DAILY_LIMIT';
  end if;

  update public.lexicards
     set importance = 'vital',
         boost_flash = 2,
         boost_daily = 2,
         boost_duel = 2,
         updated_at = now()
   where id = p_id
     and user_id = v_user;

  insert into public.lexicard_boost_uses (user_id, lexicard_id, boost_day, source)
  values (v_user, p_id, v_day, v_source);

  v_used := v_used + 1;
  return jsonb_build_object('used', v_used, 'remaining', greatest(0, v_limit - v_used), 'limit', v_limit);
end;
$$;

revoke all on function public.boost_lexicard(uuid, text) from public, anon;
grant execute on function public.boost_lexicard(uuid, text) to authenticated;

create or replace function public.get_my_lexicard_boost_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit constant integer := 3;
  v_used integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select count(*) into v_used
    from public.lexicard_boost_uses u
   where u.user_id = v_user and u.boost_day = public.ica_local_today(v_user);
  return jsonb_build_object('used', v_used, 'remaining', greatest(0, v_limit - v_used), 'limit', v_limit);
end;
$$;

revoke all on function public.get_my_lexicard_boost_usage() from public, anon;
grant execute on function public.get_my_lexicard_boost_usage() to authenticated;

commit;
