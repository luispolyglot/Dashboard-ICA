begin;

alter table public.preguntica_weeks
  add column if not exists target_lang text,
  add column if not exists native_lang text;

update public.preguntica_weeks pw
set
  target_lang = coalesce(
    (
      select pa.target_lang
      from public.preguntica_attempts pa
      where pa.preguntica_week_id = pw.id
        and pa.target_lang is not null
        and pa.native_lang is not null
      order by pa.created_at desc
      limit 1
    ),
    us.target_lang,
    pw.target_lang,
    'unknown'
  ),
  native_lang = coalesce(
    (
      select pa.native_lang
      from public.preguntica_attempts pa
      where pa.preguntica_week_id = pw.id
        and pa.target_lang is not null
        and pa.native_lang is not null
      order by pa.created_at desc
      limit 1
    ),
    us.native_lang,
    pw.native_lang,
    'unknown'
  )
from public.user_settings us
where us.user_id = pw.user_id
  and (pw.target_lang is null or pw.native_lang is null);

update public.preguntica_weeks
set
  target_lang = lower(trim(coalesce(target_lang, 'unknown'))),
  native_lang = lower(trim(coalesce(native_lang, 'unknown')));

update public.preguntica_attempts pa
set
  target_lang = coalesce(pa.target_lang, pw.target_lang),
  native_lang = coalesce(pa.native_lang, pw.native_lang)
from public.preguntica_weeks pw
where pw.id = pa.preguntica_week_id
  and (pa.target_lang is null or pa.native_lang is null);

update public.preguntica_attempts
set
  target_lang = lower(trim(coalesce(target_lang, 'unknown'))),
  native_lang = lower(trim(coalesce(native_lang, 'unknown')));

alter table public.preguntica_weeks
  alter column target_lang set not null,
  alter column native_lang set not null;

alter table public.preguntica_attempts
  alter column target_lang set not null,
  alter column native_lang set not null;

alter table public.preguntica_weeks
  drop constraint if exists preguntica_weeks_user_id_week_start_key;

alter table public.preguntica_weeks
  add constraint preguntica_weeks_user_week_lang_key
  unique (user_id, week_start, target_lang, native_lang);

create index if not exists preguntica_weeks_user_lang_week_idx
  on public.preguntica_weeks (user_id, target_lang, native_lang, week_start desc);

alter table public.preguntica_attempts
  drop constraint if exists preguntica_attempts_response_char_count_check;

alter table public.preguntica_attempts
  add constraint preguntica_attempts_response_char_count_check
  check (response_char_count is null or response_char_count between 1 and 1200);

drop function if exists public.get_my_preguntica_week_status(timestamptz);
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
  can_start boolean
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
  current_week_start := today_local - ((extract(dow from today_local)::integer - 5 + 7) % 7);
  current_week_end := current_week_start + 7;

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
    pw.is_unlocked
      and (
        (pw.completed_at is null and us.attempts_used < 3)
        or (pw.completed_at is not null and us.token_unlocks_used > us.token_attempts_used)
      )
  from public.preguntica_weeks pw
  cross join usage_stats us
  where pw.id = v_week_id;
end;
$$;

revoke all on function public.get_my_preguntica_week_status(timestamptz, text, text) from public;
grant execute on function public.get_my_preguntica_week_status(timestamptz, text, text) to authenticated;

drop function if exists public.create_preguntica_attempt(text, timestamptz);
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

  select pw.target_lang, pw.native_lang
  into lang_target, lang_native
  from public.preguntica_weeks pw
  where pw.id = status_row.week_id;

  if coalesce(status_row.is_unlocked, false) is false then
    raise exception 'WEEK_LOCKED_NOT_ENOUGH_ACTIVATIONS';
  end if;

  if status_row.completed_at is null then
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

  if token_unlocks_available <= token_attempts_used then
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

create or replace function public.create_preguntica_attempt_with_prompt_data(
  p_word_mode text,
  p_question_text text,
  p_ica_words jsonb,
  p_target_lang text,
  p_native_lang text,
  p_level text,
  p_question_id uuid default null,
  p_reference timestamptz default now()
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  new_attempt public.preguntica_attempts;
  safe_words jsonb;
begin
  if p_question_text is null or btrim(p_question_text) = '' then
    raise exception 'QUESTION_TEXT_REQUIRED';
  end if;

  safe_words := coalesce(p_ica_words, '[]'::jsonb);
  if jsonb_typeof(safe_words) <> 'array' or jsonb_array_length(safe_words) = 0 then
    raise exception 'ICA_WORDS_REQUIRED';
  end if;

  new_attempt := public.create_preguntica_attempt(
    p_word_mode,
    p_reference,
    lower(trim(coalesce(p_target_lang, ''))),
    lower(trim(coalesce(p_native_lang, '')))
  );

  update public.preguntica_attempts pa
  set
    question_id = p_question_id,
    question_text = btrim(p_question_text),
    ica_words = safe_words,
    target_lang = lower(trim(coalesce(pa.target_lang, p_target_lang))),
    native_lang = lower(trim(coalesce(pa.native_lang, p_native_lang))),
    level = nullif(upper(btrim(coalesce(p_level, ''))), ''),
    updated_at = now()
  where pa.id = new_attempt.id
  returning *
  into new_attempt;

  return new_attempt;
end;
$$;

revoke all on function public.create_preguntica_attempt_with_prompt_data(text, text, jsonb, text, text, text, uuid, timestamptz) from public;
grant execute on function public.create_preguntica_attempt_with_prompt_data(text, text, jsonb, text, text, text, uuid, timestamptz) to authenticated;

drop function if exists public.redeem_preguntica_tokens_for_week(date, numeric);
create or replace function public.redeem_preguntica_tokens_for_week(
  p_week_start date,
  p_target_lang text,
  p_native_lang text,
  p_tokens_to_spend numeric default 1
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
  target_week_completed_at timestamptz;
  spent numeric(10,2);
  current_balance numeric(10,2);
  ledger_id uuid;
  new_unlock_id uuid;
  lang_target text;
  lang_native text;
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

  spent := round(coalesce(p_tokens_to_spend, 1)::numeric, 2);
  if spent <> 1 then
    raise exception 'REDEEM_COST_MUST_BE_1_TOKEN';
  end if;

  select pw.id, pw.completed_at
  into target_week_id, target_week_completed_at
  from public.preguntica_weeks pw
  where pw.user_id = current_user_id
    and pw.week_start = p_week_start
    and pw.target_lang = lang_target
    and pw.native_lang = lang_native
  for update;

  if target_week_id is null then
    raise exception 'WEEK_NOT_FOUND';
  end if;

  if target_week_completed_at is null then
    raise exception 'WEEK_MUST_BE_COMPLETED_BEFORE_REDEEM';
  end if;

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
