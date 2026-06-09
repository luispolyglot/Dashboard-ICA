begin;

create table if not exists public.icademy_teachers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icademy_teachers_display_name_not_empty
    check (length(trim(display_name)) > 0)
);

create index if not exists icademy_teachers_display_name_idx
  on public.icademy_teachers (display_name);

drop trigger if exists icademy_teachers_set_updated_at on public.icademy_teachers;
create trigger icademy_teachers_set_updated_at
before update on public.icademy_teachers
for each row execute procedure public.set_updated_at();

alter table public.icademy_teachers enable row level security;

drop policy if exists "icademy_teachers_read_authenticated" on public.icademy_teachers;
create policy "icademy_teachers_read_authenticated"
on public.icademy_teachers
for select
using (auth.role() = 'authenticated');

drop policy if exists "icademy_teachers_insert_super_admin" on public.icademy_teachers;
create policy "icademy_teachers_insert_super_admin"
on public.icademy_teachers
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

drop policy if exists "icademy_teachers_update_super_admin" on public.icademy_teachers;
create policy "icademy_teachers_update_super_admin"
on public.icademy_teachers
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

drop policy if exists "icademy_teachers_delete_super_admin" on public.icademy_teachers;
create policy "icademy_teachers_delete_super_admin"
on public.icademy_teachers
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

drop policy if exists "profiles_select_super_admin" on public.profiles;
create policy "profiles_select_super_admin"
on public.profiles
for select
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

alter table public.calendar_icademy
  add column if not exists teacher_id uuid references public.icademy_teachers (user_id) on delete restrict;

create index if not exists calendar_icademy_teacher_id_idx
  on public.calendar_icademy (teacher_id);

create or replace function public.set_calendar_icademy_teacher_from_teacher_id()
returns trigger
language plpgsql
as $$
declare
  teacher_name text;
begin
  if new.teacher_id is null then
    return new;
  end if;

  select t.display_name
  into teacher_name
  from public.icademy_teachers t
  where t.user_id = new.teacher_id;

  if teacher_name is null or length(trim(teacher_name)) = 0 then
    raise exception 'ICADEMY_TEACHER_NOT_FOUND';
  end if;

  new.teacher = trim(teacher_name);
  return new;
end;
$$;

drop trigger if exists calendar_icademy_set_teacher_name on public.calendar_icademy;
create trigger calendar_icademy_set_teacher_name
before insert or update of teacher_id on public.calendar_icademy
for each row execute procedure public.set_calendar_icademy_teacher_from_teacher_id();

insert into public.icademy_teachers (user_id, display_name, username)
select
  p.id,
  coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.username), ''),
    'Usuario'
  ) as display_name,
  nullif(trim(p.username), '') as username
from public.profiles p
where exists (
  select 1
  from public.calendar_icademy c
  where lower(trim(c.teacher)) = lower(
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(p.username), ''),
      ''
    )
  )
)
on conflict (user_id) do nothing;

with teacher_matches as (
  select
    c.id as calendar_id,
    t.user_id as teacher_user_id
  from public.calendar_icademy c
  join lateral (
    select it.user_id
    from public.icademy_teachers it
    where lower(trim(it.display_name)) = lower(trim(c.teacher))
    order by it.created_at asc
    limit 1
  ) t on true
  where c.teacher_id is null
)
update public.calendar_icademy c
set teacher_id = tm.teacher_user_id
from teacher_matches tm
where c.id = tm.calendar_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_icademy_teacher_id_required'
      and conrelid = 'public.calendar_icademy'::regclass
  ) then
    alter table public.calendar_icademy
      add constraint calendar_icademy_teacher_id_required
      check (teacher_id is not null) not valid;
  end if;
end
$$;

commit;
