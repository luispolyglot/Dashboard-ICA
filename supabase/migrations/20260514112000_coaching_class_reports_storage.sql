begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'coaching-class-reports',
  'coaching-class-reports',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "coaching_reports_select_admin" on storage.objects;
create policy "coaching_reports_select_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'coaching-class-reports'
  and exists (
    select 1
    from public.admins_coaching ac
    where ac.user_id = auth.uid()
      and ac.is_active = true
  )
);

drop policy if exists "coaching_reports_insert_admin" on storage.objects;
create policy "coaching_reports_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'coaching-class-reports'
  and exists (
    select 1
    from public.admins_coaching ac
    where ac.user_id = auth.uid()
      and ac.is_active = true
  )
);

drop policy if exists "coaching_reports_update_admin" on storage.objects;
create policy "coaching_reports_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'coaching-class-reports'
  and exists (
    select 1
    from public.admins_coaching ac
    where ac.user_id = auth.uid()
      and ac.is_active = true
  )
)
with check (
  bucket_id = 'coaching-class-reports'
  and exists (
    select 1
    from public.admins_coaching ac
    where ac.user_id = auth.uid()
      and ac.is_active = true
  )
);

drop policy if exists "coaching_reports_delete_admin" on storage.objects;
create policy "coaching_reports_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'coaching-class-reports'
  and exists (
    select 1
    from public.admins_coaching ac
    where ac.user_id = auth.uid()
      and ac.is_active = true
  )
);

commit;
