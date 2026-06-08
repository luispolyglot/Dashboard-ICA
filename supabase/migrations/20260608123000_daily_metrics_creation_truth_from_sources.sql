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

create or replace function public.recompute_my_daily_creation_metrics(p_day date default null)
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
  current_user_id uuid;
  tz text;
  local_day date;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = current_user_id),
    'UTC'
  );

  local_day := coalesce(p_day, (now() at time zone tz)::date);

  return query
  select *
  from public.recompute_daily_creation_metrics_for_user_day(current_user_id, local_day);
end;
$$;

revoke all on function public.recompute_my_daily_creation_metrics(date) from public;
grant execute on function public.recompute_my_daily_creation_metrics(date) to authenticated;

create or replace function public.daily_metrics_sync_from_creation_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_tz text;
  new_tz text;
  old_day date;
  new_day date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_tz := coalesce(
      (select nullif(p.timezone, '') from public.profiles p where p.id = old.user_id),
      'UTC'
    );
    old_day := (old.created_at at time zone old_tz)::date;
  end if;

  if tg_op in ('UPDATE', 'INSERT') then
    new_tz := coalesce(
      (select nullif(p.timezone, '') from public.profiles p where p.id = new.user_id),
      'UTC'
    );
    new_day := (new.created_at at time zone new_tz)::date;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_daily_creation_metrics_for_user_day(old.user_id, old_day);
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_daily_creation_metrics_for_user_day(new.user_id, new_day);
    return null;
  end if;

  if old.user_id is distinct from new.user_id then
    perform public.recompute_daily_creation_metrics_for_user_day(old.user_id, old_day);
    perform public.recompute_daily_creation_metrics_for_user_day(new.user_id, new_day);
    return null;
  end if;

  if old_day is distinct from new_day then
    perform public.recompute_daily_creation_metrics_for_user_day(new.user_id, old_day);
    perform public.recompute_daily_creation_metrics_for_user_day(new.user_id, new_day);
    return null;
  end if;

  perform public.recompute_daily_creation_metrics_for_user_day(new.user_id, new_day);
  return null;
end;
$$;

drop trigger if exists daily_metrics_sync_from_voice_activations_trigger on public.phrase_voice_activations;

drop trigger if exists daily_metrics_sync_from_lexicards_trigger on public.lexicards;
create trigger daily_metrics_sync_from_lexicards_trigger
after insert or update of user_id, created_at or delete on public.lexicards
for each row
execute procedure public.daily_metrics_sync_from_creation_sources();

drop trigger if exists daily_metrics_sync_from_phrase_generations_trigger on public.phrase_generations;
create trigger daily_metrics_sync_from_phrase_generations_trigger
after insert or update of user_id, created_at, success or delete on public.phrase_generations
for each row
execute procedure public.daily_metrics_sync_from_creation_sources();

drop trigger if exists daily_metrics_sync_from_voice_activations_trigger on public.phrase_voice_activations;
create trigger daily_metrics_sync_from_voice_activations_trigger
after insert or update of user_id, created_at or delete on public.phrase_voice_activations
for each row
execute procedure public.daily_metrics_sync_from_creation_sources();

create or replace function public.set_my_timezone(p_timezone text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid;
  previous_timezone text;
  resolved_timezone text;
  old_today_local date;
  new_today_local date;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(nullif(p.timezone, ''), 'UTC')
  into previous_timezone
  from public.profiles p
  where p.id = current_user_id;

  select coalesce(tzn.name, 'UTC')
  into resolved_timezone
  from pg_timezone_names tzn
  where tzn.name = nullif(trim(p_timezone), '')
  limit 1;

  update public.profiles
  set timezone = resolved_timezone
  where id = current_user_id;

  old_today_local := (now() at time zone coalesce(previous_timezone, 'UTC'))::date;
  new_today_local := (now() at time zone resolved_timezone)::date;

  perform public.recompute_daily_creation_metrics_for_user_day(current_user_id, old_today_local);
  perform public.recompute_daily_creation_metrics_for_user_day(current_user_id, old_today_local - 1);
  perform public.recompute_daily_creation_metrics_for_user_day(current_user_id, new_today_local);
  perform public.recompute_daily_creation_metrics_for_user_day(current_user_id, new_today_local - 1);

  return resolved_timezone;
end;
$$;

with days_to_sync as (
  select distinct
    l.user_id,
    (l.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as day
  from public.lexicards l
  left join public.profiles p
    on p.id = l.user_id

  union

  select distinct
    pg.user_id,
    (pg.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as day
  from public.phrase_generations pg
  left join public.profiles p
    on p.id = pg.user_id
  where coalesce(pg.success, true)

  union

  select distinct
    pva.user_id,
    (pva.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as day
  from public.phrase_voice_activations pva
  left join public.profiles p
    on p.id = pva.user_id
)
select count(*)
from days_to_sync dts,
  lateral public.recompute_daily_creation_metrics_for_user_day(dts.user_id, dts.day);

commit;
