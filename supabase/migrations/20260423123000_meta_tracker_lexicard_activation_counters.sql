begin;

create table if not exists public.lexicard_activation_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  lexicard_id uuid not null references public.lexicards (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  activations_count integer not null default 0,
  first_activated_at timestamptz,
  last_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lexicard_id)
);

create index if not exists lexicard_activation_counters_user_lang_idx
  on public.lexicard_activation_counters (user_id, target_lang, native_lang);

drop trigger if exists lexicard_activation_counters_set_updated_at on public.lexicard_activation_counters;
create trigger lexicard_activation_counters_set_updated_at
before update on public.lexicard_activation_counters
for each row execute procedure public.set_updated_at();

alter table public.lexicard_activation_counters enable row level security;

drop policy if exists "lexicard_activation_counters_all_own" on public.lexicard_activation_counters;
create policy "lexicard_activation_counters_all_own" on public.lexicard_activation_counters
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
      e.lexicard_id,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where coalesce(l.target_lang, p_target_lang) = p_target_lang
      and coalesce(l.native_lang, p_native_lang) = p_native_lang
  ),
  upsert_lexicards as (
    insert into public.lexicard_activation_counters (
      user_id,
      lexicard_id,
      target_lang,
      native_lang,
      activations_count,
      first_activated_at,
      last_activated_at
    )
    select
      current_user_id,
      v.lexicard_id,
      p_target_lang,
      p_native_lang,
      v.uses,
      now(),
      now()
    from valid v
    on conflict (user_id, lexicard_id)
    do update set
      activations_count = public.lexicard_activation_counters.activations_count + excluded.activations_count,
      last_activated_at = now()
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
      (select coalesce(sum(uses), 0) from valid)
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

with normalized_lexicards as (
  select
    l.user_id,
    l.id as lexicard_id,
    l.target_lang,
    l.native_lang,
    lower(trim(regexp_replace(l.target, '\s+', ' ', 'g'))) as word_normalized
  from public.lexicards l
  where l.target_lang is not null
    and l.native_lang is not null
),
aggregated as (
  select
    nl.user_id,
    nl.lexicard_id,
    nl.target_lang,
    nl.native_lang,
    max(wac.activations_count)::integer as activations_count,
    min(wac.first_activated_at) as first_activated_at,
    max(wac.last_activated_at) as last_activated_at
  from normalized_lexicards nl
  join public.word_activation_counters wac
    on wac.user_id = nl.user_id
   and wac.target_lang = nl.target_lang
   and wac.native_lang = nl.native_lang
   and wac.word_normalized = nl.word_normalized
  group by nl.user_id, nl.lexicard_id, nl.target_lang, nl.native_lang
)
insert into public.lexicard_activation_counters (
  user_id,
  lexicard_id,
  target_lang,
  native_lang,
  activations_count,
  first_activated_at,
  last_activated_at
)
select
  a.user_id,
  a.lexicard_id,
  a.target_lang,
  a.native_lang,
  a.activations_count,
  a.first_activated_at,
  a.last_activated_at
from aggregated a
on conflict (user_id, lexicard_id)
do update set
  activations_count = greatest(public.lexicard_activation_counters.activations_count, excluded.activations_count),
  first_activated_at = coalesce(
    least(public.lexicard_activation_counters.first_activated_at, excluded.first_activated_at),
    public.lexicard_activation_counters.first_activated_at,
    excluded.first_activated_at
  ),
  last_activated_at = coalesce(
    greatest(public.lexicard_activation_counters.last_activated_at, excluded.last_activated_at),
    public.lexicard_activation_counters.last_activated_at,
    excluded.last_activated_at
  );

commit;
