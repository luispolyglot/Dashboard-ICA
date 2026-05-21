begin;

create or replace function public.bump_daily_review_metrics(
  p_day date,
  p_correct_delta integer default 0,
  p_xp_delta integer default 0
)
returns table (
  correct_reviews integer,
  xp_earned integer,
  review_goal_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  safe_correct_delta integer;
  safe_xp_delta integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_day is null then
    raise exception 'DAY_REQUIRED';
  end if;

  safe_correct_delta := greatest(coalesce(p_correct_delta, 0), 0);
  safe_xp_delta := greatest(coalesce(p_xp_delta, 0), 0);

  return query
  insert into public.daily_metrics (user_id, day, correct_reviews, xp_earned)
  values (current_user_id, p_day, safe_correct_delta, safe_xp_delta)
  on conflict (user_id, day)
  do update
  set
    correct_reviews = public.daily_metrics.correct_reviews + safe_correct_delta,
    xp_earned = public.daily_metrics.xp_earned + safe_xp_delta,
    day = excluded.day
  returning
    public.daily_metrics.correct_reviews,
    public.daily_metrics.xp_earned,
    public.daily_metrics.review_goal_completed;
end;
$$;

revoke all on function public.bump_daily_review_metrics(date, integer, integer) from public;
grant execute on function public.bump_daily_review_metrics(date, integer, integer) to authenticated;

create or replace function public.bump_daily_creation_metrics(
  p_day date,
  p_words_added integer default 0,
  p_phrase_generated boolean default false,
  p_xp_delta integer default 0
)
returns table (
  words_added integer,
  phrase_generated boolean,
  xp_earned integer,
  creation_goal_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  safe_words_added integer;
  safe_xp_delta integer;
  phrase_flag boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_day is null then
    raise exception 'DAY_REQUIRED';
  end if;

  safe_words_added := greatest(coalesce(p_words_added, 0), 0);
  safe_xp_delta := greatest(coalesce(p_xp_delta, 0), 0);
  phrase_flag := coalesce(p_phrase_generated, false);

  return query
  insert into public.daily_metrics (user_id, day, words_added, phrase_generated, xp_earned)
  values (current_user_id, p_day, safe_words_added, phrase_flag, safe_xp_delta)
  on conflict (user_id, day)
  do update
  set
    words_added = greatest(public.daily_metrics.words_added, safe_words_added),
    phrase_generated = public.daily_metrics.phrase_generated or phrase_flag,
    xp_earned = public.daily_metrics.xp_earned + safe_xp_delta,
    day = excluded.day
  returning
    public.daily_metrics.words_added,
    public.daily_metrics.phrase_generated,
    public.daily_metrics.xp_earned,
    public.daily_metrics.creation_goal_completed;
end;
$$;

revoke all on function public.bump_daily_creation_metrics(date, integer, boolean, integer) from public;
grant execute on function public.bump_daily_creation_metrics(date, integer, boolean, integer) to authenticated;

drop policy if exists "daily_metrics_all_own" on public.daily_metrics;
drop policy if exists "daily_metrics_insert_own" on public.daily_metrics;
drop policy if exists "daily_metrics_update_own" on public.daily_metrics;
drop policy if exists "daily_metrics_select_own" on public.daily_metrics;

create policy "daily_metrics_select_own"
on public.daily_metrics
for select
using (auth.uid() = user_id);

commit;
