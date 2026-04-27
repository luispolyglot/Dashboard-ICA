begin;

with normalized_uses as (
  select
    pg.user_id,
    pg.target_lang,
    pg.native_lang,
    lower(trim(word)) as word_normalized,
    count(*)::integer as uses,
    min(pg.created_at) as first_used_at,
    max(pg.created_at) as last_used_at
  from public.phrase_generations pg
  cross join lateral unnest(coalesce(pg.source_words, array[]::text[])) as word
  where pg.user_id is not null
    and pg.target_lang is not null
    and pg.native_lang is not null
    and length(trim(coalesce(word, ''))) > 0
  group by pg.user_id, pg.target_lang, pg.native_lang, lower(trim(word))
),
matched as (
  select
    l.id as lexicard_id,
    nu.uses,
    nu.first_used_at,
    nu.last_used_at
  from normalized_uses nu
  join public.lexicards l
    on l.user_id = nu.user_id
   and l.target_lang = nu.target_lang
   and l.native_lang = nu.native_lang
   and lower(trim(l.target)) = nu.word_normalized
),
updated as (
  update public.lexicards l
  set
    activation_count = greatest(coalesce(l.activation_count, 0), m.uses),
    first_activated_at = case
      when m.first_used_at is null then l.first_activated_at
      when l.first_activated_at is null then m.first_used_at
      else least(l.first_activated_at, m.first_used_at)
    end,
    last_activated_at = case
      when m.last_used_at is null then l.last_activated_at
      when l.last_activated_at is null then m.last_used_at
      else greatest(l.last_activated_at, m.last_used_at)
    end
  from matched m
  where l.id = m.lexicard_id
    and (
      coalesce(l.activation_count, 0) < m.uses
      or l.first_activated_at is null
      or l.last_activated_at is null
    )
  returning l.id
)
select count(*) from updated;

with counts as (
  select
    l.user_id,
    l.target_lang,
    l.native_lang,
    count(*)::integer as activation_words_total
  from public.lexicards l
  where l.target_lang is not null
    and l.native_lang is not null
    and coalesce(l.activation_count, 0) > 0
  group by l.user_id, l.target_lang, l.native_lang
)
insert into public.user_meta_tracker (
  user_id,
  target_lang,
  native_lang,
  activation_words_total
)
select
  c.user_id,
  c.target_lang,
  c.native_lang,
  c.activation_words_total
from counts c
on conflict (user_id, target_lang, native_lang)
do update set
  activation_words_total = excluded.activation_words_total;

commit;
