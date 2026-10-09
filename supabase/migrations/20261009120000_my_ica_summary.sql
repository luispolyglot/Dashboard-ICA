-- TUS CIFRAS GLOBALES Y EL WRAPPED ICA DEL AÑO (Luis, 9 Oct)
--
-- get_my_ica_summary(from_day, to_day, target, native): one read-only summary of the signed-in
-- student between two days (to_day not included), for one language pair. Estadísticas uses it for
-- «Global» and the Wrapped ICA for one year.
-- The days are the student's own days: they are read in the time zone of their profile (Madrid
-- if it has none), both for the tables that store a day and for the ones that store a moment.
-- It only reads the student's own rows (auth.uid()); nothing is written.

begin;

-- The busiest query (flashcard answers of one student over a year) needs this index.
create index if not exists lexicard_reviews_user_reviewed_at_idx
  on public.lexicard_reviews (user_id, reviewed_at);

create or replace function public.get_my_ica_summary(
  p_from_day date,
  p_to_day date,
  p_target_lang text,
  p_native_lang text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  tz text;
  from_day date;
  to_day date;
  p_from timestamptz;
  p_to timestamptz;
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  result jsonb;
begin
  if me is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_from_day is null or p_to_day is null or p_to_day <= p_from_day then
    raise exception 'RANGE_REQUIRED';
  end if;
  if target_l = '' or native_l = '' then
    raise exception 'LANGUAGES_REQUIRED';
  end if;

  select coalesce(tzn.name, 'Europe/Madrid')
    into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
  where p.id = me;
  tz := coalesce(tz, 'Europe/Madrid');
  from_day := p_from_day;
  to_day := p_to_day - 1;
  -- The same days as moments: midnight of the student's own time zone.
  p_from := p_from_day::timestamp at time zone tz;
  p_to := p_to_day::timestamp at time zone tz;

  with
  words as (
    select l.id, l.target, l.native, l.created_at
    from public.lexicards l
    where l.user_id = me
      and lower(l.target_lang) = target_l
      and lower(l.native_lang) = native_l
      and l.created_at >= p_from and l.created_at < p_to
  ),
  reviews as (
    select r.lexicard_id, r.knew, r.reviewed_at, l.target, l.native
    from public.lexicard_reviews r
    join public.lexicards l on l.id = r.lexicard_id
    where r.user_id = me
      and r.reviewed_at >= p_from and r.reviewed_at < p_to
      and lower(l.target_lang) = target_l
      and lower(l.native_lang) = native_l
  ),
  top_review as (
    select target, native, count(*) as answers, count(*) filter (where knew) as correct
    from reviews
    group by lexicard_id, target, native
    order by count(*) desc, count(*) filter (where knew) desc, max(reviewed_at) desc
    limit 1
  ),
  review_hour as (
    select extract(hour from (reviewed_at at time zone tz))::int as hour, count(*) as n
    from reviews
    group by 1
    order by 2 desc, 1
    limit 1
  ),
  phrases as (
    select g.source_words
    from public.phrase_generations g
    where g.user_id = me
      and g.success = true
      and lower(g.target_lang) = target_l
      and lower(g.native_lang) = native_l
      and g.created_at >= p_from and g.created_at < p_to
  ),
  phrase_word as (
    select lower(trim(w)) as word, count(*) as n
    from phrases, unnest(source_words) as w
    where length(trim(w)) > 0
    group by 1
    order by 2 desc, 1
    limit 1
  ),
  days as (
    select d.day, d.creation_goal_completed, d.review_goal_completed, d.words_added, d.correct_reviews
    from public.daily_metrics d
    where d.user_id = me
      and d.day between from_day and to_day
  ),
  best_month as (
    select date_trunc('month', day)::date as month, count(*) as n
    from days
    where creation_goal_completed
    group by 1
    order by 2 desc, 1 desc
    limit 1
  ),
  listening as (
    select coalesce(sum(l.delta_seconds), 0)::bigint as seconds
    from public.master_note_listening_ingest_log l
    cross join lateral (
      select case
        when l.local_day is not null then l.local_day
        when l.occurred_at is not null then
          (l.occurred_at at time zone coalesce(nullif(l.timezone_name, ''), tz))::date
        when (l.created_at at time zone 'UTC')::date > l.day + 1 then l.day
        else (l.created_at at time zone tz)::date
      end as listening_day
    ) event_day
    where l.user_id = me
      and l.delta_seconds > 0
      and lower(l.target_lang) = target_l
      and lower(l.native_lang) = native_l
      and event_day.listening_day between from_day and to_day
  ),
  daily_games as (
    select g.correct, g.total
    from public.ica_daily_game_results g
    where g.user_id = me
      and g.day between from_day and to_day
  ),
  challenges as (
    select
      c.winner_user_id,
      case when c.challenger_user_id = me then c.challenged_user_id else c.challenger_user_id end as rival_id
    from public.ica_challenges c
    where (c.challenger_user_id = me or c.challenged_user_id = me)
      and c.status = 'completed'
      and lower(c.target_lang) = target_l
      and coalesce(c.finalized_at, c.created_at) >= p_from
      and coalesce(c.finalized_at, c.created_at) < p_to
  ),
  top_rival as (
    select ch.rival_id, count(*) as games, count(*) filter (where ch.winner_user_id = me) as wins
    from challenges ch
    where ch.rival_id is not null
    group by ch.rival_id
    order by 2 desc, 3 desc
    limit 1
  )
  select jsonb_build_object(
    'from_day', from_day,
    'to_day', to_day,
    'words_added', (select count(*) from words),
    'first_word', (
      select jsonb_build_object('target', w.target, 'native', w.native, 'created_at', w.created_at)
      from words w
      order by w.created_at asc
      limit 1
    ),
    'phrases_created', (select count(*) from phrases),
    'top_phrase_word', (select jsonb_build_object('word', word, 'times', n) from phrase_word),
    'master_notes_closed', (
      select count(*)
      from public.master_notes m
      where m.user_id = me
        and m.state = 'closed'
        and lower(m.target_lang) = target_l
        and lower(m.native_lang) = native_l
        and m.closed_at >= p_from and m.closed_at < p_to
    ),
    'reviews_total', (select count(*) from reviews),
    'reviews_correct', (select count(*) from reviews where knew),
    'top_review_word', (
      select jsonb_build_object('target', target, 'native', native, 'answers', answers, 'correct', correct)
      from top_review
    ),
    'top_hour', (select hour from review_hour),
    'listening_seconds', (select seconds from listening),
    'cycle_days', (select count(*) from days where creation_goal_completed),
    'flash_days', (select count(*) from days where review_goal_completed),
    'active_days', (
      select count(*) from days
      where creation_goal_completed or review_goal_completed or words_added > 0 or correct_reviews > 0
    ),
    'best_month', (select jsonb_build_object('month', month, 'days', n) from best_month),
    'daily_games_played', (select count(*) from daily_games),
    'daily_games_perfect', (select count(*) from daily_games where correct = total),
    'daily_games_correct', (select coalesce(sum(correct), 0) from daily_games),
    'challenges_played', (select count(*) from challenges),
    'challenges_won', (select count(*) from challenges where winner_user_id = me),
    'top_rival', (
      select jsonb_build_object(
        'name', coalesce(nullif(split_part(trim(coalesce(p.display_name, '')), ' ', 1), ''), p.username, ''),
        'games', tr.games,
        'wins', tr.wins
      )
      from top_rival tr
      left join public.profiles p on p.id = tr.rival_id
    ),
    'best_rank', (
      select min(s.rank)
      from public.leaderboard_snapshots s
      where s.user_id = me
        and s.period = 'monthly'
        and s.period_start between from_day and to_day
    ),
    'coins_earned', (
      select coalesce(sum(t.tokens_delta), 0)
      from public.preguntica_token_ledger t
      where t.user_id = me
        and t.tokens_delta > 0
        and t.created_at >= p_from and t.created_at < p_to
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_my_ica_summary(date, date, text, text) from public, anon;
grant execute on function public.get_my_ica_summary(date, date, text, text) to authenticated;

commit;
