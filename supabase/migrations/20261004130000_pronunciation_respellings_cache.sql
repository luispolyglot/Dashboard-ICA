-- PRONUNCIATION RESPELLINGS SHARED BY EVERYONE (Luis, 4 Oct)
--
-- The figured pronunciation («beaucoup» → /bocú/) used to be asked to the AI by every student
-- for every word, and only kept on that device. Now the anthropic-proxy function stores each
-- result here, so a word is asked to the AI only once for all students of that language pair.
-- Polish for Spanish speakers does not use this table: the app computes it with fixed rules.
--
-- Students can read it; only the Edge Function (service role) writes it.

begin;

create table if not exists public.pronunciation_respellings (
  target_lang text not null,
  native_lang text not null,
  word_key text not null,
  respelling text not null check (char_length(respelling) between 1 and 80),
  model text,
  created_at timestamptz not null default now(),
  primary key (target_lang, native_lang, word_key),
  check (target_lang = lower(trim(target_lang))),
  check (native_lang = lower(trim(native_lang))),
  check (char_length(word_key) between 1 and 80)
);

alter table public.pronunciation_respellings enable row level security;

drop policy if exists pronunciation_respellings_read on public.pronunciation_respellings;
create policy pronunciation_respellings_read
  on public.pronunciation_respellings
  for select
  to authenticated
  using (true);

revoke all on public.pronunciation_respellings from anon, authenticated;
grant select on public.pronunciation_respellings to authenticated;

commit;
