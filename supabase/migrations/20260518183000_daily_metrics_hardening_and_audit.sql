begin;

drop policy if exists "daily_metrics_all_own" on public.daily_metrics;
drop policy if exists "daily_metrics_select_own" on public.daily_metrics;
drop policy if exists "daily_metrics_insert_own" on public.daily_metrics;
drop policy if exists "daily_metrics_update_own" on public.daily_metrics;

create policy "daily_metrics_select_own"
on public.daily_metrics
for select
using (auth.uid() = user_id);

create policy "daily_metrics_insert_own"
on public.daily_metrics
for insert
with check (auth.uid() = user_id);

create policy "daily_metrics_update_own"
on public.daily_metrics
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.daily_metrics_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  op text not null,
  user_id uuid,
  day date,
  old_row jsonb,
  new_row jsonb,
  db_user text not null default current_user,
  jwt_sub text default current_setting('request.jwt.claim.sub', true),
  app_name text default current_setting('application_name', true)
);

create index if not exists daily_metrics_audit_at_idx
  on public.daily_metrics_audit (at desc);

create index if not exists daily_metrics_audit_user_day_idx
  on public.daily_metrics_audit (user_id, day, at desc);

create or replace function public.audit_daily_metrics_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.daily_metrics_audit (op, user_id, day, old_row, new_row)
    values ('DELETE', old.user_id, old.day, to_jsonb(old), null);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.daily_metrics_audit (op, user_id, day, old_row, new_row)
    values ('UPDATE', new.user_id, new.day, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.daily_metrics_audit (op, user_id, day, old_row, new_row)
    values ('INSERT', new.user_id, new.day, null, to_jsonb(new));
    return new;
  end if;
end;
$$;

drop trigger if exists daily_metrics_audit_trigger on public.daily_metrics;
create trigger daily_metrics_audit_trigger
after insert or update or delete on public.daily_metrics
for each row execute procedure public.audit_daily_metrics_changes();

commit;
