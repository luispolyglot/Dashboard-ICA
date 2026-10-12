-- REPASO DEL MES (Luis, 9 Oct)
--
-- Once a month, from day 21 to day 28, a student who saved at least 20 ICA words between day 1
-- and day 21 can play the «Repaso»: 14 questions built from their own words, expressions and
-- phrases (reading, listening, writing; nothing spoken). One attempt per month.
-- - ica_monthly_review_config(): the days and the minimum, in ONE place (open day 21, close day
--   28, 20 words). Change it with a forward migration; in development it can be redefined by hand
--   to try the Repaso before day 21.
-- - get_my_monthly_review_status(): what the Tests screen needs (window, how many words, result).
-- - get_my_monthly_review_pool(): the student's words and phrases of the month, read by the
--   server in the student's own time zone (profiles.timezone), only while the Repaso is playable.
--   With p_practice = true it also answers after the Repaso is done: a practice round (Luis, 9 Oct:
--   with a low score the student can repeat it). A practice round saves nothing and pays nothing.
-- - finish_monthly_review(): saves the result (once per month) and pays the ICA Coins: as many
--   as «remembered words out of ten» (86 % -> 9, 74 % -> 8), through the same ledger and the
--   same 100-coin wallet limit as the cycle chest. The browser never writes coins or results.
--   The words that were missed are boosted (POTENCIAR), like the ones boosted by hand.
-- The questions themselves are built in the browser from the pool; the server checks the window,
-- the minimum, the shape of the result and that it is only saved once.

begin;

-- 1. New ledger entry type: the prize of the Repaso.
alter table public.preguntica_token_ledger
  drop constraint if exists preguntica_token_ledger_entry_type_check;
alter table public.preguntica_token_ledger
  add constraint preguntica_token_ledger_entry_type_check
  check (entry_type in (
    'monthly_earn',
    'redeem_unlock',
    'manual_adjustment',
    'cycle_chest',
    'streak_milestone',
    'flash_milestone',
    'challenge_win',
    'phase_boost',
    'challenge_pass',
    'flag_purchase',
    'monthly_review'
  ));

create unique index if not exists preguntica_ledger_monthly_review_once
  on public.preguntica_token_ledger (user_id, entry_type, reference_key)
  where entry_type = 'monthly_review';

-- 2. Results (read-only for the student; written only by finish_monthly_review).
create table if not exists public.ica_monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  review_month date not null check (review_month = date_trunc('month', review_month)::date),
  target_lang text not null check (char_length(target_lang) between 1 and 40),
  native_lang text not null check (char_length(native_lang) between 1 and 40),
  correct integer not null check (correct >= 0),
  total integer not null check (total between 10 and 14),
  remembered_of_ten smallint not null check (remembered_of_ten between 0 and 10),
  round_scores jsonb not null,
  coins_awarded numeric(10,2) not null default 0 check (coins_awarded >= 0),
  ledger_entry_id uuid unique references public.preguntica_token_ledger (id) on delete restrict,
  finished_at timestamptz not null default now(),
  check (correct <= total),
  unique (user_id, review_month)
);

alter table public.ica_monthly_reviews enable row level security;
drop policy if exists ica_monthly_reviews_select_own on public.ica_monthly_reviews;
create policy ica_monthly_reviews_select_own
  on public.ica_monthly_reviews for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.ica_monthly_reviews from public, anon, authenticated;
grant select on public.ica_monthly_reviews to authenticated;

-- 3. The rules, in one place.
create or replace function public.ica_monthly_review_config()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('openDay', 21, 'closeDay', 28, 'minWords', 20)
$$;

revoke all on function public.ica_monthly_review_config() from public, anon;
grant execute on function public.ica_monthly_review_config() to authenticated;

-- The student's own calendar: today, this month and the moments that frame the word pool
-- (day 1 until the end of the open day), all in the time zone of the profile (UTC without one),
-- the same as the rest of the ICA Coins.
create or replace function public.ica_monthly_review_context(p_user_id uuid)
returns table (
  local_today date,
  month_start date,
  window_open boolean,
  pool_from timestamptz,
  pool_to timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text;
  cfg jsonb := public.ica_monthly_review_config();
  open_day integer := (cfg ->> 'openDay')::integer;
  close_day integer := (cfg ->> 'closeDay')::integer;
  v_today date;
  v_month date;
begin
  select coalesce(tzn.name, 'UTC')
    into tz
  from (select 1) seed
  left join public.profiles p on p.id = p_user_id
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '');
  tz := coalesce(tz, 'UTC');

  v_today := (now() at time zone tz)::date;
  v_month := date_trunc('month', v_today)::date;

  return query select
    v_today,
    v_month,
    extract(day from v_today)::integer between open_day and close_day,
    v_month::timestamp at time zone tz,
    (v_month + open_day)::timestamp at time zone tz;
end;
$$;

revoke all on function public.ica_monthly_review_context(uuid) from public, anon, authenticated;

-- 4. What the Tests screen needs.
create or replace function public.get_my_monthly_review_status(p_target_lang text, p_native_lang text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  ctx record;
  cfg jsonb := public.ica_monthly_review_config();
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  word_count integer;
  result_row public.ica_monthly_reviews%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_l = '' or native_l = '' then raise exception 'LANGUAGES_REQUIRED'; end if;

  select * into ctx from public.ica_monthly_review_context(v_user_id);

  select count(*)::integer into word_count
  from public.lexicards l
  where l.user_id = v_user_id
    and lower(l.target_lang) = target_l
    and lower(l.native_lang) = native_l
    and l.created_at >= ctx.pool_from
    and l.created_at < ctx.pool_to;

  select r.* into result_row
  from public.ica_monthly_reviews r
  where r.user_id = v_user_id and r.review_month = ctx.month_start;

  return jsonb_build_object(
    'monthStart', ctx.month_start,
    'today', ctx.local_today,
    'openDay', (cfg ->> 'openDay')::integer,
    'closeDay', (cfg ->> 'closeDay')::integer,
    'minWords', (cfg ->> 'minWords')::integer,
    'windowOpen', ctx.window_open,
    'wordCount', word_count,
    'eligible', word_count >= (cfg ->> 'minWords')::integer,
    'result', case when result_row.id is null then null else jsonb_build_object(
      'correct', result_row.correct,
      'total', result_row.total,
      'rememberedOfTen', result_row.remembered_of_ten,
      'coins', result_row.coins_awarded,
      'rounds', result_row.round_scores,
      'finishedAt', result_row.finished_at
    ) end
  );
end;
$$;

revoke all on function public.get_my_monthly_review_status(text, text) from public, anon;
grant execute on function public.get_my_monthly_review_status(text, text) to authenticated;

-- 5. The words and phrases to build the questions from.
create or replace function public.get_my_monthly_review_pool(
  p_target_lang text,
  p_native_lang text,
  p_practice boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  ctx record;
  cfg jsonb := public.ica_monthly_review_config();
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  words jsonb;
  phrases jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_l = '' or native_l = '' then raise exception 'LANGUAGES_REQUIRED'; end if;

  select * into ctx from public.ica_monthly_review_context(v_user_id);
  if not ctx.window_open then raise exception 'REVIEW_WINDOW_CLOSED'; end if;
  if exists (
    select 1 from public.ica_monthly_reviews r
    where r.user_id = v_user_id and r.review_month = ctx.month_start
  ) then
    if not coalesce(p_practice, false) then raise exception 'REVIEW_ALREADY_DONE'; end if;
  elsif coalesce(p_practice, false) then
    -- Practice is only for repeating a Repaso already done this month.
    raise exception 'REVIEW_NOT_DONE';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'target', w.target, 'native', w.native) order by w.created_at, w.id), '[]'::jsonb)
  into words
  from public.lexicards w
  where w.user_id = v_user_id
    and lower(w.target_lang) = target_l
    and lower(w.native_lang) = native_l
    and w.created_at >= ctx.pool_from
    and w.created_at < ctx.pool_to
    and length(trim(w.target)) > 0
    and length(trim(w.native)) > 0;

  if jsonb_array_length(words) < (cfg ->> 'minWords')::integer then
    raise exception 'REVIEW_NOT_ELIGIBLE';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'target', g.generated_phrase, 'native', g.translation) order by g.created_at, g.id), '[]'::jsonb)
  into phrases
  from public.phrase_generations g
  where g.user_id = v_user_id
    and g.success = true
    and lower(g.target_lang) = target_l
    and lower(g.native_lang) = native_l
    and g.created_at >= ctx.pool_from
    and g.created_at < ctx.pool_to
    and length(trim(coalesce(g.generated_phrase, ''))) > 0
    and length(trim(coalesce(g.translation, ''))) > 0;

  return jsonb_build_object('monthStart', ctx.month_start, 'words', words, 'phrases', phrases);
end;
$$;

revoke all on function public.get_my_monthly_review_pool(text, text, boolean) from public, anon;
grant execute on function public.get_my_monthly_review_pool(text, text, boolean) to authenticated;

-- 6. Save the result once and pay the prize.
create or replace function public.finish_monthly_review(
  p_target_lang text,
  p_native_lang text,
  p_correct integer,
  p_total integer,
  p_rounds jsonb,
  p_missed_word_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  ctx record;
  cfg jsonb := public.ica_monthly_review_config();
  target_l text := lower(trim(coalesce(p_target_lang, '')));
  native_l text := lower(trim(coalesce(p_native_lang, '')));
  word_count integer;
  existing public.ica_monthly_reviews%rowtype;
  reading_c integer;
  reading_t integer;
  listening_c integer;
  listening_t integer;
  writing_c integer;
  writing_t integer;
  tens integer;
  current_balance numeric(10,2);
  credited numeric(10,2);
  ledger_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_l = '' or native_l = '' then raise exception 'LANGUAGES_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));

  select * into ctx from public.ica_monthly_review_context(v_user_id);

  select r.* into existing
  from public.ica_monthly_reviews r
  where r.user_id = v_user_id and r.review_month = ctx.month_start;
  if found then
    return jsonb_build_object(
      'alreadyDone', true,
      'correct', existing.correct,
      'total', existing.total,
      'rememberedOfTen', existing.remembered_of_ten,
      'coins', existing.coins_awarded,
      'rounds', existing.round_scores
    );
  end if;

  if not ctx.window_open then raise exception 'REVIEW_WINDOW_CLOSED'; end if;

  select count(*)::integer into word_count
  from public.lexicards l
  where l.user_id = v_user_id
    and lower(l.target_lang) = target_l
    and lower(l.native_lang) = native_l
    and l.created_at >= ctx.pool_from
    and l.created_at < ctx.pool_to;
  if word_count < (cfg ->> 'minWords')::integer then raise exception 'REVIEW_NOT_ELIGIBLE'; end if;

  -- The shape of the result: 4 reading questions, 6 writing questions, up to 4 listening ones
  -- (a listening question the student could not hear does not count).
  begin
    reading_c := (p_rounds -> 'reading' ->> 'correct')::integer;
    reading_t := (p_rounds -> 'reading' ->> 'total')::integer;
    listening_c := (p_rounds -> 'listening' ->> 'correct')::integer;
    listening_t := (p_rounds -> 'listening' ->> 'total')::integer;
    writing_c := (p_rounds -> 'writing' ->> 'correct')::integer;
    writing_t := (p_rounds -> 'writing' ->> 'total')::integer;
  exception when others then
    raise exception 'REVIEW_RESULT_INVALID';
  end;

  if reading_c is null or reading_t is null or listening_c is null or listening_t is null
     or writing_c is null or writing_t is null
     or reading_t <> 4 or writing_t <> 6 or listening_t < 0 or listening_t > 4
     or reading_c < 0 or reading_c > reading_t
     or listening_c < 0 or listening_c > listening_t
     or writing_c < 0 or writing_c > writing_t
     or p_correct is distinct from (reading_c + listening_c + writing_c)
     or p_total is distinct from (reading_t + listening_t + writing_t)
     or p_total < 10 or p_total > 14 then
    raise exception 'REVIEW_RESULT_INVALID';
  end if;

  -- Remembered words out of ten: the percentage rounded UP to the tens (86 % -> 9, 74 % -> 8).
  tens := (10 * p_correct + p_total - 1) / p_total;

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger l where l.user_id = v_user_id;
  credited := greatest(0, least(tens::numeric, 100 - current_balance));

  if credited > 0 then
    insert into public.preguntica_token_ledger (
      user_id, entry_type, tokens_delta, reference_day, reference_key, metadata
    ) values (
      v_user_id, 'monthly_review', credited, ctx.local_today, to_char(ctx.month_start, 'YYYY-MM'),
      jsonb_build_object('tens', tens, 'correct', p_correct, 'total', p_total, 'source', 'monthly_review')
    ) returning id into ledger_id;
  end if;

  insert into public.ica_monthly_reviews (
    user_id, review_month, target_lang, native_lang, correct, total, remembered_of_ten,
    round_scores, coins_awarded, ledger_entry_id
  ) values (
    v_user_id, ctx.month_start, trim(p_target_lang), trim(p_native_lang), p_correct, p_total, tens,
    jsonb_build_object(
      'reading', jsonb_build_object('correct', reading_c, 'total', reading_t),
      'listening', jsonb_build_object('correct', listening_c, 'total', listening_t),
      'writing', jsonb_build_object('correct', writing_c, 'total', writing_t)
    ),
    credited, ledger_id
  );

  -- POTENCIAR: the words that were missed come first in the next flashcards, daily challenges and
  -- Desafíos ICA (only the student's own words; at most one per question).
  if p_missed_word_ids is not null and cardinality(p_missed_word_ids) > 0 then
    update public.lexicards
       set importance = 'vital',
           boost_flash = 2,
           boost_daily = 2,
           boost_duel = 2,
           updated_at = now()
     where user_id = v_user_id
       and id = any (p_missed_word_ids[1:14]);
  end if;

  return jsonb_build_object(
    'alreadyDone', false,
    'correct', p_correct,
    'total', p_total,
    'rememberedOfTen', tens,
    'coins', credited,
    'coinsCapped', credited < tens,
    'rounds', jsonb_build_object(
      'reading', jsonb_build_object('correct', reading_c, 'total', reading_t),
      'listening', jsonb_build_object('correct', listening_c, 'total', listening_t),
      'writing', jsonb_build_object('correct', writing_c, 'total', writing_t)
    )
  );
end;
$$;

revoke all on function public.finish_monthly_review(text, text, integer, integer, jsonb, uuid[]) from public, anon;
grant execute on function public.finish_monthly_review(text, text, integer, integer, jsonb, uuid[]) to authenticated;

commit;
