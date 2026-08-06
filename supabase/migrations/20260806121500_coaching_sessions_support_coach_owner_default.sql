begin;

alter table public.coaching_sessions
  add column if not exists support_coach_user_id uuid references auth.users (id) on delete set null;

update public.coaching_sessions
set support_coach_user_id = '68890bd8-894d-422d-b865-08806acdb312'
where support_coach_user_id is null;

alter table public.coaching_sessions
  alter column support_coach_user_id set default '68890bd8-894d-422d-b865-08806acdb312'::uuid;

create index if not exists coaching_sessions_support_coach_scope_idx
  on public.coaching_sessions (support_coach_user_id, target_lang, level, status)
  where is_active = true;

commit;
