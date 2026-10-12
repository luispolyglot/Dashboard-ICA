-- AVISO CUANDO CAMBIA UNA CLASE DEL CALENDARIO (Luis, 9 Oct)
--
-- When an admin moves a class of the Calendario ICADEMY (another day or another time), everyone
-- who has the reminder of that class turned on gets a push with the new day and time. The
-- teacher of the class gets it too if they have their teacher reminders on.
--
-- - A trigger on calendar_icademy queues one row per person in calendar_change_push_outbox, only
--   when the date or time changes and the class has not happened yet. People who muted that one
--   session (users_calendar_icademy_session_blacklist) are left out.
-- - The scheduled function calendar-push-reminders (every 10 minutes) claims the queue with
--   claim_calendar_change_push_outbox and sends the pushes
--   (supabase/functions/_shared/calendar-change-notices.ts).
-- - The usual "your class starts in X min" reminder is reset for that session, so it comes again
--   at the new time even if it had already been sent for the old one.
-- Nothing changes for classes whose date and time stay the same.

begin;

create table if not exists public.calendar_change_push_outbox (
  id bigserial primary key,
  calendar_entry_id uuid not null references public.calendar_icademy (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher')),
  class_key text not null,
  class_name text not null,
  old_date date not null,
  old_time time not null,
  new_date date not null,
  new_time time not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists calendar_change_push_outbox_pending_idx
  on public.calendar_change_push_outbox (id)
  where claimed_at is null;

-- Server-only queue: RLS on and no policies.
alter table public.calendar_change_push_outbox enable row level security;
revoke all on table public.calendar_change_push_outbox from public, anon, authenticated;
revoke all on sequence public.calendar_change_push_outbox_id_seq from public, anon, authenticated;

create or replace function public.enqueue_calendar_class_change_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.session_date = new.session_date and old.session_time = new.session_time then
    return new;
  end if;

  -- Class times are saved in Madrid time. A class that already happened needs no notice.
  if ((new.session_date + new.session_time) at time zone 'Europe/Madrid') <= now() then
    return new;
  end if;

  -- The "starts in X min" reminder comes again at the new time.
  delete from public.calendar_push_delivery_log
  where calendar_entry_id = new.id;

  update public.users_calendar_icademy
  set last_notified_for_session_id = null
  where last_notified_for_session_id = new.id;

  update public.users_calendar_icademy_teacher_notifications
  set last_notified_for_session_id = null
  where last_notified_for_session_id = new.id;

  insert into public.calendar_change_push_outbox (
    calendar_entry_id, user_id, role, class_key, class_name,
    old_date, old_time, new_date, new_time
  )
  select
    new.id, people.user_id, people.role, new.class_key, new.class_name,
    old.session_date, old.session_time, new.session_date, new.session_time
  from (
    select distinct on (candidates.user_id) candidates.user_id, candidates.role
    from (
      -- The teacher first, so a teacher who also follows the class gets the teacher text.
      select t.user_id, 'teacher'::text as role, 0 as rank
      from public.users_calendar_icademy_teacher_notifications t
      where t.notifications_enabled = true
        and t.user_id = new.teacher_id
      union all
      select u.user_id, 'student'::text as role, 1 as rank
      from public.users_calendar_icademy u
      where u.notifications_enabled = true
        and u.class_key = new.class_key
    ) candidates
    where not exists (
      select 1
      from public.users_calendar_icademy_session_blacklist b
      where b.user_id = candidates.user_id
        and b.calendar_entry_id = new.id
    )
    order by candidates.user_id, candidates.rank
  ) people;

  return new;
end;
$$;

revoke all on function public.enqueue_calendar_class_change_push() from public, anon, authenticated;

drop trigger if exists calendar_icademy_enqueue_change_push on public.calendar_icademy;
create trigger calendar_icademy_enqueue_change_push
  after update of session_date, session_time on public.calendar_icademy
  for each row
  execute function public.enqueue_calendar_class_change_push();

create or replace function public.claim_calendar_change_push_outbox(p_limit integer default 300)
returns setof public.calendar_change_push_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.calendar_change_push_outbox
  where claimed_at is not null
    and claimed_at < now() - interval '7 days';

  -- A notice held back for more than 12 hours (quiet hours, no device) is no longer news.
  update public.calendar_change_push_outbox
  set claimed_at = now()
  where claimed_at is null
    and created_at < now() - interval '12 hours';

  return query
  update public.calendar_change_push_outbox o
  set claimed_at = now()
  where o.id in (
    select pending.id
    from public.calendar_change_push_outbox pending
    where pending.claimed_at is null
    order by pending.id
    limit greatest(1, least(coalesce(p_limit, 300), 1000))
    for update skip locked
  )
  returning o.*;
end;
$$;

revoke all on function public.claim_calendar_change_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_calendar_change_push_outbox(integer) to service_role;

-- Gives back notices held in someone's quiet hours, so the next run tries again.
create or replace function public.release_calendar_change_push_outbox(p_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.calendar_change_push_outbox
  set claimed_at = null
  where id = any(coalesce(p_ids, '{}'::bigint[]));
$$;

revoke all on function public.release_calendar_change_push_outbox(bigint[]) from public, anon, authenticated;
grant execute on function public.release_calendar_change_push_outbox(bigint[]) to service_role;

commit;
