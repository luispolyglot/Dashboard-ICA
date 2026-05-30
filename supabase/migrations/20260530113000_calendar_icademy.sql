begin;

create table if not exists public.calendar_icademy (
  id uuid primary key default gen_random_uuid(),
  class_key text not null,
  class_name text not null,
  language_code text not null,
  session_date date not null,
  session_time time not null,
  teacher text not null,
  group_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_icademy_class_key_not_empty
    check (length(trim(class_key)) > 0),
  constraint calendar_icademy_class_name_not_empty
    check (length(trim(class_name)) > 0),
  constraint calendar_icademy_language_code_not_empty
    check (length(trim(language_code)) > 0),
  constraint calendar_icademy_teacher_not_empty
    check (length(trim(teacher)) > 0)
);

create index if not exists calendar_icademy_date_time_idx
  on public.calendar_icademy (session_date asc, session_time asc);

create index if not exists calendar_icademy_class_key_idx
  on public.calendar_icademy (class_key);

create index if not exists calendar_icademy_language_code_idx
  on public.calendar_icademy (language_code);

drop trigger if exists calendar_icademy_set_updated_at on public.calendar_icademy;
create trigger calendar_icademy_set_updated_at
before update on public.calendar_icademy
for each row execute procedure public.set_updated_at();

alter table public.calendar_icademy enable row level security;

drop policy if exists "calendar_icademy_read_authenticated" on public.calendar_icademy;
create policy "calendar_icademy_read_authenticated"
on public.calendar_icademy
for select
using (auth.role() = 'authenticated');

drop policy if exists "calendar_icademy_insert_super_admin" on public.calendar_icademy;
create policy "calendar_icademy_insert_super_admin"
on public.calendar_icademy
for insert
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

drop policy if exists "calendar_icademy_update_super_admin" on public.calendar_icademy;
create policy "calendar_icademy_update_super_admin"
on public.calendar_icademy
for update
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
)
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

drop policy if exists "calendar_icademy_delete_super_admin" on public.calendar_icademy;
create policy "calendar_icademy_delete_super_admin"
on public.calendar_icademy
for delete
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

commit;
