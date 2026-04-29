begin;

create table if not exists public.improvement_trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  tracker_month date not null,
  pronunciation_pct numeric(5, 2) not null,
  fluency_pct numeric(5, 2) not null,
  improvisation_pct numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint improvement_trackers_month_is_first_day
    check (tracker_month = date_trunc('month', tracker_month::timestamp)::date),
  constraint improvement_trackers_month_range
    check (
      tracker_month >= date '2024-06-01'
      and tracker_month <= date_trunc('month', now())::date
    ),
  constraint improvement_trackers_pronunciation_range
    check (pronunciation_pct >= 0 and pronunciation_pct <= 100),
  constraint improvement_trackers_fluency_range
    check (fluency_pct >= 0 and fluency_pct <= 100),
  constraint improvement_trackers_improvisation_range
    check (improvisation_pct >= 0 and improvisation_pct <= 100),
  constraint improvement_trackers_unique_month
    unique (user_id, target_lang, native_lang, tracker_month)
);

create index if not exists improvement_trackers_user_scope_idx
  on public.improvement_trackers (user_id, target_lang, native_lang, tracker_month desc);

create or replace function public.validate_improvement_tracker_month()
returns trigger
language plpgsql
as $$
declare
  min_month constant date := date '2024-06-01';
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

drop trigger if exists improvement_trackers_validate_month on public.improvement_trackers;
create trigger improvement_trackers_validate_month
before insert or update on public.improvement_trackers
for each row execute procedure public.validate_improvement_tracker_month();

drop trigger if exists improvement_trackers_set_updated_at on public.improvement_trackers;
create trigger improvement_trackers_set_updated_at
before update on public.improvement_trackers
for each row execute procedure public.set_updated_at();

alter table public.improvement_trackers enable row level security;

drop policy if exists "improvement_trackers_all_own" on public.improvement_trackers;
create policy "improvement_trackers_all_own" on public.improvement_trackers
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
