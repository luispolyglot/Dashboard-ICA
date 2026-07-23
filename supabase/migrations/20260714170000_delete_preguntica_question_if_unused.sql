begin;

create or replace function public.delete_preguntica_question_if_unused(
  p_question_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  used_count integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_question_id is null then
    raise exception 'QUESTION_ID_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = current_user_id
      and a.is_active = true
      and a.role = 'super_admin'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select count(*)::integer
  into used_count
  from public.preguntica_attempts pa
  where pa.question_id = p_question_id;

  if coalesce(used_count, 0) > 0 then
    raise exception 'QUESTION_ALREADY_USED';
  end if;

  delete from public.preguntica_question_bank q
  where q.id = p_question_id;

  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.delete_preguntica_question_if_unused(uuid) from public;
grant execute on function public.delete_preguntica_question_if_unused(uuid) to authenticated;

create or replace function public.get_preguntica_question_usage_counts(
  p_question_ids uuid[]
)
returns table (
  question_id uuid,
  usage_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.admin_users a
    where a.user_id = current_user_id
      and a.is_active = true
      and a.role = 'super_admin'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    pa.question_id,
    count(*)::integer as usage_count
  from public.preguntica_attempts pa
  where pa.question_id is not null
    and (
      p_question_ids is null
      or cardinality(p_question_ids) = 0
      or pa.question_id = any(p_question_ids)
    )
  group by pa.question_id;
end;
$$;

revoke all on function public.get_preguntica_question_usage_counts(uuid[]) from public;
grant execute on function public.get_preguntica_question_usage_counts(uuid[]) to authenticated;

commit;
