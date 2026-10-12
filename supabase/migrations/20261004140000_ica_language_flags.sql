-- LANGUAGE FLAG FOR 100 ICA COINS (Luis, 4 Oct)
--
-- In the ICA Coins shop a student can buy, for 100 coins, the flag of the language they are
-- learning right now (user_settings.target_lang). The flag becomes the background of the circle
-- with their initial (profile, top bar and monthly ranking).
-- - Only the flag of the current target language can be bought (the server reads it itself).
-- - A bought flag is kept forever, even after switching language.
-- - A student can own several flags and choose which one is shown (or none).

begin;

-- 1. New ledger entry type.
alter table public.preguntica_token_ledger
  drop constraint if exists preguntica_token_ledger_entry_type_check;
alter table public.preguntica_token_ledger
  add constraint preguntica_token_ledger_entry_type_check
  check (entry_type in (
    'monthly_earn',
    'redeem_unlock',
    'manual_adjustment',
    'cycle_chest',
    'streak_milestone',
    'flash_milestone',
    'challenge_win',
    'phase_boost',
    'challenge_pass',
    'flag_purchase'
  ));

create unique index if not exists preguntica_ledger_flag_purchase_once
  on public.preguntica_token_ledger (user_id, entry_type, reference_key)
  where entry_type = 'flag_purchase';

-- 2. Owned flags and the one shown.
create table if not exists public.ica_owned_flags (
  user_id uuid not null references auth.users (id) on delete cascade,
  lang text not null check (char_length(lang) between 1 and 40),
  ledger_entry_id uuid not null unique references public.preguntica_token_ledger (id) on delete restrict,
  bought_at timestamptz not null default now(),
  primary key (user_id, lang)
);
alter table public.ica_owned_flags enable row level security;
drop policy if exists ica_owned_flags_select_own on public.ica_owned_flags;
create policy ica_owned_flags_select_own
  on public.ica_owned_flags for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.ica_owned_flags from public, anon, authenticated;
grant select on public.ica_owned_flags to authenticated;

create table if not exists public.ica_display_flags (
  user_id uuid primary key,
  lang text not null,
  updated_at timestamptz not null default now(),
  foreign key (user_id, lang) references public.ica_owned_flags (user_id, lang) on delete cascade
);
alter table public.ica_display_flags enable row level security;
drop policy if exists ica_display_flags_select_own on public.ica_display_flags;
create policy ica_display_flags_select_own
  on public.ica_display_flags for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.ica_display_flags from public, anon, authenticated;
grant select on public.ica_display_flags to authenticated;

-- 3. Buy the flag of the current target language (and show it straight away).
create or replace function public.buy_language_flag()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lang text;
  current_balance numeric(10,2);
  ledger_id uuid;
  flag_cost constant integer := 100;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select nullif(trim(s.target_lang), '') into v_lang
  from public.user_settings s where s.user_id = v_user_id;
  if v_lang is null then raise exception 'TARGET_LANG_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));

  if exists (select 1 from public.ica_owned_flags f where f.user_id = v_user_id and f.lang = v_lang) then
    return jsonb_build_object('ok', true, 'alreadyOwned', true, 'lang', v_lang);
  end if;

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance from public.preguntica_token_ledger l where l.user_id = v_user_id;
  if current_balance < flag_cost then raise exception 'INSUFFICIENT_TOKENS'; end if;

  insert into public.preguntica_token_ledger (
    user_id, entry_type, tokens_delta, reference_day, reference_key, metadata
  ) values (
    v_user_id, 'flag_purchase', -flag_cost, public.ica_local_today(v_user_id), v_lang,
    jsonb_build_object('cost', flag_cost)
  )
  returning id into ledger_id;

  insert into public.ica_owned_flags (user_id, lang, ledger_entry_id) values (v_user_id, v_lang, ledger_id);
  insert into public.ica_display_flags (user_id, lang) values (v_user_id, v_lang)
  on conflict (user_id) do update set lang = excluded.lang, updated_at = now();

  return jsonb_build_object('ok', true, 'alreadyOwned', false, 'lang', v_lang);
end;
$$;
revoke all on function public.buy_language_flag() from public, anon;
grant execute on function public.buy_language_flag() to authenticated;

-- 4. Choose which owned flag is shown (null = none).
create or replace function public.set_my_display_flag(p_lang text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_lang is null then
    delete from public.ica_display_flags where user_id = v_user_id;
    return null;
  end if;
  if not exists (select 1 from public.ica_owned_flags f where f.user_id = v_user_id and f.lang = p_lang) then
    raise exception 'FLAG_NOT_OWNED';
  end if;
  insert into public.ica_display_flags (user_id, lang) values (v_user_id, p_lang)
  on conflict (user_id) do update set lang = excluded.lang, updated_at = now();
  return p_lang;
end;
$$;
revoke all on function public.set_my_display_flag(text) from public, anon;
grant execute on function public.set_my_display_flag(text) to authenticated;

-- 5. The ranking also returns each student's shown flag (current choice, also for past months).
drop function if exists public.get_monthly_streak_leaderboard(integer);
create function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint, user_id uuid, username text, display_name text, ica_streak_days integer,
  avg_percent numeric, review_percent numeric, creation_percent numeric, is_creation_streak_frozen boolean,
  ica_test_points numeric, listening_points numeric, preguntica_points numeric,
  instagram_points numeric, total_points numeric, featured_badge text, display_flag text
)
language sql
security definer
set search_path = public
as $$
  select core.rank, core.user_id, core.username, core.display_name, core.ica_streak_days,
    core.avg_percent, core.review_percent, core.creation_percent, core.is_creation_streak_frozen,
    core.ica_test_points, core.listening_points, core.preguntica_points, core.instagram_points,
    core.total_points, fb.badge, df.lang
  from public.get_monthly_streak_leaderboard_core(limit_count) core
  left join public.ica_featured_badges fb on fb.user_id = core.user_id
  left join public.ica_display_flags df on df.user_id = core.user_id
$$;
revoke all on function public.get_monthly_streak_leaderboard(integer) from public, anon;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

drop function if exists public.get_monthly_snapshot_leaderboard(date, integer, uuid);
create function public.get_monthly_snapshot_leaderboard(
  p_period_start date,
  limit_count integer default 33,
  include_user_id uuid default auth.uid()
)
returns table (
  rank bigint, user_id uuid, username text, display_name text, ica_streak_days integer,
  avg_percent numeric, review_percent numeric, creation_percent numeric, ica_test_points numeric,
  listening_points numeric, preguntica_points numeric, instagram_points numeric,
  total_points numeric, score integer, featured_badge text, display_flag text
)
language sql
security definer
set search_path = public
as $$
  select core.rank, core.user_id, core.username, core.display_name, core.ica_streak_days,
    core.avg_percent, core.review_percent, core.creation_percent, core.ica_test_points,
    core.listening_points, core.preguntica_points, core.instagram_points, core.total_points,
    core.score, ls.payload ->> 'featured_badge', df.lang
  from public.get_monthly_snapshot_leaderboard_core(p_period_start, limit_count, include_user_id) core
  left join public.leaderboard_snapshots ls
    on ls.period = 'monthly' and ls.period_start = p_period_start and ls.user_id = core.user_id
  left join public.ica_display_flags df on df.user_id = core.user_id
$$;
revoke all on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) from public, anon;
grant execute on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) to authenticated;

commit;
