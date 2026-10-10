-- PREGUNTICA: WEEKS OF THE MONTH (Luis, 9 Oct)
--
-- Until now a PreguntICA week ran Friday to Thursday, so the 4th or 5th week of a month fell on
-- different days every month and mixed two months (Davinia). Now the weeks are those of the
-- calendar month, the same every month:
--   week 1 = days 1-7, week 2 = days 8-14, week 3 = days 15-21, week 4 = days 22-28.
--   Days 29-31: no PreguntICA (the month's ranking closes on day 28); it comes back on day 1.
-- Four weeks, 2 points each: the 8 points of the month, always.
--
-- Change-over without breaking the running weeks: up to 29 Oct 2026 the Friday weeks go on
-- (the last one is 23-29 Oct); 30 and 31 Oct are already "closed"; 1 Nov is week 1.
-- Week rows keep week_end = week_start + 7 (end not included), so the table does not change.
-- Every date is the student's own day (profile time zone, UTC without one), as before.
--
-- Changes:
--   1. preguntica_week_for_day(day): the week of a day (new helper, used by everything below).
--   2. get_my_preguntica_week_status: new weeks + a new last column is_closed (days 29-31: no
--      row is created and it returns when the next one opens).
--   3. create_preguntica_attempt: PREGUNTICA_CLOSED on days 29-31.
--   4. redeem_preguntica_tokens_for_week: only for the current week, never on days 29-31.
-- The ranking side (which month a PreguntICA counts in) is in
-- 20261008170000_preguntica_days_29_31_count_next_month.sql, applied just before this one.

begin;

-- 1. The PreguntICA week of a day.
create or replace function public.preguntica_week_for_day(p_day date)
returns table (week_start date, week_end date, is_closed boolean)
language sql
immutable
set search_path = public
as $$
  select
    w.week_start,
    w.week_start + 7,
    w.is_closed
  from (
    select
      case
        -- Before the change-over: Friday to Thursday (dow 5 = Friday).
        when p_day < date '2026-10-30'
          then p_day - ((extract(dow from p_day)::integer - 5 + 7) % 7)
        -- Days 29-31: closed; the next week is day 1 of next month.
        when extract(day from p_day) > 28
          then (date_trunc('month', p_day) + interval '1 month')::date
        -- Days 1-7, 8-14, 15-21, 22-28.
        else date_trunc('month', p_day)::date + ((extract(day from p_day)::integer - 1) / 7) * 7
      end as week_start,
      (p_day >= date '2026-10-30' and extract(day from p_day) > 28) as is_closed
  ) w;
$$;

revoke all on function public.preguntica_week_for_day(date) from public, anon;
grant execute on function public.preguntica_week_for_day(date) to authenticated;

-- 2. Status of the week (new last column is_closed, so the function is dropped and created again).
drop function if exists public.get_my_preguntica_week_status(timestamptz, text, text);
create or replace function public.get_my_preguntica_week_status(
  p_reference timestamptz default now(),
  p_target_lang text default null,
  p_native_lang text default null
)
returns table (
  week_id uuid,
  week_start date,
  week_end date,
  timezone text,
  required_activation_words integer,
  activation_words_count integer,
  is_unlocked boolean,
  unlocked_via text,
  unlocked_at timestamptz,
  completed_at timestamptz,
  attempts_used integer,
  token_unlocks_used integer,
  can_start boolean,
  is_closed boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  current_user_id uuid;
  tz text;
  today_local date;
  current_week_start date;
  current_week_end date;
  current_week_start_utc timestamptz;
  current_week_end_utc timestamptz;
  current_progress_count integer;
  progress_unlock boolean;
  v_week_id uuid;
  lang_target text;
  lang_native text;
  week_closed boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(tzn.name, 'UTC')
  into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = current_user_id;

  select
    lower(trim(coalesce(p_target_lang, us.target_lang, ''))),
    lower(trim(coalesce(p_native_lang, us.native_lang, '')))
  into lang_target, lang_native
  from public.user_settings us
  where us.user_id = current_user_id;

  if coalesce(lang_target, '') = '' or coalesce(lang_native, '') = '' then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;

  tz := coalesce(tz, 'UTC');
  today_local := (coalesce(p_reference, now()) at time zone tz)::date;
  select w.week_start, w.week_end, w.is_closed
  into current_week_start, current_week_end, week_closed
  from public.preguntica_week_for_day(today_local) w;

  -- Days 29-31: no PreguntICA (the month's ranking has closed). Nothing is created; the row
  -- says when the next one opens (week 1 of next month).
  if week_closed then
    return query
    select
      null::uuid,
      current_week_start,
      current_week_end,
      tz,
      20,
      0,
      false,
      null::text,
      null::timestamptz,
      null::timestamptz,
      0,
      0,
      false,
      true;
    return;
  end if;

  current_week_start_utc := current_week_start::timestamp at time zone tz;
  current_week_end_utc := current_week_end::timestamp at time zone tz;

  select count(distinct pla.lexicard_id)::integer
  into current_progress_count
  from public.phrase_lexicard_activations pla
  where pla.user_id = current_user_id
    and lower(trim(pla.target_lang)) = lang_target
    and lower(trim(pla.native_lang)) = lang_native
    and pla.created_at >= current_week_start_utc
    and pla.created_at < current_week_end_utc;

  current_progress_count := coalesce(current_progress_count, 0);
  progress_unlock := current_progress_count >= 20;

  insert into public.preguntica_weeks (
    user_id,
    week_start,
    week_end,
    timezone,
    target_lang,
    native_lang,
    required_activation_words,
    activation_words_count,
    is_unlocked,
    unlocked_via,
    unlocked_at
  )
  values (
    current_user_id,
    current_week_start,
    current_week_end,
    tz,
    lang_target,
    lang_native,
    20,
    current_progress_count,
    progress_unlock,
    case when progress_unlock then 'progress' else null end,
    case when progress_unlock then now() else null end
  )
  on conflict (user_id, week_start, target_lang, native_lang)
  do update
  set
    week_end = excluded.week_end,
    timezone = excluded.timezone,
    required_activation_words = excluded.required_activation_words,
    activation_words_count = excluded.activation_words_count,
    is_unlocked = case
      when public.preguntica_weeks.completed_at is not null then true
      when public.preguntica_weeks.unlocked_via in ('tokens', 'manual') then true
      else excluded.is_unlocked
    end,
    unlocked_via = case
      when public.preguntica_weeks.completed_at is not null then public.preguntica_weeks.unlocked_via
      when public.preguntica_weeks.unlocked_via in ('tokens', 'manual') then public.preguntica_weeks.unlocked_via
      when excluded.is_unlocked then excluded.unlocked_via
      else null
    end,
    unlocked_at = case
      when public.preguntica_weeks.completed_at is not null then public.preguntica_weeks.unlocked_at
      when public.preguntica_weeks.unlocked_via in ('tokens', 'manual')
        and public.preguntica_weeks.unlocked_at is not null then public.preguntica_weeks.unlocked_at
      when excluded.is_unlocked then coalesce(public.preguntica_weeks.unlocked_at, now())
      else null
    end,
    updated_at = now()
  returning id into v_week_id;

  return query
  with usage_stats as (
    select
      (
        select count(*)::integer
        from public.preguntica_attempts pa
        where pa.preguntica_week_id = v_week_id
          and pa.user_id = current_user_id
          and pa.attempt_kind = 'weekly'
      ) as attempts_used,
      (
        select count(*)::integer
        from public.preguntica_week_token_unlocks pwtu
        where pwtu.preguntica_week_id = v_week_id
          and pwtu.user_id = current_user_id
      ) as token_unlocks_used,
      (
        select count(*)::integer
        from public.preguntica_attempts pa
        where pa.preguntica_week_id = v_week_id
          and pa.user_id = current_user_id
          and pa.attempt_kind = 'token_unlock'
      ) as token_attempts_used
  )
  select
    pw.id,
    pw.week_start,
    pw.week_end,
    pw.timezone,
    pw.required_activation_words,
    pw.activation_words_count,
    pw.is_unlocked,
    pw.unlocked_via,
    pw.unlocked_at,
    pw.completed_at,
    us.attempts_used,
    us.token_unlocks_used,
    (
      -- PreguntICA de la semana (gratis): semana desbloqueada y aún sin responder.
      (pw.is_unlocked and pw.completed_at is null and us.attempts_used < 3)
      -- PreguntICA pagada con ICA Coins: vale con la semana ya respondida o todavía bloqueada.
      or (
        us.token_unlocks_used > us.token_attempts_used
        and (pw.completed_at is not null or not pw.is_unlocked)
      )
    ),
    false
  from public.preguntica_weeks pw
  cross join usage_stats us
  where pw.id = v_week_id;
end;
$$;

revoke all on function public.get_my_preguntica_week_status(timestamptz, text, text) from public;
grant execute on function public.get_my_preguntica_week_status(timestamptz, text, text) to authenticated;

-- 3. Start an attempt: closed on days 29-31.
create or replace function public.create_preguntica_attempt(
  p_word_mode text,
  p_reference timestamptz default now(),
  p_target_lang text default null,
  p_native_lang text default null
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  status_row record;
  mode_normalized text;
  new_attempt public.preguntica_attempts;
  token_attempts_used integer;
  token_unlocks_available integer;
  lang_target text;
  lang_native text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  mode_normalized := lower(trim(coalesce(p_word_mode, 'mixed')));
  if mode_normalized = '' then
    mode_normalized := 'mixed';
  end if;

  lang_target := lower(trim(coalesce(p_target_lang, '')));
  lang_native := lower(trim(coalesce(p_native_lang, '')));

  select *
  into status_row
  from public.get_my_preguntica_week_status(
    p_reference,
    nullif(lang_target, ''),
    nullif(lang_native, '')
  );

  -- Days 29-31: closed until day 1 (Luis, 9 Oct).
  if coalesce(status_row.is_closed, false) or status_row.week_id is null then
    raise exception 'PREGUNTICA_CLOSED';
  end if;

  select pw.target_lang, pw.native_lang
  into lang_target, lang_native
  from public.preguntica_weeks pw
  where pw.id = status_row.week_id;

  -- PreguntICA de la semana (gratis): semana desbloqueada y aún sin responder.
  if coalesce(status_row.is_unlocked, false) and status_row.completed_at is null then
    if coalesce(status_row.attempts_used, 0) >= 3 then
      raise exception 'WEEK_ATTEMPT_LIMIT_REACHED';
    end if;

    insert into public.preguntica_attempts (
      user_id,
      preguntica_week_id,
      attempt_number,
      attempt_kind,
      word_mode,
      target_lang,
      native_lang,
      status
    )
    values (
      current_user_id,
      status_row.week_id,
      status_row.attempts_used + 1,
      'weekly',
      mode_normalized,
      lang_target,
      lang_native,
      'pending_response'
    )
    returning *
    into new_attempt;

    return new_attempt;
  end if;

  select count(*)::integer
  into token_unlocks_available
  from public.preguntica_week_token_unlocks pwtu
  where pwtu.user_id = current_user_id
    and pwtu.preguntica_week_id = status_row.week_id;

  select count(*)::integer
  into token_attempts_used
  from public.preguntica_attempts pa
  where pa.user_id = current_user_id
    and pa.preguntica_week_id = status_row.week_id
    and pa.attempt_kind = 'token_unlock';

  -- PreguntICA pagada con ICA Coins: vale con la semana ya respondida o todavía bloqueada
  -- (el alumno puede comprarla aunque no haya activado las palabras de la semana).
  if token_unlocks_available <= token_attempts_used then
    if coalesce(status_row.is_unlocked, false) is false then
      raise exception 'WEEK_LOCKED_NOT_ENOUGH_ACTIVATIONS';
    end if;
    raise exception 'TOKEN_UNLOCK_REQUIRED';
  end if;

  insert into public.preguntica_attempts (
    user_id,
    preguntica_week_id,
    attempt_number,
    attempt_kind,
    word_mode,
    target_lang,
    native_lang,
    status
  )
  values (
    current_user_id,
    status_row.week_id,
    token_attempts_used + 1,
    'token_unlock',
    mode_normalized,
    lang_target,
    lang_native,
    'pending_response'
  )
  returning *
  into new_attempt;

  return new_attempt;
end;
$$;

revoke all on function public.create_preguntica_attempt(text, timestamptz, text, text) from public;
grant execute on function public.create_preguntica_attempt(text, timestamptz, text, text) to authenticated;

-- 4. Buy an extra PreguntICA: only this week's, never on days 29-31.
create or replace function public.redeem_preguntica_tokens_for_week(
  p_week_start date,
  p_target_lang text,
  p_native_lang text,
  p_tokens_to_spend numeric default 50
)
returns table (
  unlock_id uuid,
  week_id uuid,
  spent_tokens numeric(10,2),
  balance_after numeric(10,2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  target_week_id uuid;
  spent numeric(10,2);
  current_balance numeric(10,2);
  ledger_id uuid;
  new_unlock_id uuid;
  lang_target text;
  lang_native text;
  tz text;
  today_week record;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_week_start is null then
    raise exception 'WEEK_START_REQUIRED';
  end if;

  lang_target := lower(trim(coalesce(p_target_lang, '')));
  lang_native := lower(trim(coalesce(p_native_lang, '')));
  if lang_target = '' or lang_native = '' then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;

  -- Una PreguntICA extra cuesta 50 ICA Coins.
  spent := round(coalesce(p_tokens_to_spend, 50)::numeric, 2);
  if spent <> 50 then
    raise exception 'REDEEM_COST_MUST_BE_50_TOKENS';
  end if;

  -- Only this week's PreguntICA can be bought, and none on days 29-31 (Luis, 9 Oct).
  select coalesce(tzn.name, 'UTC')
  into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = current_user_id;

  select w.week_start, w.is_closed
  into today_week
  from public.preguntica_week_for_day((now() at time zone coalesce(tz, 'UTC'))::date) w;

  if today_week.is_closed then
    raise exception 'PREGUNTICA_CLOSED';
  end if;

  if today_week.week_start <> p_week_start then
    raise exception 'WEEK_NOT_CURRENT';
  end if;

  select pw.id
  into target_week_id
  from public.preguntica_weeks pw
  where pw.user_id = current_user_id
    and pw.week_start = p_week_start
    and pw.target_lang = lang_target
    and pw.native_lang = lang_native
  for update;

  if target_week_id is null then
    raise exception 'WEEK_NOT_FOUND';
  end if;

  -- Ya no hace falta haber activado las 20 palabras de la semana para comprar el intento extra.

  perform pg_advisory_xact_lock(hashtext(current_user_id::text || ':preguntica_tokens'));

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  if current_balance < spent then
    raise exception 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.preguntica_token_ledger (
    user_id,
    entry_type,
    tokens_delta,
    reference_type,
    reference_id,
    metadata
  )
  values (
    current_user_id,
    'redeem_unlock',
    -spent,
    'preguntica_week',
    target_week_id,
    jsonb_build_object('week_start', p_week_start, 'target_lang', lang_target, 'native_lang', lang_native)
  )
  returning id
  into ledger_id;

  insert into public.preguntica_week_token_unlocks (
    user_id,
    preguntica_week_id,
    tokens_spent,
    ledger_entry_id
  )
  values (
    current_user_id,
    target_week_id,
    spent,
    ledger_id
  )
  returning id
  into new_unlock_id;

  select coalesce(round(sum(ptl.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  return query
  select
    new_unlock_id,
    target_week_id,
    spent,
    current_balance;
end;
$$;

revoke all on function public.redeem_preguntica_tokens_for_week(date, text, text, numeric) from public;
grant execute on function public.redeem_preguntica_tokens_for_week(date, text, text, numeric) to authenticated;

commit;
