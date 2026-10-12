-- ICA COINS DE USUARIOS: «Dar» y «Quitar» en vez de fijar un total (Luis, 3 oct)
--
-- Antes, la casilla del panel era el TOTAL dado a mano en toda la historia
-- (set_preguntica_manual_tokens). Si alguien ya tenía 50 dadas a mano y el admin escribía 10
-- pensando en «darle 10», el total pasaba a 10 y se le RESTABAN 40.
--
-- Ahora:
--  - adjust_preguntica_manual_tokens(usuario, cantidad): suma (cantidad > 0) o resta (cantidad < 0)
--    exactamente eso. Nunca deja el saldo por debajo de 0. Solo super_admin.
--  - get_preguntica_tokens_admin_overview devuelve también el saldo real (balance).
--  - set_preguntica_manual_tokens se queda por compatibilidad, pero el panel ya no la usa.

begin;

create or replace function public.adjust_preguntica_manual_tokens(
  p_user_id uuid,
  p_delta integer
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
  v_admin_id uuid := auth.uid();
  v_balance numeric(10,2);
  v_manual numeric(10,2);
begin
  if v_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.admin_users a
    where a.user_id = v_admin_id and a.role = 'super_admin' and a.is_active = true
  ) then
    raise exception 'FORBIDDEN_SUPER_ADMIN_ONLY';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000 then
    raise exception 'ADJUST_AMOUNT_INVALID';
  end if;

  -- El mismo candado que el resto de movimientos de monedas de ese usuario.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':preguntica_tokens'));

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into v_balance
  from public.preguntica_token_ledger l
  where l.user_id = p_user_id;

  if v_balance + p_delta < 0 then
    raise exception 'BALANCE_WOULD_BE_NEGATIVE';
  end if;

  insert into public.preguntica_token_ledger (user_id, entry_type, tokens_delta, reference_type, metadata)
  values (
    p_user_id,
    'manual_adjustment',
    p_delta,
    'super_admin_manual_adjust',
    jsonb_build_object('adjusted_by', v_admin_id, 'balance_before', v_balance)
  );

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into v_manual
  from public.preguntica_token_ledger l
  where l.user_id = p_user_id and l.entry_type = 'manual_adjustment';

  return query select v_manual, p_delta::numeric(10,2), (v_balance + p_delta)::numeric(10,2);
end;
$$;

revoke all on function public.adjust_preguntica_manual_tokens(uuid, integer) from public, anon;
grant execute on function public.adjust_preguntica_manual_tokens(uuid, integer) to authenticated;

-- El panel enseña el saldo real de cada persona (cambia el tipo de retorno: hay que borrarla antes).
drop function if exists public.get_preguntica_tokens_admin_overview();

create function public.get_preguntica_tokens_admin_overview()
returns table (
  user_id uuid,
  username text,
  monthly_tokens numeric(10,2),
  manual_tokens numeric(10,2),
  balance numeric(10,2)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.role = 'super_admin' and a.is_active = true
  ) then
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
  totals as (
    select
      ptl.user_id,
      coalesce(round(sum(ptl.tokens_delta) filter (where ptl.entry_type = 'manual_adjustment'), 2), 0)::numeric(10,2) as manual_tokens,
      coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2) as balance
    from public.preguntica_token_ledger ptl
    group by ptl.user_id
  )
  select
    p.id,
    coalesce(nullif(trim(p.username), ''), nullif(trim(p.display_name), ''), 'sin-username') as username,
    coalesce(ml.monthly_tokens, 0)::numeric(10,2),
    coalesce(t.manual_tokens, 0)::numeric(10,2),
    coalesce(t.balance, 0)::numeric(10,2)
  from public.profiles p
  left join monthly_latest ml on ml.user_id = p.id
  left join totals t on t.user_id = p.id
  order by 2 asc, p.id asc;
end;
$$;

revoke all on function public.get_preguntica_tokens_admin_overview() from public, anon;
grant execute on function public.get_preguntica_tokens_admin_overview() to authenticated;

commit;
