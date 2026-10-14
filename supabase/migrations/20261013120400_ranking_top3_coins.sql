-- RANKING DEL MES: 30, 20 Y 10 ICA COINS PARA EL TOP 3 (Luis, 13 Oct 2026)
--
-- When the monthly ranking closes (day 28, run_monthly_leaderboard_snapshot_if_needed), the first
-- place gets 30 ICA Coins, the second 20 and the third 10, on top of the usual coins for points
-- (monthly_earn). The ranking page already says so (LeaderboardView).
--  - New ledger type 'ranking_prize', at most one per student and month.
--  - Who gets it comes from the closed ranking (leaderboard_snapshots.rank, 1 to 3). A tie shares
--    the place, so both get that place's prize. Only with more than 0 points.
--  - If the closing runs again for the same month, the prizes follow the final ranking: they are
--    updated, and whoever is no longer in the top 3 loses theirs. Nothing is given twice.
-- The first month it applies is the one that closes after this goes up (October 2026).

begin;

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
    'flag_purchase',
    'monthly_review',
    'ranking_prize'
  ));

create unique index if not exists preguntica_ledger_ranking_prize_once
  on public.preguntica_token_ledger (user_id, entry_type, reference_month)
  where entry_type = 'ranking_prize';

-- 30 / 20 / 10 ICA Coins for places 1 / 2 / 3 of a closed month. Returns how many prizes it set.
create or replace function public.distribute_monthly_ranking_prizes(p_month_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prize_rows integer;
begin
  if p_month_start is null then
    return 0;
  end if;

  with winners as (
    select
      ls.user_id,
      ls.rank,
      case ls.rank when 1 then 30 when 2 then 20 when 3 then 10 end::numeric(10,2) as coins
    from public.leaderboard_snapshots ls
    where ls.period = 'monthly'
      and ls.period_start = p_month_start
      and ls.rank between 1 and 3
      and coalesce(nullif(ls.payload ->> 'total_points', '')::numeric, ls.score::numeric / 10) > 0
  ),
  removed as (
    delete from public.preguntica_token_ledger l
    where l.entry_type = 'ranking_prize'
      and l.reference_month = p_month_start
      and not exists (select 1 from winners w where w.user_id = l.user_id)
    returning 1
  ),
  upserted as (
    insert into public.preguntica_token_ledger (
      user_id, entry_type, tokens_delta, reference_month, reference_type, metadata
    )
    select
      w.user_id,
      'ranking_prize',
      w.coins,
      p_month_start,
      'monthly_snapshot',
      jsonb_build_object('rank', w.rank, 'rule', '1st 30, 2nd 20, 3rd 10')
    from winners w
    on conflict (user_id, entry_type, reference_month)
    where entry_type = 'ranking_prize'
    do update set
      tokens_delta = excluded.tokens_delta,
      metadata = excluded.metadata
    returning 1
  )
  select (select count(*) from upserted) into prize_rows;

  return prize_rows;
end;
$$;

revoke all on function public.distribute_monthly_ranking_prizes(date) from public, anon, authenticated;
grant execute on function public.distribute_monthly_ranking_prizes(date) to service_role;

-- The daily job that closes the month: the same as before, plus the top 3 prizes.
create or replace function public.run_monthly_leaderboard_snapshot_if_needed()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  now_utc timestamp := (now() at time zone 'UTC');
  current_month_start date := date_trunc('month', now_utc)::date;
  previous_month_start date := date_trunc('month', now_utc - interval '1 month')::date;
  current_close_ready_at_utc timestamp := (date_trunc('month', now_utc) + interval '28 days 12 hours');
  previous_close_ready_at_utc timestamp := (date_trunc('month', now_utc - interval '1 month') + interval '28 days 12 hours');
  target_start date;
  snapshot_rows integer;
  token_rows integer;
  prize_rows integer;
begin
  if now_utc >= current_close_ready_at_utc
    and now_utc < current_close_ready_at_utc + interval '1 day' then
    target_start := current_month_start;
  elsif now_utc >= previous_close_ready_at_utc
    and now_utc < previous_close_ready_at_utc + interval '1 day' then
    target_start := previous_month_start;
  else
    return 'skip:outside-close-window';
  end if;

  snapshot_rows := public.snapshot_monthly_leaderboard(target_start, 500);
  token_rows := public.distribute_preguntica_monthly_tokens_from_snapshot(target_start);
  prize_rows := public.distribute_monthly_ranking_prizes(target_start);

  return 'ok:' || target_start::text || ':snapshots=' || snapshot_rows::text
    || ':tokens=' || token_rows::text || ':prizes=' || prize_rows::text;
end;
$$;

commit;
