begin;

create or replace function public.daily_metrics_auto_freeze_previous_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  today_local date;
  target_day date;
  month_start date;
  month_end date;
  used_count integer;
  has_previous_streak_anchor boolean;
begin
  if tg_op = 'UPDATE' and coalesce(old.creation_goal_completed, false) = coalesce(new.creation_goal_completed, false) then
    return new;
  end if;

  if not coalesce(new.creation_goal_completed, false) then
    return new;
  end if;

  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = new.user_id),
    'UTC'
  );

  today_local := (now() at time zone tz)::date;
  if new.day <> today_local then
    return new;
  end if;

  target_day := new.day - 1;
  month_start := date_trunc('month', today_local::timestamp)::date;
  month_end := (month_start + interval '1 month - 1 day')::date;

  if target_day < month_start or target_day > month_end then
    return new;
  end if;

  select exists (
    select 1
    from public.daily_metrics dm
    where dm.user_id = new.user_id
      and dm.day = target_day - 1
      and (dm.creation_goal_completed or dm.creation_streak_saved_at is not null)
  )
  into has_previous_streak_anchor;

  if not has_previous_streak_anchor then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':salvadica:' || month_start::text));

  select count(*)::integer
  into used_count
  from public.daily_metrics dm
  where dm.user_id = new.user_id
    and dm.day >= month_start
    and dm.day <= month_end
    and dm.creation_streak_saved_at is not null;

  if used_count >= 3 then
    return new;
  end if;

  insert into public.daily_metrics (user_id, day)
  values (new.user_id, target_day)
  on conflict (user_id, day)
  do nothing;

  update public.daily_metrics dm
  set
    creation_streak_saved_at = now(),
    day = dm.day
  where dm.user_id = new.user_id
    and dm.day = target_day
    and not dm.creation_goal_completed
    and dm.creation_streak_saved_at is null;

  return new;
end;
$$;

drop trigger if exists daily_metrics_auto_freeze_previous_day_trigger on public.daily_metrics;
create trigger daily_metrics_auto_freeze_previous_day_trigger
after insert or update of creation_goal_completed on public.daily_metrics
for each row execute procedure public.daily_metrics_auto_freeze_previous_day();

commit;
