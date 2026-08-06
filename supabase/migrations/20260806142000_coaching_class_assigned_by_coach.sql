begin;

alter table public.coaching_session_classes
  add column if not exists assigned_by_coach_user_id uuid references auth.users (id) on delete set null;

update public.coaching_session_classes as classes
set assigned_by_coach_user_id = sessions.coach_user_id
from public.coaching_sessions as sessions
where sessions.id = classes.session_id
  and classes.assigned_by_coach_user_id is null;

create index if not exists coaching_session_classes_assigned_by_coach_idx
  on public.coaching_session_classes (assigned_by_coach_user_id, session_id, week_number);

commit;
