begin;

create or replace function public.register_lexicard_activations(
  p_lexicard_ids uuid[],
  p_target_lang text,
  p_native_lang text
)
returns table (activation_words_total integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  valid as (
    select
      l.id as lexicard_id,
      l.activation_count as previous_count,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where lower(trim(coalesce(l.target_lang, p_target_lang, ''))) = lower(trim(coalesce(p_target_lang, '')))
      and lower(trim(coalesce(l.native_lang, p_native_lang, ''))) = lower(trim(coalesce(p_native_lang, '')))
  ),
  updated as (
    update public.lexicards l
    set
      activation_count = l.activation_count + v.uses,
      first_activated_at = coalesce(l.first_activated_at, now()),
      last_activated_at = now()
    from valid v
    where l.id = v.lexicard_id
      and l.user_id = current_user_id
    returning
      case when v.previous_count = 0 and v.uses > 0 then 1 else 0 end as newly_activated
  ),
  delta as (
    select coalesce(sum(updated.newly_activated), 0)::integer as amount
    from updated
  ),
  upsert_tracker as (
    insert into public.user_meta_tracker (
      user_id,
      target_lang,
      native_lang,
      activation_words_total
    )
    values (
      current_user_id,
      p_target_lang,
      p_native_lang,
      (select delta.amount from delta)
    )
    on conflict (user_id, target_lang, native_lang)
    do update set
      activation_words_total =
        public.user_meta_tracker.activation_words_total + excluded.activation_words_total
    returning public.user_meta_tracker.activation_words_total as tracker_total
  )
  select upsert_tracker.tracker_total as activation_words_total
  from upsert_tracker;
end;
$$;

revoke all on function public.register_lexicard_activations(uuid[], text, text) from public;
grant execute on function public.register_lexicard_activations(uuid[], text, text) to authenticated;

commit;
