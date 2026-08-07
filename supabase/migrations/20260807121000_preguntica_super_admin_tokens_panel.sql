begin;

create or replace function public.get_preguntica_tokens_admin_overview()
returns table (
  user_id uuid,
  username text,
  monthly_tokens numeric(10,2),
  manual_tokens numeric(10,2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  has_access boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select exists (
    select 1
    from public.admin_users a
    where a.user_id = current_user_id
      and a.role = 'super_admin'
      and a.is_active = true
  )
  into has_access;

  if not has_access then
    raise exception 'FORBIDDEN_SUPER_ADMIN_ONLY';
  end if;

  return query
  with monthly_latest as (
    select distinct on (ptl.user_id)
      ptl.user_id,
      coalesce(ptl.tokens_delta, 0)::numeric(10,2) as monthly_tokens
    from public.preguntica_token_ledger ptl
    where ptl.entry_type = 'monthly_earn'
    order by ptl.user_id, ptl.reference_month desc nulls last, ptl.created_at desc
  ),
  manual_totals as (
    select
      ptl.user_id,
      coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2) as manual_tokens
    from public.preguntica_token_ledger ptl
    where ptl.entry_type = 'manual_adjustment'
    group by ptl.user_id
  )
  select
    p.id,
    coalesce(nullif(trim(p.username), ''), nullif(trim(p.display_name), ''), 'sin-username') as username,
    coalesce(ml.monthly_tokens, 0)::numeric(10,2) as monthly_tokens,
    coalesce(mt.manual_tokens, 0)::numeric(10,2) as manual_tokens
  from public.profiles p
  left join monthly_latest ml on ml.user_id = p.id
  left join manual_totals mt on mt.user_id = p.id
  order by username asc, p.id asc;
end;
$$;

revoke all on function public.get_preguntica_tokens_admin_overview() from public;
grant execute on function public.get_preguntica_tokens_admin_overview() to authenticated;

create or replace function public.set_preguntica_manual_tokens(
  p_user_id uuid,
  p_manual_tokens integer
)
returns table (
  manual_tokens numeric(10,2),
  applied_delta numeric(10,2),
  balance_after numeric(10,2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  has_access boolean;
  current_manual_tokens numeric(10,2);
  target_manual_tokens numeric(10,2);
  delta_tokens numeric(10,2);
  current_balance numeric(10,2);
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select exists (
    select 1
    from public.admin_users a
    where a.user_id = current_user_id
      and a.role = 'super_admin'
      and a.is_active = true
  )
  into has_access;

  if not has_access then
    raise exception 'FORBIDDEN_SUPER_ADMIN_ONLY';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_manual_tokens is null or p_manual_tokens < 0 then
    raise exception 'MANUAL_TOKENS_MUST_BE_NON_NEGATIVE_INTEGER';
  end if;

  target_manual_tokens := p_manual_tokens::numeric(10,2);

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_manual_tokens
  from public.preguntica_token_ledger ptl
  where ptl.user_id = p_user_id
    and ptl.entry_type = 'manual_adjustment';

  delta_tokens := round(target_manual_tokens - coalesce(current_manual_tokens, 0), 2);

  if delta_tokens <> 0 then
    insert into public.preguntica_token_ledger (
      user_id,
      entry_type,
      tokens_delta,
      reference_type,
      metadata
    )
    values (
      p_user_id,
      'manual_adjustment',
      delta_tokens,
      'super_admin_manual_set',
      jsonb_build_object(
        'set_by', current_user_id,
        'set_to', target_manual_tokens,
        'previous_manual_tokens', coalesce(current_manual_tokens, 0)
      )
    );
  end if;

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = p_user_id;

  return query
  select
    target_manual_tokens,
    delta_tokens,
    coalesce(current_balance, 0)::numeric(10,2);
end;
$$;

revoke all on function public.set_preguntica_manual_tokens(uuid, integer) from public;
grant execute on function public.set_preguntica_manual_tokens(uuid, integer) to authenticated;

commit;
