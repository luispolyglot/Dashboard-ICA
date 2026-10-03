-- Security fix: users could give themselves coins in two ways.
--
-- 1) The coin ledger and the PreguntICA extra unlocks were writable by their owner.
--
-- Since 20260627121500 both tables had a FOR ALL policy (auth.uid() = user_id), so any signed-in
-- user could insert, update or delete their own rows through the API: for example add a
-- 'manual_adjustment' row worth +1000 coins, or insert an unlock to get free PreguntICA extras.
--
-- Every legitimate write already goes through SECURITY DEFINER functions, which RLS does not
-- affect: redeem_preguntica_tokens_for_week, grant_preguntica_monthly_tokens,
-- distribute_preguntica_monthly_tokens_from_snapshot and set_preguntica_manual_tokens.
-- The app only reads these tables (fetchPregunticaTokenSummary), so users keep SELECT on their
-- own rows and lose INSERT / UPDATE / DELETE.
--
-- 2) Server-only SECURITY DEFINER functions were executable by anon and authenticated (see below).

begin;

drop policy if exists "preguntica_token_ledger_all_own" on public.preguntica_token_ledger;
drop policy if exists "preguntica_token_ledger_select_own" on public.preguntica_token_ledger;
create policy "preguntica_token_ledger_select_own"
on public.preguntica_token_ledger
for select
using (auth.uid() = user_id);

drop policy if exists "preguntica_week_token_unlocks_all_own" on public.preguntica_week_token_unlocks;
drop policy if exists "preguntica_week_token_unlocks_select_own" on public.preguntica_week_token_unlocks;
create policy "preguntica_week_token_unlocks_select_own"
on public.preguntica_week_token_unlocks
for select
using (auth.uid() = user_id);

-- Defense in depth: no direct writes from the API roles even if a permissive policy is added later.
revoke insert, update, delete on public.preguntica_token_ledger from anon, authenticated;
revoke insert, update, delete on public.preguntica_week_token_unlocks from anon, authenticated;

-- Server-only functions. They are SECURITY DEFINER and do not check the caller, and
-- `revoke ... from public` alone does not remove the EXECUTE that Supabase's default privileges give
-- to anon and authenticated on every new function in public. So today anyone (even anon) can
-- call grant_preguntica_monthly_tokens(any_user, any_month, 1000000) and mint coins, or rebuild
-- a past month's ranking snapshot. Only the monthly cron (runs as the owner) and service_role
-- need them; the app never calls them.
revoke execute on function public.grant_preguntica_monthly_tokens(uuid, date, numeric) from public, anon, authenticated;
revoke execute on function public.distribute_preguntica_monthly_tokens_from_snapshot(date) from public, anon, authenticated;
revoke execute on function public.snapshot_monthly_leaderboard(date, integer) from public, anon, authenticated;
revoke execute on function public.run_monthly_leaderboard_snapshot_if_needed() from public, anon, authenticated;
-- Scheduled challenge jobs: same pattern, only the cron needs them.
revoke execute on function public.expire_ica_challenges_due() from public, anon, authenticated;
revoke execute on function public.expire_ica_challenge_invitations_due() from public, anon, authenticated;
revoke execute on function public.process_ica_challenge_turn_timeouts() from public, anon, authenticated;
revoke execute on function public.run_ica_challenges_expiration_job() from public, anon, authenticated;

commit;
