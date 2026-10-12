-- PROFILE BADGES (Luis, 4 Oct)
--
-- Besides the featured badge (next to the name, profile and ranking), each student picks up to
-- three earned badges that other students see when they open their profile.
-- - Stored as an ordered array (position = order shown).
-- - Every badge must be earned: validated with ica_featured_badge_earned (same rules as the app).
-- - Empty choice = no row: the app shows the three best badges automatically.
-- - Other students read them through get_profile_badges (authenticated only). Badges are already
--   visible to every student in the ranking, so they are not private data.

begin;

create table if not exists public.ica_profile_badges (
  user_id uuid primary key references auth.users (id) on delete cascade,
  badges text[] not null check (cardinality(badges) between 1 and 3),
  updated_at timestamptz not null default now()
);
alter table public.ica_profile_badges enable row level security;
drop policy if exists ica_profile_badges_select_own on public.ica_profile_badges;
create policy ica_profile_badges_select_own
  on public.ica_profile_badges for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.ica_profile_badges from public, anon, authenticated;
grant select on public.ica_profile_badges to authenticated;

-- Choose the profile badges (null or empty array = back to automatic).
create or replace function public.set_my_profile_badges(p_badges text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_badge text;
  v_clean text[] := array[]::text[];
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  if p_badges is null or cardinality(p_badges) = 0 then
    delete from public.ica_profile_badges where user_id = v_user_id;
    return array[]::text[];
  end if;

  if cardinality(p_badges) > 3 then raise exception 'PROFILE_BADGES_TOO_MANY'; end if;

  foreach v_badge in array p_badges loop
    if v_badge is null
      or v_badge !~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios):(bronce|plata|oro|rubi|diamante|leyenda1|leyenda2|leyenda3)$'
    then
      raise exception 'PROFILE_BADGE_INVALID';
    end if;
    if v_badge = any (v_clean) then raise exception 'PROFILE_BADGE_DUPLICATED'; end if;
    if not public.ica_featured_badge_earned(v_user_id, v_badge) then
      raise exception 'PROFILE_BADGE_NOT_EARNED';
    end if;
    v_clean := v_clean || v_badge;
  end loop;

  insert into public.ica_profile_badges (user_id, badges)
  values (v_user_id, v_clean)
  on conflict (user_id) do update set badges = excluded.badges, updated_at = now();
  return v_clean;
end;
$$;
revoke all on function public.set_my_profile_badges(text[]) from public, anon;
grant execute on function public.set_my_profile_badges(text[]) to authenticated;

-- Profile badges of any student (empty array when they did not choose any).
create or replace function public.get_profile_badges(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_badges text[];
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_user_id is null then return array[]::text[]; end if;
  select b.badges into v_badges from public.ica_profile_badges b where b.user_id = p_user_id;
  return coalesce(v_badges, array[]::text[]);
end;
$$;
revoke all on function public.get_profile_badges(uuid) from public, anon;
grant execute on function public.get_profile_badges(uuid) to authenticated;

commit;
