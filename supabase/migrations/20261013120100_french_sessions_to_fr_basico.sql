-- UNA SOLA CLASE DE FRANCÉS: TODO A «FRANCÉS» (fr_basico) (Luis, 13 Oct 2026)
--
-- Since October there is only one French class, «Francés», which uses the fr_basico key; FR
-- conversacional (fr_conv) is hidden from students. But the October sessions had been loaded as
-- fr_conv, so students saw no French classes. This moves everything of fr_conv to fr_basico:
--   - the sessions (calendar_icademy), all named «Francés» (the old FR básico ones too);
--   - the reminders: whoever had fr_conv now has fr_basico, with the reminder as it was (if they
--     had both, it stays on if either was on); then fr_conv is removed;
--   - the pending class-change notices and the hidden sessions, so nothing points to fr_conv.
-- Already applied by hand in production on 13 Oct at Luis's request: running it again changes
-- nothing (everything is already fr_basico).

begin;

update public.calendar_icademy
   set class_key = 'fr_basico',
       class_name = 'Francés'
 where class_key in ('fr_conv', 'fr_basico')
   and (class_key <> 'fr_basico' or class_name <> 'Francés');

update public.users_calendar_icademy_session_blacklist
   set class_key = 'fr_basico'
 where class_key = 'fr_conv';

update public.calendar_change_push_outbox
   set class_key = 'fr_basico'
 where class_key = 'fr_conv';

-- Reminders. The limit of 2 reminders (enforce_calendar_icademy_pref_limit) looks at the other
-- rows, so fr_conv is switched off first and the reminder is set again afterwards.
create temporary table fr_conv_prefs on commit drop as
select id, user_id, notifications_enabled, minutes_before, quiet_hours_start, quiet_hours_end
  from public.users_calendar_icademy
 where class_key = 'fr_conv';

update public.users_calendar_icademy
   set notifications_enabled = false
 where class_key = 'fr_conv'
   and notifications_enabled;

-- Had both: fr_basico stays, with the reminder on if either was on.
update public.users_calendar_icademy b
   set notifications_enabled = true
  from fr_conv_prefs c
 where b.user_id = c.user_id
   and b.class_key = 'fr_basico'
   and c.notifications_enabled
   and not b.notifications_enabled;

delete from public.users_calendar_icademy u
 using fr_conv_prefs c
 where u.id = c.id
   and exists (
     select 1 from public.users_calendar_icademy b
      where b.user_id = c.user_id and b.class_key = 'fr_basico'
   );

-- Only fr_conv: it becomes fr_basico, with its reminder as it was.
update public.users_calendar_icademy u
   set class_key = 'fr_basico',
       language_code = 'fr',
       notifications_enabled = c.notifications_enabled
  from fr_conv_prefs c
 where u.id = c.id;

commit;
