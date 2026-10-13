-- UNA SOLA CLASE DE FRANCÉS: fr_conv (Luis, 13 Oct 2026)
--
-- Since October there is only one French class, «Francés». The app had kept fr_basico as that
-- class and hidden fr_conv, but the October sessions are saved as fr_conv, so students saw no
-- French classes at all. Now fr_conv is the one shown (src/modules/constants/calendarIcademyCatalog.ts
-- and the Edge Functions' catalog) and fr_basico is retired.
-- Reminders: a student's fr_basico settings move to fr_conv (2 students on 13 Oct; the other 3
-- already had fr_conv). Any fr_basico left is switched off, so a retired class no longer takes
-- one of the 2 reminder places. Sessions and existing fr_conv settings are not touched.

begin;

-- Who had fr_basico, and whether its reminder was on.
create temporary table fr_basico_prefs on commit drop as
select id, notifications_enabled
  from public.users_calendar_icademy
 where class_key = 'fr_basico';

-- Off first: the 2-reminder limit (enforce_calendar_icademy_pref_limit) counts the other rows.
update public.users_calendar_icademy
   set notifications_enabled = false
 where class_key = 'fr_basico'
   and notifications_enabled;

-- Then the row becomes fr_conv with its reminder as it was, unless fr_conv is already there.
update public.users_calendar_icademy u
   set class_key = 'fr_conv',
       language_code = 'fr',
       notifications_enabled = p.notifications_enabled
  from fr_basico_prefs p
 where u.id = p.id
   and not exists (
     select 1 from public.users_calendar_icademy c
      where c.user_id = u.user_id and c.class_key = 'fr_conv'
   );

commit;
