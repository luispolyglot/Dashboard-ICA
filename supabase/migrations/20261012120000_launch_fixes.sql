-- LAUNCH FIXES (Luis, 12 Oct 2026)
-- 1. daily_metrics: a day already counted is never lowered (see the trigger). The same change is in
--    20261003120000 so that its backfill does not rewrite production's history; this file brings it
--    to databases that already ran the old version.
-- 2. Flashcards: students who already reviewed words keep flashcards even with fewer than 20
--    activated words. The 20 activated words apply to new students only.
-- 3. ai_usage_daily: no foreign key to auth.users. With «on delete set null» and the unique index on
--    coalesce(user_id, …), deleting a second user with usage on the same day/model failed.

create or replace function public.daily_metrics_compute_goal_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  timezone_name text;
  day_start timestamptz;
  day_end timestamptz;
  true_reviews integer;
begin
  select coalesce(tzn.name, 'UTC') into timezone_name
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = new.user_id;
  timezone_name := coalesce(timezone_name, 'UTC');
  day_start := new.day::timestamp at time zone timezone_name;
  day_end := (new.day + 1)::timestamp at time zone timezone_name;

  select count(*) filter (where lr.knew)::integer into true_reviews
  from public.lexicard_reviews lr
  where lr.user_id = new.user_id and lr.reviewed_at >= day_start and lr.reviewed_at < day_end;
  new.correct_reviews := coalesce(true_reviews, 0);
  -- Never lower a day that was already counted (Luis, 12 Oct, launch): reviews of words deleted
  -- later, or made under another time zone, must not break past flashcards days and streaks.
  -- Students cannot raise it either: the stored value or the real reviews, whichever is higher.
  if tg_op = 'UPDATE' then
    new.correct_reviews := greatest(coalesce(old.correct_reviews, 0), new.correct_reviews);
  end if;
  new.review_goal_completed := new.correct_reviews >= 10;

  new.voice_requirement_met := case
    when new.day < date '2026-05-25' then true
    else coalesce(new.voice_activations_count, 0) > 0
  end;
  new.creation_goal_completed :=
    coalesce(new.words_added, 0) >= 5
    and coalesce(new.phrase_generated, false)
    and new.voice_requirement_met;
  return new;
end;
$$;


create or replace function public.record_review_event(
  p_lexicard_id uuid,
  p_knew boolean,
  p_response_time_ms integer default null
)
returns table (review_day date, correct_reviews integer, review_goal_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  day_start timestamptz;
  day_end timestamptz;
  timezone_name text;
  card_row public.lexicards%rowtype;
  activated_words integer;
  correct_count integer;
  xp_points integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_lexicard_id is null or p_knew is null then raise exception 'REVIEW_EVENT_INVALID'; end if;
  if p_response_time_ms is not null and p_response_time_ms < 0 then raise exception 'REVIEW_RESPONSE_TIME_INVALID'; end if;

  select l.* into card_row
  from public.lexicards l
  where l.id = p_lexicard_id and l.user_id = v_user_id;
  if not found then raise exception 'LEXICARD_NOT_FOUND'; end if;

  select count(distinct pla.lexicard_id)::integer into activated_words
  from public.phrase_lexicard_activations pla
  join public.lexicards l on l.id = pla.lexicard_id
  where pla.user_id = v_user_id
    and lower(trim(pla.target_lang)) = lower(trim(coalesce(card_row.target_lang, '')))
    and lower(trim(pla.native_lang)) = lower(trim(coalesce(card_row.native_lang, '')));
  -- Students who already played flashcards keep them (Luis, 12 Oct, launch): the 20 activated
  -- words only apply to those who never reviewed a word. Same rule as the app (useActivatedWords).
  if coalesce(activated_words, 0) < 20
     and not exists (select 1 from public.lexicard_reviews lr0 where lr0.user_id = v_user_id) then
    raise exception 'FLASHCARDS_LOCKED_20_ACTIVATED_WORDS';
  end if;

  local_day := public.ica_local_today(v_user_id);
  select coalesce(tzn.name, 'UTC') into timezone_name
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = v_user_id;
  timezone_name := coalesce(timezone_name, 'UTC');
  day_start := local_day::timestamp at time zone timezone_name;
  day_end := (local_day + 1)::timestamp at time zone timezone_name;

  perform pg_advisory_xact_lock(hashtextextended('ica-review-day:' || v_user_id::text || ':' || local_day::text, 0));
  insert into public.lexicard_reviews (
    user_id, lexicard_id, knew, response_time_ms, reviewed_at, created_at
  ) values (
    v_user_id, card_row.id, p_knew, p_response_time_ms, now(), now()
  );

  select count(*) filter (where lr.knew)::integer into correct_count
  from public.lexicard_reviews lr
  where lr.user_id = v_user_id and lr.reviewed_at >= day_start and lr.reviewed_at < day_end;
  xp_points := case when p_knew then 10 else 2 end;

  insert into public.daily_metrics (user_id, day, correct_reviews, xp_earned)
  values (v_user_id, local_day, coalesce(correct_count, 0), xp_points)
  on conflict (user_id, day) do update
  set correct_reviews = greatest(public.daily_metrics.correct_reviews, excluded.correct_reviews),
      xp_earned = public.daily_metrics.xp_earned + xp_points;

  insert into public.goal_completions (user_id, day, goal_type, completed, progress_value, target_value)
  select v_user_id, local_day, 'review_goal', dm.review_goal_completed, dm.correct_reviews, 10
  from public.daily_metrics dm
  where dm.user_id = v_user_id and dm.day = local_day
  on conflict (user_id, day, goal_type) do update
  set completed = excluded.completed,
      progress_value = excluded.progress_value,
      target_value = excluded.target_value,
      updated_at = now();

  insert into public.xp_events (user_id, source, points, metadata)
  values (
    v_user_id,
    case when p_knew then 'review_correct' else 'review_incorrect' end,
    xp_points,
    jsonb_build_object('lexicard_id', card_row.id, 'importance', card_row.importance)
  );

  return query
  select local_day, dm.correct_reviews, dm.review_goal_completed
  from public.daily_metrics dm where dm.user_id = v_user_id and dm.day = local_day;
end;
$$;


alter table public.ai_usage_daily drop constraint if exists ai_usage_daily_user_id_fkey;
