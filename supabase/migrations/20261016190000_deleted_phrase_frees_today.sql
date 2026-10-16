-- BORRAR UNA FRASE DE HOY DEVUELVE SU HUECO DE CREACIÓN (Luis, 16 Oct 2026)
--
-- The daily maximum of phrases in Creación (2, or more with Creación ampliada) counts the rows of
-- ica_daily_limit_usage with usage_kind = 'phrases' (one per phrase, source_id = the
-- phrase_generations id, written by ica_enforce_creation_daily_limit). Deleting a phrase left its
-- row there, so whoever made 2 phrases and deleted one could not make another one. Now, when a
-- phrase created today is deleted, its row for today goes too and that place can be used again.
-- Same rule as words (20261013100000_deleted_word_frees_today.sql). Phrases from other days
-- change nothing, and the activation rows (usage_kind = 'activations') are not touched.

begin;

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
