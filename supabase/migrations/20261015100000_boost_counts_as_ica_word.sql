-- POTENCIAR CUENTA COMO PALABRA ICA DE HOY (Luis, 15 Oct 2026, feedback de las admins)
--
-- Boosting a word that is already in the Baúl ICA now counts as one of today's ICA words:
-- - recompute_daily_creation_metrics_for_user_day: words_added = words created today plus words
--   from other days boosted today (each word once). So «0/5» becomes «1/5» and the cycle counts it.
-- - boost_lexicard: after a real boost (not the «already boosted» case) it also takes a place of
--   «Palabras de hoy» (without failing when the day's maximum is reached) and recomputes the day.
-- Both functions are otherwise the same as in 20260608123000 and 20261012170000.
-- Only boosts from today on change anything; past days are not recomputed.

begin;

create or replace function public.recompute_daily_creation_metrics_for_user_day(
  p_user_id uuid,
  p_day date
)
returns table (
  day date,
  words_added integer,
  phrase_generated boolean,
  voice_activations_count integer,
  creation_goal_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  tz text;
  day_start_utc timestamptz;
  day_end_utc timestamptz;
  words_count integer;
  has_phrase boolean;
  voice_count integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_day is null then
    raise exception 'DAY_REQUIRED';
  end if;

  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = p_user_id),
    'UTC'
  );

  day_start_utc := (p_day::timestamp at time zone tz);
  day_end_utc := ((p_day + 1)::timestamp at time zone tz);

  select count(*)::integer
  into words_count
  from public.lexicards l
  where l.user_id = p_user_id
    and l.created_at >= day_start_utc
    and l.created_at < day_end_utc;

  -- Potenciar (Luis, 15 Oct): a word from another day that was boosted today also counts as one of
  -- today's ICA words (once, however many times it is boosted).
  words_count := coalesce(words_count, 0) + coalesce((
    select count(distinct u.lexicard_id)::integer
    from public.lexicard_boost_uses u
    join public.lexicards l on l.id = u.lexicard_id
    where u.user_id = p_user_id
      and u.boost_day = p_day
      and not (l.created_at >= day_start_utc and l.created_at < day_end_utc)
  ), 0);

  select exists (
    select 1
    from public.phrase_generations pg
    where pg.user_id = p_user_id
      and coalesce(pg.success, true)
      and pg.created_at >= day_start_utc
      and pg.created_at < day_end_utc
  )
  into has_phrase;

  select count(*)::integer
  into voice_count
  from public.phrase_voice_activations pva
  where pva.user_id = p_user_id
    and pva.created_at >= day_start_utc
    and pva.created_at < day_end_utc;

  insert into public.daily_metrics (
    user_id,
    day,
    words_added,
    phrase_generated,
    voice_activations_count
  )
  values (
    p_user_id,
    p_day,
    coalesce(words_count, 0),
    coalesce(has_phrase, false),
    coalesce(voice_count, 0)
  )
  on conflict (user_id, day)
  do update
  set
    words_added = excluded.words_added,
    phrase_generated = excluded.phrase_generated,
    voice_activations_count = excluded.voice_activations_count,
    day = excluded.day;

  insert into public.goal_completions (
    user_id,
    day,
    goal_type,
    completed,
    progress_value,
    target_value
  )
  select
    dm.user_id,
    dm.day,
    'creation_goal',
    dm.creation_goal_completed,
    dm.words_added,
    5
  from public.daily_metrics dm
  where dm.user_id = p_user_id
    and dm.day = p_day
  on conflict (user_id, day, goal_type)
  do update
  set
    completed = excluded.completed,
    progress_value = excluded.progress_value,
    target_value = excluded.target_value,
    updated_at = now();

  return query
  select
    dm.day,
    dm.words_added,
    dm.phrase_generated,
    dm.voice_activations_count,
    dm.creation_goal_completed
  from public.daily_metrics dm
  where dm.user_id = p_user_id
    and dm.day = p_day;
end;
$$;

revoke all on function public.recompute_daily_creation_metrics_for_user_day(uuid, date) from public;
grant execute on function public.recompute_daily_creation_metrics_for_user_day(uuid, date) to authenticated;

create or replace function public.boost_lexicard(p_id uuid, p_source text default 'immersion')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit constant integer := 3;
  v_day date;
  v_used integer;
  v_source text := case when p_source in ('immersion', 'challenge', 'preguntica') then p_source else 'immersion' end;
  v_fresh boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Two taps at once from the same student cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('boost_lexicard:' || v_user::text, 0));

  v_day := public.ica_local_today(v_user);
  select count(*) into v_used
    from public.lexicard_boost_uses u
   where u.user_id = v_user and u.boost_day = v_day;

  select (l.boost_flash >= 2 and l.boost_daily >= 2 and l.boost_duel >= 2)
    into v_fresh
    from public.lexicards l
   where l.id = p_id and l.user_id = v_user;
  if not found then
    raise exception 'LEXICARD_NOT_FOUND';
  end if;

  -- Already boosted and not played yet: nothing to do, nothing used up.
  if v_fresh then
    return jsonb_build_object('used', v_used, 'remaining', greatest(0, v_limit - v_used), 'limit', v_limit);
  end if;

  if v_used >= v_limit then
    raise exception 'BOOST_DAILY_LIMIT';
  end if;

  update public.lexicards
     set importance = 'vital',
         boost_flash = 2,
         boost_daily = 2,
         boost_duel = 2,
         updated_at = now()
   where id = p_id
     and user_id = v_user;

  insert into public.lexicard_boost_uses (user_id, lexicard_id, boost_day, source)
  values (v_user, p_id, v_day, v_source);

  -- Luis, 15 Oct: a boosted word counts as one of today's ICA words: «Palabras de hoy» goes up
  -- (unless today's maximum is already reached, which never blocks the boost) and so does the
  -- minimum of 5 for the cycle. A word created today is already counted.
  -- The usage row cannot use the word id: ica_daily_limit_usage_source_once_idx allows one row per
  -- (user, kind, source) across ALL days, and the word already has the one from the day it was
  -- created. So the boost uses its own id per word and day (boosting it again today adds nothing).
  if not exists (
    select 1 from public.ica_daily_limit_usage u
     where u.user_id = v_user and u.usage_day = v_day
       and u.usage_kind = 'words' and u.source_id = p_id
  ) then
    begin
      perform public.ica_record_daily_limit_usage(
        v_user, 'words', md5(p_id::text || ':boost:' || v_day::text)::uuid
      );
    exception when others then
      null;
    end;
  end if;
  perform public.recompute_daily_creation_metrics_for_user_day(v_user, v_day);

  v_used := v_used + 1;
  return jsonb_build_object('used', v_used, 'remaining', greatest(0, v_limit - v_used), 'limit', v_limit);
end;
$$;

revoke all on function public.boost_lexicard(uuid, text) from public, anon;
grant execute on function public.boost_lexicard(uuid, text) to authenticated;

commit;
