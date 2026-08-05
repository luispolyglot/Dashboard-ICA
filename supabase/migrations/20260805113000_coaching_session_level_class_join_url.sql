begin;

alter table public.coaching_sessions
  add column if not exists class_join_url text;

update public.coaching_sessions as sessions
set class_join_url = latest.class_join_url
from (
  select distinct on (session_id)
    session_id,
    nullif(btrim(class_join_url), '') as class_join_url
  from public.coaching_session_classes
  where nullif(btrim(class_join_url), '') is not null
  order by session_id, week_number desc, created_at desc
) as latest
where sessions.id = latest.session_id
  and coalesce(nullif(btrim(sessions.class_join_url), ''), '') = '';

alter table public.coaching_session_classes
  drop column if exists class_join_url;

commit;
