begin;

alter table public.daily_metrics
  add column if not exists voice_activations_count integer not null default 0,
  add column if not exists voice_requirement_met boolean not null default false;

create or replace function public.daily_metrics_compute_goal_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  voice_rule_start_day constant date := date '2026-05-25';
begin
  if tg_op = 'UPDATE' then
    new.correct_reviews := greatest(coalesce(old.correct_reviews, 0), coalesce(new.correct_reviews, 0));
  end if;

  new.review_goal_completed := coalesce(new.correct_reviews, 0) >= 10;

  new.voice_requirement_met :=
    case
      when new.day < voice_rule_start_day then true
      else coalesce(new.voice_activations_count, 0) > 0
    end;

  new.creation_goal_completed :=
    coalesce(new.words_added, 0) >= 5
    and coalesce(new.phrase_generated, false)
    and new.voice_requirement_met;

  return new;
end;
$$;

create or replace function public.daily_metrics_sync_from_voice_activations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  target_created_at timestamptz;
  tz text;
  local_day date;
  day_start_utc timestamptz;
  day_end_utc timestamptz;
  voice_count integer;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
    target_created_at := old.created_at;
  else
    target_user_id := new.user_id;
    target_created_at := new.created_at;
  end if;

  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = target_user_id),
    'UTC'
  );

  local_day := (target_created_at at time zone tz)::date;
  day_start_utc := (local_day::timestamp at time zone tz);
  day_end_utc := ((local_day + 1)::timestamp at time zone tz);

  select count(*)::integer
  into voice_count
  from public.phrase_voice_activations pva
  where pva.user_id = target_user_id
    and pva.created_at >= day_start_utc
    and pva.created_at < day_end_utc;

  insert into public.daily_metrics (user_id, day, voice_activations_count)
  values (target_user_id, local_day, voice_count)
  on conflict (user_id, day)
  do update
  set
    voice_activations_count = excluded.voice_activations_count,
    day = excluded.day;

  return null;
end;
$$;

with activation_counts as (
  select
    pva.user_id,
    (pva.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as day,
    count(*)::integer as voice_activations_count
  from public.phrase_voice_activations pva
  left join public.profiles p
    on p.id = pva.user_id
  group by
    pva.user_id,
    (pva.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
)
insert into public.daily_metrics (user_id, day, voice_activations_count)
select
  ac.user_id,
  ac.day,
  ac.voice_activations_count
from activation_counts ac
on conflict (user_id, day)
do update
set
  voice_activations_count = excluded.voice_activations_count,
  day = excluded.day;

update public.daily_metrics dm
set day = dm.day
where dm.day <= current_date;

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
left join public.goal_completions gc
  on gc.user_id = dm.user_id
 and gc.day = dm.day
 and gc.goal_type = 'creation_goal'
where gc.user_id is null;

update public.goal_completions gc
set
  completed = dm.creation_goal_completed,
  progress_value = dm.words_added,
  target_value = 5
from public.daily_metrics dm
where gc.user_id = dm.user_id
  and gc.day = dm.day
  and gc.goal_type = 'creation_goal'
  and (
    gc.completed is distinct from dm.creation_goal_completed
    or gc.progress_value is distinct from dm.words_added
    or gc.target_value is distinct from 5
  );

commit;
