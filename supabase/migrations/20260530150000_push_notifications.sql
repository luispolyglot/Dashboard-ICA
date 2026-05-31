begin;

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_subscriptions_endpoint_not_empty
    check (length(trim(endpoint)) > 0)
);

create index if not exists user_push_subscriptions_user_idx
  on public.user_push_subscriptions (user_id, is_active, updated_at desc);

create table if not exists public.calendar_push_delivery_log (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.user_push_subscriptions (id) on delete cascade,
  calendar_entry_id uuid not null references public.calendar_icademy (id) on delete cascade,
  class_key text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz not null default now(),
  unique (subscription_id, calendar_entry_id)
);

create index if not exists calendar_push_delivery_log_user_idx
  on public.calendar_push_delivery_log (user_id, sent_at desc);

drop trigger if exists user_push_subscriptions_set_updated_at on public.user_push_subscriptions;
create trigger user_push_subscriptions_set_updated_at
before update on public.user_push_subscriptions
for each row execute procedure public.set_updated_at();

create or replace function public.enforce_calendar_icademy_pref_limit()
returns trigger
language plpgsql
as $$
declare
  enabled_count integer;
begin
  if new.notifications_enabled is distinct from true then
    return new;
  end if;

  select count(*)
  into enabled_count
  from public.users_calendar_icademy uci
  where uci.user_id = new.user_id
    and uci.notifications_enabled = true
    and uci.class_key <> new.class_key;

  if enabled_count >= 2 then
    raise exception 'CALENDAR_REMINDERS_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

drop trigger if exists users_calendar_icademy_pref_limit on public.users_calendar_icademy;
create trigger users_calendar_icademy_pref_limit
before insert or update on public.users_calendar_icademy
for each row execute procedure public.enforce_calendar_icademy_pref_limit();

alter table public.user_push_subscriptions enable row level security;
alter table public.calendar_push_delivery_log enable row level security;

drop policy if exists "user_push_subscriptions_all_own" on public.user_push_subscriptions;
create policy "user_push_subscriptions_all_own"
on public.user_push_subscriptions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "calendar_push_delivery_log_select_own" on public.calendar_push_delivery_log;
create policy "calendar_push_delivery_log_select_own"
on public.calendar_push_delivery_log
for select
using (auth.uid() = user_id);

commit;
