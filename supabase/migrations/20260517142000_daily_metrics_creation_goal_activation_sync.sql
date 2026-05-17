begin;

alter table public.daily_metrics
  drop column if exists reviews_done;

create or replace function public.daily_metrics_compute_goal_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  day_start_utc timestamptz;
  day_end_utc timestamptz;
  has_activation boolean;
begin
  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = new.user_id),
    'UTC'
  );

  day_start_utc := (new.day::timestamp at time zone tz);
  day_end_utc := ((new.day + 1)::timestamp at time zone tz);

  select exists (
    select 1
    from public.phrase_voice_activations pva
    where pva.user_id = new.user_id
      and pva.created_at >= day_start_utc
      and pva.created_at < day_end_utc
  )
  into has_activation;

  new.review_goal_completed := coalesce(new.correct_reviews, 0) >= 10;
  new.creation_goal_completed :=
    coalesce(new.words_added, 0) >= 5
    and coalesce(new.phrase_generated, false)
    and has_activation;

  return new;
end;
$$;

drop trigger if exists daily_metrics_compute_goal_flags_trigger on public.daily_metrics;
create trigger daily_metrics_compute_goal_flags_trigger
before insert or update on public.daily_metrics
for each row
execute procedure public.daily_metrics_compute_goal_flags();

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

  insert into public.daily_metrics (user_id, day)
  values (target_user_id, local_day)
  on conflict (user_id, day)
  do update set day = excluded.day;

  return null;
end;
$$;

drop trigger if exists daily_metrics_sync_from_voice_activations_trigger on public.phrase_voice_activations;
create trigger daily_metrics_sync_from_voice_activations_trigger
after insert or delete on public.phrase_voice_activations
for each row
execute procedure public.daily_metrics_sync_from_voice_activations();

insert into public.daily_metrics (user_id, day)
select distinct
  pva.user_id,
  (pva.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as local_day
from public.phrase_voice_activations pva
left join public.profiles p
  on p.id = pva.user_id
on conflict (user_id, day) do nothing;

with first_activation_day as (
  select
    pva.user_id,
    min((pva.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date) as first_day
  from public.phrase_voice_activations pva
  left join public.profiles p
    on p.id = pva.user_id
  group by pva.user_id
)
update public.daily_metrics dm
set day = dm.day
from first_activation_day fad
where dm.user_id = fad.user_id
  and dm.day >= fad.first_day;

commit;
