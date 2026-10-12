-- SECURITY LOCKDOWN (security review, 11 Oct 2026)
-- Found in production with the public (anon) key alone:
--   1. public.chat_history had a policy «Allow all operations» (USING true) for every role:
--      anyone could read, change or delete every user's chat. The app no longer uses this
--      table (legacy). From now on each user only reaches their own rows.
--   2. RLS was off on coaching_v2_focus_exercise_generation_logs and desafio_tipos: anyone could
--      read the coaching logs and edit the challenge modes. Only the server (service role) uses
--      them; students keep read access to the modes.
--   3. Internal SECURITY DEFINER functions were executable by anyone, e.g.
--      grant_preguntica_monthly_tokens (give any user any number of ICA Coins) and
--      rerecord_master_note_chunk (trusts the p_user_id it receives). They are only called by
--      Edge Functions with the service role or by pg_cron, so only service_role keeps EXECUTE.

begin;

-- 1. chat_history: own rows only. (The table was created outside migrations: skipped where it does
--    not exist, e.g. a fresh local database.)
do $$
begin
  if to_regclass('public.chat_history') is not null then
    execute 'drop policy if exists "Allow all operations on chat_history" on public.chat_history';
    execute 'alter table public.chat_history enable row level security';
    execute 'revoke all on table public.chat_history from anon';
    execute 'drop policy if exists chat_history_own_rows on public.chat_history';
    execute 'create policy chat_history_own_rows on public.chat_history
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid())';
  end if;
end
$$;

-- 2. Tables without RLS.
do $$
begin
  if to_regclass('public.coaching_v2_focus_exercise_generation_logs') is not null then
    execute 'alter table public.coaching_v2_focus_exercise_generation_logs enable row level security';
    execute 'revoke all on table public.coaching_v2_focus_exercise_generation_logs from anon, authenticated';
  end if;
  if to_regclass('public.desafio_tipos') is not null then
    execute 'alter table public.desafio_tipos enable row level security';
    execute 'revoke insert, update, delete, truncate on table public.desafio_tipos from anon, authenticated';
    execute 'revoke all on table public.desafio_tipos from anon';
    execute 'drop policy if exists desafio_tipos_read on public.desafio_tipos';
    execute 'create policy desafio_tipos_read on public.desafio_tipos
      for select to authenticated
      using (true)';
  end if;
end
$$;

-- 3. Internal functions: service_role (Edge Functions) and the owner (pg_cron) only.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.grant_preguntica_monthly_tokens(uuid, date, numeric)',
    'public.rerecord_master_note_chunk(uuid, uuid, uuid, uuid, text, integer, text, bigint)',
    'public.distribute_preguntica_monthly_tokens_from_snapshot(date)',
    'public.snapshot_monthly_leaderboard(date, integer)',
    'public.run_monthly_leaderboard_snapshot_if_needed()',
    'public.run_ica_challenges_expiration_job()',
    'public.expire_ica_challenge_invitations_due()',
    'public.expire_ica_challenges_due()',
    'public.process_ica_challenge_turn_timeouts()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end;
$$;

commit;
