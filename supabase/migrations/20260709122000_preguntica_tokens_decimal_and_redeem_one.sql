begin;

alter table public.preguntica_token_ledger
  alter column tokens_delta type numeric(10,2)
  using round(tokens_delta::numeric, 2);

alter table public.preguntica_week_token_unlocks
  alter column tokens_spent type numeric(10,2)
  using round(tokens_spent::numeric, 2);

drop function if exists public.get_my_preguntica_token_balance();
create or replace function public.get_my_preguntica_token_balance()
returns numeric(10,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  balance numeric(10,2);
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  return coalesce(balance, 0)::numeric(10,2);
end;
$$;

revoke all on function public.get_my_preguntica_token_balance() from public;
grant execute on function public.get_my_preguntica_token_balance() to authenticated;

drop function if exists public.redeem_preguntica_tokens_for_week(date, integer);
create or replace function public.redeem_preguntica_tokens_for_week(
  p_week_start date,
  p_tokens_to_spend numeric default 1
)
returns table (
  unlock_id uuid,
  week_id uuid,
  spent_tokens numeric(10,2),
  balance_after numeric(10,2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  target_week_id uuid;
  target_week_completed_at timestamptz;
  spent numeric(10,2);
  current_balance numeric(10,2);
  ledger_id uuid;
  new_unlock_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_week_start is null then
    raise exception 'WEEK_START_REQUIRED';
  end if;

  spent := round(coalesce(p_tokens_to_spend, 1)::numeric, 2);
  if spent <> 1 then
    raise exception 'REDEEM_COST_MUST_BE_1_TOKEN';
  end if;

  select pw.id, pw.completed_at
  into target_week_id, target_week_completed_at
  from public.preguntica_weeks pw
  where pw.user_id = current_user_id
    and pw.week_start = p_week_start
  for update;

  if target_week_id is null then
    raise exception 'WEEK_NOT_FOUND';
  end if;

  if target_week_completed_at is null then
    raise exception 'WEEK_MUST_BE_COMPLETED_BEFORE_REDEEM';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text || ':preguntica_tokens'));

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  if current_balance < spent then
    raise exception 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.preguntica_token_ledger (
    user_id,
    entry_type,
    tokens_delta,
    reference_type,
    reference_id,
    metadata
  )
  values (
    current_user_id,
    'redeem_unlock',
    -spent,
    'preguntica_week',
    target_week_id,
    jsonb_build_object('week_start', p_week_start)
  )
  returning id
  into ledger_id;

  insert into public.preguntica_week_token_unlocks (
    user_id,
    preguntica_week_id,
    tokens_spent,
    ledger_entry_id
  )
  values (
    current_user_id,
    target_week_id,
    spent,
    ledger_id
  )
  returning id
  into new_unlock_id;

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  return query
  select
    new_unlock_id,
    target_week_id,
    spent,
    current_balance;
end;
$$;

revoke all on function public.redeem_preguntica_tokens_for_week(date, numeric) from public;
grant execute on function public.redeem_preguntica_tokens_for_week(date, numeric) to authenticated;

drop function if exists public.grant_preguntica_monthly_tokens(uuid, date, numeric);
create or replace function public.grant_preguntica_monthly_tokens(
  p_user_id uuid,
  p_month_start date,
  p_points numeric
)
returns table (
  granted_tokens numeric(10,2),
  balance_after numeric(10,2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  points_value numeric;
  tokens_to_grant numeric(10,2);
  balance numeric(10,2);
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_month_start is null then
    raise exception 'MONTH_REQUIRED';
  end if;

  month_start := date_trunc('month', p_month_start::timestamp)::date;
  points_value := greatest(coalesce(p_points, 0), 0);
  tokens_to_grant := round(points_value / 10, 2)::numeric(10,2);

  insert into public.preguntica_token_ledger (
    user_id,
    entry_type,
    tokens_delta,
    reference_month,
    reference_type,
    metadata
  )
  values (
    p_user_id,
    'monthly_earn',
    tokens_to_grant,
    month_start,
    'monthly_points',
    jsonb_build_object('points', points_value, 'rule', 'points_div_10')
  )
  on conflict (user_id, entry_type, reference_month)
  where entry_type = 'monthly_earn'
  do update
  set
    tokens_delta = excluded.tokens_delta,
    metadata = excluded.metadata,
    created_at = public.preguntica_token_ledger.created_at;

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = p_user_id;

  return query
  select
    tokens_to_grant,
    balance;
end;
$$;

revoke all on function public.grant_preguntica_monthly_tokens(uuid, date, numeric) from public;
grant execute on function public.grant_preguntica_monthly_tokens(uuid, date, numeric) to service_role;

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
        0::numeric,
        round(
          coalesce(
            nullif(ls.payload ->> 'total_points', '')::numeric,
            (ls.score::numeric / 10)
          ) / 10,
          2
        )
      )::numeric(10,2) as tokens_to_grant,
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
        'rule', 'round(points/10,2)'
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

commit;
