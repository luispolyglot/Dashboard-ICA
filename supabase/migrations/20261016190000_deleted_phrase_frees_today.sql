-- BORRAR UNA FRASE DE HOY DEVUELVE SU HUECO DE CREACIÓN, COMO MUCHO 2 AL DÍA (Luis, 16 Oct 2026)
--
-- The daily maximum of phrases in Creación (2, or more with Creación ampliada) counts the rows of
-- ica_daily_limit_usage with usage_kind = 'phrases' (one per phrase, source_id = the
-- phrase_generations id, written by ica_enforce_creation_daily_limit). Deleting a phrase left its
-- row there, so whoever made 2 phrases and deleted one could not make another one.
--
-- Now:
--   1. When a phrase created today is deleted, its row for today goes too and that place can be
--      used again (same rule as words, 20261013100000_deleted_word_frees_today.sql).
--   2. A student can delete at most 2 phrases created today per day (Luis: otherwise someone could
--      create, delete and create again without end). The 3rd is refused with
--      DAILY_PHRASE_DELETE_LIMIT. Phrases from other days can still be deleted freely and change
--      nothing. Deletes not made by the student themselves (account deletion, service role) are
--      never blocked.
-- The activation rows (usage_kind = 'activations') are not touched (an activated phrase cannot be
-- deleted from the phrase list anyway: it has to be removed from its master note first).

begin;

-- Today's deletions of today's phrases, one row per phrase. Only the trigger below writes here.
create table if not exists public.ica_daily_phrase_deletions (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_day date not null,
  phrase_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, usage_day, phrase_id)
);

alter table public.ica_daily_phrase_deletions enable row level security;
revoke all on table public.ica_daily_phrase_deletions from public, anon, authenticated;
-- No policies: students never read or write it directly.

create or replace function public.ica_limit_daily_phrase_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date;
  deleted_today integer;
begin
  -- Only the student's own deletes count (account deletion and server jobs are never blocked).
  if auth.uid() is null or auth.uid() <> old.user_id then
    return old;
  end if;
  -- Phrases from other days: free to delete, they never give a place back.
  if old.created_at < now() - interval '2 days' then
    return old;
  end if;
  today := public.ica_local_today(old.user_id);
  if public.ica_local_date(old.user_id, old.created_at) <> today then
    return old;
  end if;

  select count(*)::integer
    into deleted_today
    from public.ica_daily_phrase_deletions d
   where d.user_id = old.user_id
     and d.usage_day = today;

  if deleted_today >= 2 then
    raise exception 'DAILY_PHRASE_DELETE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ica_daily_phrase_deletions (user_id, usage_day, phrase_id)
  values (old.user_id, today, old.id)
  on conflict do nothing;
  return old;
end;
$$;

revoke all on function public.ica_limit_daily_phrase_deletion() from public, anon, authenticated;

drop trigger if exists phrase_generations_limit_daily_deletion on public.phrase_generations;
create trigger phrase_generations_limit_daily_deletion
  before delete on public.phrase_generations
  for each row execute function public.ica_limit_daily_phrase_deletion();

create or replace function public.ica_free_daily_phrase_usage_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a phrase from today can free a place today. Older ones (for example all the phrases of an
  -- account being deleted) leave at once, without working out the student's day.
  if old.created_at < now() - interval '2 days' then
    return null;
  end if;
  delete from public.ica_daily_limit_usage u
   where u.user_id = old.user_id
     and u.usage_kind = 'phrases'
     and u.source_id = old.id
     and u.usage_day = public.ica_local_today(old.user_id);
  return null;
end;
$$;

revoke all on function public.ica_free_daily_phrase_usage_on_delete() from public, anon, authenticated;

drop trigger if exists phrase_generations_free_daily_phrase_usage on public.phrase_generations;
create trigger phrase_generations_free_daily_phrase_usage
  after delete on public.phrase_generations
  for each row execute function public.ica_free_daily_phrase_usage_on_delete();

commit;
