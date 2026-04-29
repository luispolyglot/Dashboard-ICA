begin;

alter table public.improvement_trackers
  drop constraint if exists improvement_trackers_month_range;

alter table public.improvement_trackers
  add constraint improvement_trackers_month_range
  check (
    tracker_month >= date '2025-09-01'
    and tracker_month <= date_trunc('month', now())::date
  ) not valid;

create or replace function public.validate_improvement_tracker_month()
returns trigger
language plpgsql
as $$
declare
  min_month constant date := date '2025-09-01';
  max_month date := date_trunc('month', now())::date;
begin
  if new.tracker_month is null then
    raise exception 'TRACKER_MONTH_REQUIRED';
  end if;

  if new.tracker_month <> date_trunc('month', new.tracker_month::timestamp)::date then
    raise exception 'TRACKER_MONTH_MUST_BE_MONTH_START';
  end if;

  if new.tracker_month < min_month then
    raise exception 'TRACKER_MONTH_TOO_OLD';
  end if;

  if new.tracker_month > max_month then
    raise exception 'TRACKER_MONTH_IN_FUTURE';
  end if;

  return new;
end;
$$;

commit;
