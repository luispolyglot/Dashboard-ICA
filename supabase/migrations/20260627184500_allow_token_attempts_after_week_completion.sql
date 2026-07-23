begin;

create or replace function public.create_preguntica_attempt(
  p_word_mode text,
  p_reference timestamptz default now()
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  status_row record;
  mode_normalized text;
  new_attempt public.preguntica_attempts;
  token_attempts_used integer;
  token_unlocks_available integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  mode_normalized := lower(trim(coalesce(p_word_mode, 'mixed')));
  if mode_normalized = '' then
    mode_normalized := 'mixed';
  end if;

  select *
  into status_row
  from public.get_my_preguntica_week_status(p_reference);

  if coalesce(status_row.is_unlocked, false) is false then
    raise exception 'WEEK_LOCKED_NOT_ENOUGH_ACTIVATIONS';
  end if;

  if status_row.completed_at is null then
    if coalesce(status_row.attempts_used, 0) >= 3 then
      raise exception 'WEEK_ATTEMPT_LIMIT_REACHED';
    end if;

    insert into public.preguntica_attempts (
      user_id,
      preguntica_week_id,
      attempt_number,
      attempt_kind,
      word_mode,
      status
    )
    values (
      current_user_id,
      status_row.week_id,
      status_row.attempts_used + 1,
      'weekly',
      mode_normalized,
      'pending_response'
    )
    returning *
    into new_attempt;

    return new_attempt;
  end if;

  select count(*)::integer
  into token_unlocks_available
  from public.preguntica_week_token_unlocks pwtu
  where pwtu.user_id = current_user_id
    and pwtu.preguntica_week_id = status_row.week_id;

  select count(*)::integer
  into token_attempts_used
  from public.preguntica_attempts pa
  where pa.user_id = current_user_id
    and pa.preguntica_week_id = status_row.week_id
    and pa.attempt_kind = 'token_unlock';

  if token_unlocks_available <= token_attempts_used then
    raise exception 'TOKEN_UNLOCK_REQUIRED';
  end if;

  insert into public.preguntica_attempts (
    user_id,
    preguntica_week_id,
    attempt_number,
    attempt_kind,
    word_mode,
    status
  )
  values (
    current_user_id,
    status_row.week_id,
    token_attempts_used + 1,
    'token_unlock',
    mode_normalized,
    'pending_response'
  )
  returning *
  into new_attempt;

  return new_attempt;
end;
$$;

revoke all on function public.create_preguntica_attempt(text, timestamptz) from public;
grant execute on function public.create_preguntica_attempt(text, timestamptz) to authenticated;

commit;
