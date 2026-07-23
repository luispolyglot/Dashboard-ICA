begin;

drop function if exists public.pick_preguntica_question(text);

create or replace function public.pick_preguntica_question(
  p_target_lang text,
  p_exclude_question_id uuid default null
)
returns table (
  question_id uuid,
  question_es text,
  question_target text,
  needs_translation boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  lang_key text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  lang_key := lower(trim(coalesce(p_target_lang, '')));
  if lang_key = '' then
    raise exception 'TARGET_LANG_REQUIRED';
  end if;

  return query
  with candidate as (
    select
      q.id,
      q.question_es,
      case
        when lang_key in ('es', 'espanol', 'español', 'spanish') then q.question_es
        else coalesce(q.translations ->> lang_key, '')
      end as cached_target,
      (
        select max(pa.created_at)
        from public.preguntica_attempts pa
        where pa.user_id = current_user_id
          and pa.question_id = q.id
      ) as last_used_at,
      exists (
        select 1
        from public.preguntica_attempts pa
        where pa.user_id = current_user_id
          and pa.question_id = q.id
      ) as already_used,
      (p_exclude_question_id is null or q.id <> p_exclude_question_id) as not_excluded
    from public.preguntica_question_bank q
    where q.is_active
  ),
  selected as (
    select *
    from candidate
    order by
      not_excluded desc,
      already_used asc,
      last_used_at asc nulls first,
      random()
    limit 1
  )
  select
    s.id,
    s.question_es,
    case when s.cached_target = '' then null else s.cached_target end,
    case
      when lang_key in ('es', 'espanol', 'español', 'spanish') then false
      else s.cached_target = ''
    end
  from selected s;

  if not found then
    raise exception 'QUESTION_BANK_EMPTY';
  end if;
end;
$$;

revoke all on function public.pick_preguntica_question(text, uuid) from public;
grant execute on function public.pick_preguntica_question(text, uuid) to authenticated;

commit;
