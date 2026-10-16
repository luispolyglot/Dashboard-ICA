-- PREGUNTICA: CUENTAN LAS PALABRAS ACTIVADAS CON TU VOZ, NO LAS FRASES CREADAS (Luis y Nahuel, 16 Oct 2026)
--
-- Hasta hoy, las 20 palabras de la semana que abren la PreguntICA salían de las frases CREADAS en
-- Creación (phrase_lexicard_activations.created_at), aunque nunca se grabaran. Al revés, una frase
-- creada otro día y grabada esta semana en Activación no contaba (Davinia, 16 Oct: grabó dos frases
-- antiguas, 10 palabras, y seguía en 10/20).
--
-- Ahora cuentan las palabras de las frases que se graban esta semana en Activación
-- (phrase_voice_activations, status 'uploaded'), en el idioma de la semana.
--
-- Cambio solo a favor: en la semana que está en marcha (la que empieza el viernes 16 Oct), cada
-- uno se queda con el número más alto de los dos recuentos. Así quien ya llegaba a 20 con el
-- recuento antiguo no pierde nada, y quien grabó frases antiguas (Davinia) sube. Desde la semana
-- siguiente, solo cuenta lo grabado.
--
-- Datos de producción (16 Oct): en la semana del 9 al 15 Oct los dos recuentos daban lo mismo
-- (74 personas con 20 o más en ambos); en la semana actual, 1 persona sube a 20 y nadie baja.
--
-- Solo cambia el recuento dentro de get_my_preguntica_week_status (es la única función que lo
-- calcula). Nada más de la función cambia; la semana se recalcula sola la próxima vez que se abre.

begin;

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

  -- Words of the phrases ACTIVATED this week: recorded with your voice in Activación (a row in
  -- phrase_voice_activations), not the phrases only created (Luis and Nahuel, 16 Oct). A phrase
  -- created on another day and recorded this week counts this week.
  select count(distinct pla.lexicard_id)::integer
  into current_progress_count
  from public.phrase_voice_activations pva
  join public.phrase_lexicard_activations pla
    on pla.phrase_generation_id = pva.phrase_generation_id
   and pla.user_id = pva.user_id
  where pva.user_id = current_user_id
    and pva.status = 'uploaded'
    and lower(trim(pla.target_lang)) = lang_target
    and lower(trim(pla.native_lang)) = lang_native
    and pva.created_at >= current_week_start_utc
    and pva.created_at < current_week_end_utc;

  current_progress_count := coalesce(current_progress_count, 0);

  -- Change-over, only in favour (Luis, 16 Oct): in the week running when this changed, whoever
  -- had more words with the old count (phrases created) keeps that number, so nobody loses a
  -- PreguntICA they already had. From the next week, only the new count.
  if current_week_start <= date '2026-10-16' then
    select greatest(
      current_progress_count,
      coalesce((
        select count(distinct pla.lexicard_id)::integer
        from public.phrase_lexicard_activations pla
        where pla.user_id = current_user_id
          and lower(trim(pla.target_lang)) = lang_target
          and lower(trim(pla.native_lang)) = lang_native
          and pla.created_at >= current_week_start_utc
          and pla.created_at < current_week_end_utc
      ), 0)
    )
    into current_progress_count;
  end if;
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

commit;
