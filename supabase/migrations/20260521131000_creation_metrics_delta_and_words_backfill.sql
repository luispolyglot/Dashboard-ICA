begin;

drop function if exists public.bump_daily_creation_metrics(date, integer, boolean, integer);

create or replace function public.bump_daily_creation_metrics(
  p_day date,
  p_words_added integer default 0,
  p_phrase_generated boolean default false,
  p_xp_delta integer default 0,
  p_words_added_delta integer default 0
)
returns table (
  words_added integer,
  phrase_generated boolean,
  xp_earned integer,
  creation_goal_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  safe_words_added integer;
  safe_words_delta integer;
  safe_xp_delta integer;
  phrase_flag boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_day is null then
    raise exception 'DAY_REQUIRED';
  end if;

  safe_words_added := greatest(coalesce(p_words_added, 0), 0);
  safe_words_delta := greatest(coalesce(p_words_added_delta, 0), 0);
  safe_xp_delta := greatest(coalesce(p_xp_delta, 0), 0);
  phrase_flag := coalesce(p_phrase_generated, false);

  return query
  insert into public.daily_metrics (user_id, day, words_added, phrase_generated, xp_earned)
  values (
    current_user_id,
    p_day,
    greatest(safe_words_added, safe_words_delta),
    phrase_flag,
    safe_xp_delta
  )
  on conflict (user_id, day)
  do update
  set
    words_added = greatest(
      public.daily_metrics.words_added + safe_words_delta,
      safe_words_added,
      public.daily_metrics.words_added
    ),
    phrase_generated = public.daily_metrics.phrase_generated or phrase_flag,
    xp_earned = public.daily_metrics.xp_earned + safe_xp_delta,
    day = excluded.day
  returning
    public.daily_metrics.words_added,
    public.daily_metrics.phrase_generated,
    public.daily_metrics.xp_earned,
    public.daily_metrics.creation_goal_completed;
end;
$$;

revoke all on function public.bump_daily_creation_metrics(date, integer, boolean, integer, integer) from public;
grant execute on function public.bump_daily_creation_metrics(date, integer, boolean, integer, integer) to authenticated;

with word_add_counts as (
  select
    xe.user_id,
    coalesce(
      nullif(xe.metadata ->> 'day', '')::date,
      (xe.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
    ) as day,
    count(*)::integer as words_added
  from public.xp_events xe
  left join public.profiles p
    on p.id = xe.user_id
  where xe.source = 'word_added'
  group by xe.user_id,
    coalesce(
      nullif(xe.metadata ->> 'day', '')::date,
      (xe.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
    )
), inserted as (
  insert into public.daily_metrics (user_id, day, words_added)
  select
    wc.user_id,
    wc.day,
    wc.words_added
  from word_add_counts wc
  left join public.daily_metrics dm
    on dm.user_id = wc.user_id
   and dm.day = wc.day
  where dm.user_id is null
    and wc.words_added > 0
  returning user_id, day
)
select count(*) from inserted;

with word_add_counts as (
  select
    xe.user_id,
    coalesce(
      nullif(xe.metadata ->> 'day', '')::date,
      (xe.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
    ) as day,
    count(*)::integer as words_added
  from public.xp_events xe
  left join public.profiles p
    on p.id = xe.user_id
  where xe.source = 'word_added'
  group by xe.user_id,
    coalesce(
      nullif(xe.metadata ->> 'day', '')::date,
      (xe.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date
    )
)
update public.daily_metrics dm
set words_added = wc.words_added
from word_add_counts wc
where dm.user_id = wc.user_id
  and dm.day = wc.day
  and dm.words_added < wc.words_added;

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
