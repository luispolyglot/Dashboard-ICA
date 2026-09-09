begin;

create table if not exists public.coaching_v2_focus_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 10),
  focus_id uuid not null references public.coaching_v2_focuses (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'error')),
  payload jsonb,
  error_message text,
  generated_at timestamptz,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (focus_id)
);

create index if not exists coaching_v2_focus_exercises_session_period_idx
  on public.coaching_v2_focus_exercises (session_id, period_number, updated_at desc);

drop trigger if exists coaching_v2_focus_exercises_set_updated_at on public.coaching_v2_focus_exercises;
create trigger coaching_v2_focus_exercises_set_updated_at
before update on public.coaching_v2_focus_exercises
for each row execute procedure public.set_updated_at();

alter table public.coaching_v2_focus_exercises enable row level security;

drop policy if exists "coaching_v2_focus_exercises_select_own" on public.coaching_v2_focus_exercises;
create policy "coaching_v2_focus_exercises_select_own"
on public.coaching_v2_focus_exercises
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_v2_focus_exercises.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_v2_focus_exercises_select_coach" on public.coaching_v2_focus_exercises;
create policy "coaching_v2_focus_exercises_select_coach"
on public.coaching_v2_focus_exercises
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_v2_focus_exercises.session_id
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
