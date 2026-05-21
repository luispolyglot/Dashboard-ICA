begin;

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
  today_local date;
begin
  if tg_op = 'UPDATE' then
    new.correct_reviews := greatest(coalesce(old.correct_reviews, 0), coalesce(new.correct_reviews, 0));
  end if;

  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = new.user_id),
    'UTC'
  );

  today_local := (now() at time zone tz)::date;
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
    and (new.day < today_local or has_activation);

  return new;
end;
$$;

with review_counts as (
  select
    lr.user_id,
    (lr.reviewed_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as day,
    count(*) filter (where lr.knew is true) as knew_true_reviews
  from public.lexicard_reviews lr
  left join public.profiles p
    on p.id = lr.user_id
  group by lr.user_id, (lr.reviewed_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
)
insert into public.daily_metrics (user_id, day, correct_reviews)
select
  rc.user_id,
  rc.day,
  rc.knew_true_reviews
from review_counts rc
left join public.daily_metrics dm
  on dm.user_id = rc.user_id
 and dm.day = rc.day
where dm.user_id is null
  and rc.knew_true_reviews > 0;

with review_counts as (
  select
    lr.user_id,
    (lr.reviewed_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as day,
    count(*) filter (where lr.knew is true) as knew_true_reviews
  from public.lexicard_reviews lr
  left join public.profiles p
    on p.id = lr.user_id
  group by lr.user_id, (lr.reviewed_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
)
update public.daily_metrics dm
set correct_reviews = rc.knew_true_reviews
from review_counts rc
where dm.user_id = rc.user_id
  and dm.day = rc.day
  and dm.correct_reviews < rc.knew_true_reviews;

commit;
