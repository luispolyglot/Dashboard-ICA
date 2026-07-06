begin;

create or replace function public.get_my_preguntica_week_status(
  p_reference timestamptz default now()
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
    and pla.created_at >= current_week_start_utc
    and pla.created_at < current_week_end_utc;

  current_progress_count := coalesce(current_progress_count, 0);
  progress_unlock := current_progress_count >= 20;

  insert into public.preguntica_weeks (
    user_id,
    week_start,
    week_end,
    timezone,
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
    20,
    current_progress_count,
    progress_unlock,
    case when progress_unlock then 'progress' else null end,
    case when progress_unlock then now() else null end
  )
  on conflict (user_id, week_start)
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

revoke all on function public.get_my_preguntica_week_status(timestamptz) from public;
grant execute on function public.get_my_preguntica_week_status(timestamptz) to authenticated;

commit;
