alter table public.phrase_generations
  add column if not exists target_lang text,
  add column if not exists native_lang text;

update public.phrase_generations pg
set
  target_lang = us.target_lang,
  native_lang = us.native_lang
from public.user_settings us
where
  pg.user_id = us.user_id
  and (pg.target_lang is null or pg.native_lang is null);

create index if not exists phrase_generations_user_lang_idx
  on public.phrase_generations (user_id, target_lang, created_at desc);
