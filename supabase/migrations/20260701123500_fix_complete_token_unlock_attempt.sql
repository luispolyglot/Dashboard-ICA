begin;

create or replace function public.complete_preguntica_attempt(
  p_attempt_id uuid
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  attempt_row public.preguntica_attempts;
  completed_week_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_attempt_id is null then
    raise exception 'ATTEMPT_REQUIRED';
  end if;

  select *
  into attempt_row
  from public.preguntica_attempts pa
  where pa.id = p_attempt_id
    and pa.user_id = current_user_id
  for update;

  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  if attempt_row.status = 'failed' then
    raise exception 'FAILED_ATTEMPT_CANNOT_BE_COMPLETED';
  end if;

  update public.preguntica_attempts pa
  set
    status = 'completed',
    updated_at = now()
  where pa.id = attempt_row.id
  returning *
  into attempt_row;

  if attempt_row.attempt_kind = 'token_unlock' then
    update public.preguntica_weeks pw
    set
      completed_attempt_id = coalesce(pw.completed_attempt_id, attempt_row.id),
      completed_at = coalesce(pw.completed_at, now()),
      updated_at = now()
    where pw.id = attempt_row.preguntica_week_id
      and pw.user_id = current_user_id
    returning pw.id
    into completed_week_id;

    if completed_week_id is null then
      raise exception 'WEEK_NOT_FOUND';
    end if;

    return attempt_row;
  end if;

  update public.preguntica_weeks pw
  set
    completed_attempt_id = attempt_row.id,
    completed_at = coalesce(pw.completed_at, now()),
    updated_at = now()
  where pw.id = attempt_row.preguntica_week_id
    and pw.user_id = current_user_id
    and (pw.completed_attempt_id is null or pw.completed_attempt_id = attempt_row.id)
  returning pw.id
  into completed_week_id;

  if completed_week_id is null then
    raise exception 'WEEK_ALREADY_COMPLETED_WITH_ANOTHER_ATTEMPT';
  end if;

  return attempt_row;
end;
$$;

revoke all on function public.complete_preguntica_attempt(uuid) from public;
grant execute on function public.complete_preguntica_attempt(uuid) to authenticated;

commit;
