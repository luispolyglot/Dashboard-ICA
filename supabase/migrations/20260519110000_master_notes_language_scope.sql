begin;

alter table public.master_notes
  add column if not exists target_lang text,
  add column if not exists native_lang text;

alter table public.master_notes
  drop constraint if exists master_notes_language_pair_presence_check;

alter table public.master_notes
  add constraint master_notes_language_pair_presence_check
  check (
    (target_lang is null and native_lang is null)
    or (target_lang is not null and native_lang is not null)
  );

create index if not exists master_notes_user_target_idx
  on public.master_notes (user_id, target_lang, created_at desc);

with chunk_language_usage as (
  select
    m.id as master_note_id,
    pg.target_lang,
    pg.native_lang,
    count(*) as chunk_count,
    coalesce(sum(c.duration_ms), 0) as total_duration_ms,
    max(c.created_at) as last_chunk_at
  from public.master_notes m
  join public.master_note_chunks c
    on c.master_note_id = m.id
  join public.phrase_generations pg
    on pg.id = c.phrase_generation_id
  where pg.target_lang is not null
    and pg.native_lang is not null
  group by m.id, pg.target_lang, pg.native_lang
),
ranked_note_languages as (
  select
    clu.master_note_id,
    clu.target_lang,
    clu.native_lang,
    clu.chunk_count,
    clu.total_duration_ms,
    clu.last_chunk_at,
    row_number() over (
      partition by clu.master_note_id
      order by clu.chunk_count desc, clu.total_duration_ms desc, clu.last_chunk_at desc, clu.target_lang asc, clu.native_lang asc
    ) as rn,
    count(*) over (partition by clu.master_note_id) as distinct_language_pairs
  from chunk_language_usage clu
),
single_chunk_consensus as (
  select
    rnl.master_note_id,
    rnl.target_lang,
    rnl.native_lang
  from ranked_note_languages rnl
  where rnl.rn = 1
    and rnl.distinct_language_pairs = 1
),
user_language_usage as (
  select
    pg.user_id,
    pg.target_lang,
    pg.native_lang,
    count(*) as usage_count,
    max(pg.created_at) as last_seen_at
  from public.phrase_generations pg
  where pg.target_lang is not null
    and pg.native_lang is not null
  group by pg.user_id, pg.target_lang, pg.native_lang
),
ranked_user_languages as (
  select
    ulu.user_id,
    ulu.target_lang,
    ulu.native_lang,
    row_number() over (
      partition by ulu.user_id
      order by ulu.usage_count desc, ulu.last_seen_at desc, ulu.target_lang asc, ulu.native_lang asc
    ) as rn,
    count(*) over (partition by ulu.user_id) as language_pairs
  from user_language_usage ulu
),
single_user_language as (
  select
    rul.user_id,
    rul.target_lang,
    rul.native_lang
  from ranked_user_languages rul
  where rul.rn = 1
    and rul.language_pairs = 1
),
final_backfill as (
  select
    m.id as master_note_id,
    coalesce(scc.target_lang, sul.target_lang) as target_lang,
    coalesce(scc.native_lang, sul.native_lang) as native_lang
  from public.master_notes m
  left join single_chunk_consensus scc
    on scc.master_note_id = m.id
  left join single_user_language sul
    on sul.user_id = m.user_id
  where (m.target_lang is null or m.native_lang is null)
)
update public.master_notes mn
set
  target_lang = fb.target_lang,
  native_lang = fb.native_lang
from final_backfill fb
where mn.id = fb.master_note_id
  and fb.target_lang is not null
  and fb.native_lang is not null;

commit;
