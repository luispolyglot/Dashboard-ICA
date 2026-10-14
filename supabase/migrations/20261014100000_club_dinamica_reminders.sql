-- CLUB DE DINÁMICA: AVISO 2 HORAS ANTES (Luis, 14 Oct 2026)
--
-- For each «Proponer día y hora» of the icademers chat, 2 hours before the proposed time:
--  - whoever tapped «Me apunto» gets «En 2 horas tienes el Club de DinámICA…»;
--  - if 2 or more are going, everyone else in that chat with its notifications on also gets
--    «En 2 horas se hará el Club de DinámICA…».
-- calendar-push-reminders (every 10 minutes) claims the due proposals with
-- claim_club_dinamica_reminders() and sends the pushes. Each proposal is reminded only once.
-- Only proposals made more than 2 hours before their time: a later one has just been notified.

begin;

alter table public.icademer_chat_messages
  add column if not exists club_reminder_sent_at timestamptz;

create or replace function public.claim_club_dinamica_reminders()
returns table (
  message_id uuid,
  target_lang text,
  starts_at timestamptz,
  going_user_ids uuid[],
  others_user_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select m.id
    from public.icademer_chat_messages m
    where m.kind = 'propuesta'
      and m.club_reminder_sent_at is null
      and m.day_value is not null
      and m.time_value is not null
      and m.day_value between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 2
      and ((m.day_value + m.time_value::time) at time zone coalesce(public.ica_valid_timezone(m.time_zone), 'UTC'))
        between now() + interval '10 minutes' and now() + interval '2 hours'
      and m.created_at < ((m.day_value + m.time_value::time) at time zone coalesce(public.ica_valid_timezone(m.time_zone), 'UTC'))
        - interval '2 hours'
    for update skip locked
  ),
  claimed as (
    update public.icademer_chat_messages m
       set club_reminder_sent_at = now()
      from due
     where m.id = due.id
    returning m.id, m.target_lang, m.day_value, m.time_value, m.time_zone
  )
  select
    c.id,
    c.target_lang,
    (c.day_value + c.time_value::time) at time zone coalesce(public.ica_valid_timezone(c.time_zone), 'UTC'),
    coalesce(
      (select array_agg(r.user_id order by r.created_at) from public.icademer_chat_rsvps r where r.message_id = c.id),
      '{}'::uuid[]
    ),
    case
      when (select count(*) from public.icademer_chat_rsvps r where r.message_id = c.id) >= 2 then coalesce(
        (
          select array_agg(cm.user_id)
          from public.icademer_chat_members cm
          where cm.target_lang = c.target_lang
            and cm.notifications_enabled is true
            and not exists (
              select 1 from public.icademer_chat_rsvps r where r.message_id = c.id and r.user_id = cm.user_id
            )
        ),
        '{}'::uuid[]
      )
      else '{}'::uuid[]
    end
  from claimed c;
end;
$$;

revoke all on function public.claim_club_dinamica_reminders() from public, anon, authenticated;
grant execute on function public.claim_club_dinamica_reminders() to service_role;

commit;
