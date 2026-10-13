-- BORRAR UNA PALABRA DE HOY LA QUITA DE «PALABRAS DE HOY» (Luis, 12 Oct 2026)
--
-- «Palabras de hoy» (and the daily maximum of 10, or 20 with Inmersión ampliada) counts the rows of
-- ica_daily_limit_usage. Deleting a word from the Baúl ICA left its row there, so the counter did
-- not go down. Now, when a word created today is deleted, its row for today goes too: the counter
-- goes down and that place can be used again. Words from other days change nothing.
-- daily_metrics.words_added already went down by itself (it is recomputed from the words).

begin;

create or replace function public.ica_free_daily_word_usage_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a word from today can free a place today. Older ones (for example all the words of an
  -- account being deleted) leave at once, without working out the student's day.
  if old.created_at < now() - interval '2 days' then
    return null;
  end if;
  delete from public.ica_daily_limit_usage u
   where u.user_id = old.user_id
     and u.usage_kind = 'words'
     and u.source_id = old.id
     and u.usage_day = public.ica_local_today(old.user_id);
  return null;
end;
$$;

revoke all on function public.ica_free_daily_word_usage_on_delete() from public, anon, authenticated;

drop trigger if exists lexicards_free_daily_word_usage on public.lexicards;
create trigger lexicards_free_daily_word_usage
  after delete on public.lexicards
  for each row execute function public.ica_free_daily_word_usage_on_delete();

commit;
