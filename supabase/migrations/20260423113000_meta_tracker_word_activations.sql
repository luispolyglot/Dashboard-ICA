begin;

create table if not exists public.user_meta_tracker (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  start_level text not null default '0',
  prior_ica_words integer not null default 0,
  activation_words_total integer not null default 0,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_lang, native_lang)
);

create table if not exists public.word_activation_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  word_normalized text not null,
  activations_count integer not null default 0,
  first_activated_at timestamptz,
  last_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, target_lang, native_lang, word_normalized)
);

create index if not exists word_activation_counters_lookup_idx
  on public.word_activation_counters (user_id, target_lang, native_lang);

create or replace function public.prevent_meta_tracker_changes_after_confirmation()
returns trigger
language plpgsql
as $$
begin
  if old.confirmed_at is not null and (
    old.start_level is distinct from new.start_level
    or old.prior_ica_words is distinct from new.prior_ica_words
    or old.target_lang is distinct from new.target_lang
    or old.native_lang is distinct from new.native_lang
  ) then
    raise exception 'META_TRACKER_LOCKED';
  end if;

  return new;
end;
$$;

drop trigger if exists user_meta_tracker_set_updated_at on public.user_meta_tracker;
create trigger user_meta_tracker_set_updated_at
before update on public.user_meta_tracker
for each row execute procedure public.set_updated_at();

drop trigger if exists word_activation_counters_set_updated_at on public.word_activation_counters;
create trigger word_activation_counters_set_updated_at
before update on public.word_activation_counters
for each row execute procedure public.set_updated_at();

drop trigger if exists user_meta_tracker_lock_after_confirmation on public.user_meta_tracker;
create trigger user_meta_tracker_lock_after_confirmation
before update on public.user_meta_tracker
for each row execute procedure public.prevent_meta_tracker_changes_after_confirmation();

alter table public.user_meta_tracker enable row level security;
alter table public.word_activation_counters enable row level security;

drop policy if exists "user_meta_tracker_all_own" on public.user_meta_tracker;
create policy "user_meta_tracker_all_own" on public.user_meta_tracker
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "word_activation_counters_all_own" on public.word_activation_counters;
create policy "word_activation_counters_all_own" on public.word_activation_counters
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.register_word_activations(
  p_words text[],
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

  if nullif(trim(p_target_lang), '') is null or nullif(trim(p_native_lang), '') is null then
    raise exception 'LANG_REQUIRED';
  end if;

  return query
  with normalized as (
    select
      lower(trim(regexp_replace(word, '\s+', ' ', 'g'))) as normalized_word
    from unnest(coalesce(p_words, array[]::text[])) as word
    where nullif(trim(word), '') is not null
  ),
  upsert_words as (
    insert into public.word_activation_counters (
      user_id,
      target_lang,
      native_lang,
      word_normalized,
      activations_count,
      first_activated_at,
      last_activated_at
    )
    select
      current_user_id,
      p_target_lang,
      p_native_lang,
      normalized_word,
      1,
      now(),
      now()
    from normalized
    on conflict (user_id, target_lang, native_lang, word_normalized)
    do update set
      activations_count = public.word_activation_counters.activations_count + 1,
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
      (select count(*) from normalized)
    )
    on conflict (user_id, target_lang, native_lang)
    do update set
      activation_words_total = public.user_meta_tracker.activation_words_total + excluded.activation_words_total
    returning activation_words_total
  )
  select activation_words_total from upsert_tracker;
end;
$$;

revoke all on function public.register_word_activations(text[], text, text) from public;
grant execute on function public.register_word_activations(text[], text, text) to authenticated;

with phrase_totals as (
  select
    pg.user_id,
    coalesce(pg.target_lang, us.target_lang) as target_lang,
    coalesce(pg.native_lang, us.native_lang) as native_lang,
    sum(cardinality(coalesce(pg.source_words, array[]::text[])))::integer as activation_words_total
  from public.phrase_generations pg
  left join public.user_settings us on us.user_id = pg.user_id
  where pg.success = true
  group by
    pg.user_id,
    coalesce(pg.target_lang, us.target_lang),
    coalesce(pg.native_lang, us.native_lang)
)
insert into public.user_meta_tracker (user_id, target_lang, native_lang, activation_words_total)
select
  pt.user_id,
  pt.target_lang,
  pt.native_lang,
  pt.activation_words_total
from phrase_totals pt
where pt.target_lang is not null
  and pt.native_lang is not null
on conflict (user_id, target_lang, native_lang)
do update set
  activation_words_total = greatest(public.user_meta_tracker.activation_words_total, excluded.activation_words_total);

with expanded as (
  select
    pg.user_id,
    coalesce(pg.target_lang, us.target_lang) as target_lang,
    coalesce(pg.native_lang, us.native_lang) as native_lang,
    lower(trim(regexp_replace(word, '\s+', ' ', 'g'))) as word_normalized,
    min(pg.created_at) as first_activated_at,
    max(pg.created_at) as last_activated_at,
    count(*)::integer as activations_count
  from public.phrase_generations pg
  left join public.user_settings us on us.user_id = pg.user_id
  cross join lateral unnest(coalesce(pg.source_words, array[]::text[])) as word
  where pg.success = true
    and nullif(trim(word), '') is not null
  group by
    pg.user_id,
    coalesce(pg.target_lang, us.target_lang),
    coalesce(pg.native_lang, us.native_lang),
    lower(trim(regexp_replace(word, '\s+', ' ', 'g')))
)
insert into public.word_activation_counters (
  user_id,
  target_lang,
  native_lang,
  word_normalized,
  activations_count,
  first_activated_at,
  last_activated_at
)
select
  e.user_id,
  e.target_lang,
  e.native_lang,
  e.word_normalized,
  e.activations_count,
  e.first_activated_at,
  e.last_activated_at
from expanded e
where e.target_lang is not null
  and e.native_lang is not null
on conflict (user_id, target_lang, native_lang, word_normalized)
do update set
  activations_count = greatest(public.word_activation_counters.activations_count, excluded.activations_count),
  first_activated_at = coalesce(
    least(public.word_activation_counters.first_activated_at, excluded.first_activated_at),
    public.word_activation_counters.first_activated_at,
    excluded.first_activated_at
  ),
  last_activated_at = coalesce(
    greatest(public.word_activation_counters.last_activated_at, excluded.last_activated_at),
    public.word_activation_counters.last_activated_at,
    excluded.last_activated_at
  );

commit;
