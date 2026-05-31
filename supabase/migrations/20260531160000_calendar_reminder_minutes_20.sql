begin;

alter table public.users_calendar_icademy
drop constraint if exists users_calendar_icademy_minutes_before_allowed;

alter table public.users_calendar_icademy
add constraint users_calendar_icademy_minutes_before_allowed
check (minutes_before in (10, 20, 30, 60, 120));

commit;
