drop policy if exists "auth_whitelist_select_super_admin" on public.auth_whitelist;
create policy "auth_whitelist_select_super_admin"
on public.auth_whitelist
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
