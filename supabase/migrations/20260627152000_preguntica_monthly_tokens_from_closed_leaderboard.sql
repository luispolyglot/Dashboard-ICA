begin;

create or replace function public.distribute_preguntica_monthly_tokens_from_snapshot(
  p_month_start date default null
)
returns integer
language sql
security definer
set search_path = public
as $$
  with month_ref as (
    select coalesce(
      p_month_start,
      date_trunc('month', (now() at time zone 'UTC') - interval '1 month')::date
    ) as month_start
  ),
  source_rows as (
    select
      ls.user_id,
      mr.month_start,
      greatest(
        0,
        floor(
          coalesce(
            nullif(ls.payload ->> 'total_points', '')::numeric,
            (ls.score::numeric / 10)
          )
        )::integer
      ) as tokens_to_grant,
      coalesce(
        nullif(ls.payload ->> 'total_points', '')::numeric,
        (ls.score::numeric / 10)
      ) as source_points
    from public.leaderboard_snapshots ls
    cross join month_ref mr
    where ls.period = 'monthly'
      and ls.period_start = mr.month_start
  ),
  upserted as (
    insert into public.preguntica_token_ledger (
      user_id,
      entry_type,
      tokens_delta,
      reference_month,
      reference_type,
      metadata
    )
    select
      sr.user_id,
      'monthly_earn',
      sr.tokens_to_grant,
      sr.month_start,
      'monthly_snapshot',
      jsonb_build_object(
        'source', 'leaderboard_snapshots',
        'points', sr.source_points,
        'rule', 'floor(points)'
      )
    from source_rows sr
    on conflict (user_id, entry_type, reference_month)
    where entry_type = 'monthly_earn'
    do update set
      tokens_delta = excluded.tokens_delta,
      reference_type = excluded.reference_type,
      metadata = excluded.metadata,
      created_at = public.preguntica_token_ledger.created_at
    returning 1
  )
  select count(*)::integer from upserted;
$$;

revoke all on function public.distribute_preguntica_monthly_tokens_from_snapshot(date) from public;
grant execute on function public.distribute_preguntica_monthly_tokens_from_snapshot(date) to service_role;

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

  return 'ok:' || target_start::text || ':snapshots=' || snapshot_rows::text || ':tokens=' || token_rows::text;
end;
$$;

commit;
