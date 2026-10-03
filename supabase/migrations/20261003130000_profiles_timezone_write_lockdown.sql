begin;

-- Route profile writes through the existing timezone RPC. Keep the only direct profile
-- fields required by the client upsert: id and display_name. This short migration avoids
-- installing triggers on the hot profiles table during the larger game migration.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, display_name), update (id, display_name)
  on public.profiles to authenticated;

commit;
