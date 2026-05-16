alter table public.coaching_session_weekly_objectives
  add column if not exists exercise jsonb;

update public.coaching_session_weekly_objectives
set exercise = jsonb_build_object(
  'url', report_exercise_url,
  'status', 'pending',
  'completedAt', null
)
where exercise is null
  and report_exercise_url is not null
  and length(trim(report_exercise_url)) > 0;

alter table public.coaching_sessions
  add column if not exists archived_at timestamptz,
  add column if not exists closed_at timestamptz;

create table if not exists public.coaching_session_closures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.coaching_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  coach_user_id uuid references auth.users (id) on delete set null,
  target_lang text not null,
  level text not null,
  started_at timestamptz,
  closed_at timestamptz not null,
  completed_weeks integer not null check (completed_weeks between 0 and 12),
  total_weeks integer not null default 12 check (total_weeks = 12),
  closure_reason text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coaching_session_closures_user_idx
  on public.coaching_session_closures (user_id, created_at desc);

create index if not exists coaching_session_closures_lang_idx
  on public.coaching_session_closures (target_lang, level, created_at desc);

alter table public.coaching_session_closures enable row level security;

drop policy if exists "coaching_session_closures_select_own" on public.coaching_session_closures;
create policy "coaching_session_closures_select_own"
on public.coaching_session_closures
for select
using (auth.uid() = user_id);

drop policy if exists "coaching_session_closures_select_assigned_coach" on public.coaching_session_closures;
create policy "coaching_session_closures_select_assigned_coach"
on public.coaching_session_closures
for select
using (
  exists (
    select 1
    from public.admins_coaching ac
    where ac.user_id = auth.uid()
      and ac.is_active = true
      and (
        ac.role = 'super_admin'
        or (
          ac.role = 'coach_admin'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(ac.coach_scopes, '[]'::jsonb)) scope
            where lower(coalesce(scope ->> 'targetLang', scope ->> 'target_lang', '')) = lower(public.coaching_session_closures.target_lang)
              and (
                jsonb_typeof(scope -> 'levels') <> 'array'
                or jsonb_array_length(scope -> 'levels') = 0
                or exists (
                  select 1
                  from jsonb_array_elements_text(scope -> 'levels') lvl
                  where lower(lvl.value) = lower(public.coaching_session_closures.level)
                )
              )
          )
        )
      )
  )
);
