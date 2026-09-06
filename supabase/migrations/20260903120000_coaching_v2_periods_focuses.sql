begin;

alter table public.coaching_sessions
  add column if not exists program_version text not null default 'v1'
    check (program_version in ('v1', 'v2')),
  add column if not exists duration_periods integer not null default 10
    check (duration_periods between 1 and 20);

update public.coaching_sessions
set duration_periods = 10
where duration_periods is null;

alter table public.coaching_session_classes
  add column if not exists class_index integer not null default 1
    check (class_index between 1 and 2),
  add column if not exists coach_guideline_1 text,
  add column if not exists coach_guideline_2 text,
  add column if not exists coach_guideline_3 text,
  add column if not exists student_completed_at timestamptz,
  add column if not exists student_report_text text,
  add column if not exists student_report_image_path text,
  add column if not exists student_guideline_response_1 text,
  add column if not exists student_guideline_response_2 text,
  add column if not exists student_guideline_response_3 text;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by session_id, week_number, class_index
      order by created_at desc, updated_at desc, id desc
    ) as row_rank
  from public.coaching_session_classes
)
delete from public.coaching_session_classes cls
using ranked
where cls.ctid = ranked.ctid
  and ranked.row_rank > 1;

create unique index if not exists coaching_session_classes_unique_slot_idx
  on public.coaching_session_classes (session_id, week_number, class_index);

create table if not exists public.coaching_v2_period_activations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 10),
  activated_at timestamptz not null default now(),
  activated_by uuid references auth.users (id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaching_v2_period_activations_end_after_start
    check (ended_at is null or ended_at >= activated_at),
  unique (session_id, period_number)
);

create index if not exists coaching_v2_period_activations_session_period_idx
  on public.coaching_v2_period_activations (session_id, period_number);

drop trigger if exists coaching_v2_period_activations_set_updated_at on public.coaching_v2_period_activations;
create trigger coaching_v2_period_activations_set_updated_at
before update on public.coaching_v2_period_activations
for each row execute procedure public.set_updated_at();

create table if not exists public.coaching_v2_focuses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 10),
  focus_title text not null,
  focus_comment text,
  phase_explained boolean not null default false,
  phase_trained boolean not null default false,
  phase_understood_explained boolean not null default false,
  phase_used boolean not null default false,
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_v2_focuses_session_period_idx
  on public.coaching_v2_focuses (session_id, period_number, created_at desc);

create index if not exists coaching_v2_focuses_active_idx
  on public.coaching_v2_focuses (session_id, period_number)
  where archived_at is null and completed_at is null;

drop trigger if exists coaching_v2_focuses_set_updated_at on public.coaching_v2_focuses;
create trigger coaching_v2_focuses_set_updated_at
before update on public.coaching_v2_focuses
for each row execute procedure public.set_updated_at();

create table if not exists public.coaching_v2_focus_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 10),
  snapshot jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, period_number)
);

create index if not exists coaching_v2_focus_snapshots_session_idx
  on public.coaching_v2_focus_snapshots (session_id, period_number desc);

alter table public.coaching_v2_period_activations enable row level security;
alter table public.coaching_v2_focuses enable row level security;
alter table public.coaching_v2_focus_snapshots enable row level security;

drop policy if exists "coaching_v2_period_activations_select_own" on public.coaching_v2_period_activations;
create policy "coaching_v2_period_activations_select_own"
on public.coaching_v2_period_activations
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_v2_period_activations.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_v2_focuses_select_own" on public.coaching_v2_focuses;
create policy "coaching_v2_focuses_select_own"
on public.coaching_v2_focuses
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_v2_focuses.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_v2_focus_snapshots_select_own" on public.coaching_v2_focus_snapshots;
create policy "coaching_v2_focus_snapshots_select_own"
on public.coaching_v2_focus_snapshots
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_v2_focus_snapshots.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_v2_period_activations_select_coach" on public.coaching_v2_period_activations;
create policy "coaching_v2_period_activations_select_coach"
on public.coaching_v2_period_activations
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_v2_period_activations.session_id
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

drop policy if exists "coaching_v2_focuses_select_coach" on public.coaching_v2_focuses;
create policy "coaching_v2_focuses_select_coach"
on public.coaching_v2_focuses
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_v2_focuses.session_id
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

drop policy if exists "coaching_v2_focus_snapshots_select_coach" on public.coaching_v2_focus_snapshots;
create policy "coaching_v2_focus_snapshots_select_coach"
on public.coaching_v2_focus_snapshots
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_v2_focus_snapshots.session_id
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
