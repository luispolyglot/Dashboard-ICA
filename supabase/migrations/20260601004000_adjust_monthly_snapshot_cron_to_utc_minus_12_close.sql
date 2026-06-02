begin;

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
  affected_rows integer;
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

  affected_rows := public.snapshot_monthly_leaderboard(target_start, 500);
  return 'ok:' || target_start::text || ':' || affected_rows::text;
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in (
      'monthly_leaderboard_snapshot_spain',
      'monthly_leaderboard_snapshot_utc',
      'monthly_leaderboard_snapshot_close_utc_minus_12'
    )
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'monthly_leaderboard_snapshot_close_utc_minus_12',
    '15 12 * * *',
    $cron$select public.run_monthly_leaderboard_snapshot_if_needed();$cron$
  );
end;
$$;

commit;
