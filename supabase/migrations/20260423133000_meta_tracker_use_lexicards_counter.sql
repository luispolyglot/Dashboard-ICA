begin;

alter table public.lexicards
  add column if not exists activation_count integer not null default 0,
  add column if not exists first_activated_at timestamptz,
  add column if not exists last_activated_at timestamptz;

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
  updated as (
    update public.lexicards l
    set
      activation_count = l.activation_count + e.uses,
      first_activated_at = coalesce(l.first_activated_at, now()),
      last_activated_at = now()
    from expanded e
    where l.id = e.lexicard_id
      and l.user_id = current_user_id
      and coalesce(l.target_lang, p_target_lang) = p_target_lang
      and coalesce(l.native_lang, p_native_lang) = p_native_lang
    returning e.uses
  ),
  delta as (
    select coalesce(sum(uses), 0)::integer as amount from updated
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
      (select amount from delta)
    )
    on conflict (user_id, target_lang, native_lang)
    do update set
      activation_words_total = public.user_meta_tracker.activation_words_total + excluded.activation_words_total
    returning activation_words_total
  )
  select activation_words_total from upsert_tracker;
end;
$$;

revoke all on function public.register_lexicard_activations(uuid[], text, text) from public;
grant execute on function public.register_lexicard_activations(uuid[], text, text) to authenticated;

do $$
begin
  if to_regclass('public.lexicard_activation_counters') is not null then
    with migrated as (
      select
        lac.lexicard_id,
        sum(lac.activations_count)::integer as amount,
        min(lac.first_activated_at) as first_activated_at,
        max(lac.last_activated_at) as last_activated_at
      from public.lexicard_activation_counters lac
      group by lac.lexicard_id
    )
    update public.lexicards l
    set
      activation_count = greatest(l.activation_count, migrated.amount),
      first_activated_at = coalesce(
        least(l.first_activated_at, migrated.first_activated_at),
        l.first_activated_at,
        migrated.first_activated_at
      ),
      last_activated_at = coalesce(
        greatest(l.last_activated_at, migrated.last_activated_at),
        l.last_activated_at,
        migrated.last_activated_at
      )
    from migrated
    where l.id = migrated.lexicard_id;
  end if;
end;
$$;

drop function if exists public.register_word_activations(text[], text, text);
drop table if exists public.word_activation_counters;
drop table if exists public.lexicard_activation_counters;

commit;
