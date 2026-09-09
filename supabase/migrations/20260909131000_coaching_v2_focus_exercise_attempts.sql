begin;

create table if not exists public.coaching_v2_focus_exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 10),
  focus_id uuid not null references public.coaching_v2_focuses (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  score_correct integer not null default 0 check (score_correct >= 0),
  score_total integer not null default 0 check (score_total >= 0),
  score_threshold integer not null default 0 check (score_threshold >= 0),
  passed boolean not null default false,
  block_scores jsonb not null default '[]'::jsonb,
  tag_scores jsonb not null default '[]'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists coaching_v2_focus_exercise_attempts_session_focus_idx
  on public.coaching_v2_focus_exercise_attempts (session_id, focus_id, submitted_at desc);

create index if not exists coaching_v2_focus_exercise_attempts_student_idx
  on public.coaching_v2_focus_exercise_attempts (student_user_id, submitted_at desc);

alter table public.coaching_v2_focus_exercise_attempts enable row level security;

drop policy if exists "coaching_v2_focus_exercise_attempts_select_own" on public.coaching_v2_focus_exercise_attempts;
create policy "coaching_v2_focus_exercise_attempts_select_own"
on public.coaching_v2_focus_exercise_attempts
for select
using (
  student_user_id = auth.uid()
  and exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_v2_focus_exercise_attempts.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_v2_focus_exercise_attempts_select_coach" on public.coaching_v2_focus_exercise_attempts;
create policy "coaching_v2_focus_exercise_attempts_select_coach"
on public.coaching_v2_focus_exercise_attempts
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_v2_focus_exercise_attempts.session_id
      and ac.is_active = true
      and (
        ac.role = 'super_admin'
        or (
          ac.role = 'coach_admin'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(ac.coach_scopes, '[]'::jsonb)) scope
            where lower(coalesce(scope ->> 'targetLang', scope ->> 'target_lang', '')) = lower(cs.target_lang)
              and (
                jsonb_typeof(scope -> 'levels') <> 'array'
                or jsonb_array_length(scope -> 'levels') = 0
                or exists (
                  select 1
                  from jsonb_array_elements_text(scope -> 'levels') lvl
                  where lower(lvl.value) = lower(cs.level)
                )
              )
          )
        )
      )
  )
);

commit;
