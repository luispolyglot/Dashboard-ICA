create table if not exists public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  coach_user_id uuid references auth.users (id) on delete set null,
  target_lang text not null,
  native_lang text,
  level text not null default 'A2',
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  activated_at timestamptz,
  duration_weeks integer not null default 12 check (duration_weeks = 12),
  class_sessions jsonb not null default '[]'::jsonb,
  feedback_nm_url text,
  feedback_nm_notes text,
  weekly_objectives jsonb not null default '{}'::jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_sessions_user_active_idx
  on public.coaching_sessions (user_id, is_active, status, updated_at desc);

create index if not exists coaching_sessions_coach_scope_idx
  on public.coaching_sessions (coach_user_id, target_lang, level, status)
  where is_active = true;

create unique index if not exists coaching_sessions_unique_open_per_lang_idx
  on public.coaching_sessions (user_id, lower(target_lang))
  where is_active = true and status in ('draft', 'active');

drop trigger if exists coaching_sessions_set_updated_at on public.coaching_sessions;
create trigger coaching_sessions_set_updated_at
before update on public.coaching_sessions
for each row execute procedure public.set_updated_at();

alter table public.coaching_sessions enable row level security;

drop policy if exists "coaching_sessions_select_own" on public.coaching_sessions;
create policy "coaching_sessions_select_own"
on public.coaching_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "coaching_sessions_select_assigned_coach" on public.coaching_sessions;
create policy "coaching_sessions_select_assigned_coach"
on public.coaching_sessions
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
            where lower(coalesce(scope ->> 'targetLang', scope ->> 'target_lang', '')) = lower(public.coaching_sessions.target_lang)
              and (
                jsonb_typeof(scope -> 'levels') <> 'array'
                or jsonb_array_length(scope -> 'levels') = 0
                or exists (
                  select 1
                  from jsonb_array_elements_text(scope -> 'levels') lvl
                  where lower(lvl.value) = lower(public.coaching_sessions.level)
                )
              )
          )
        )
      )
  )
);

insert into public.coaching_sessions (
  user_id,
  coach_user_id,
  target_lang,
  native_lang,
  level,
  status,
  activated_at,
  duration_weeks,
  class_sessions,
  feedback_nm_url,
  feedback_nm_notes,
  weekly_objectives,
  notes,
  is_active,
  created_at,
  updated_at
)
select
  uc.user_id,
  uc.coach_user_id,
  uc.target_lang,
  uc.native_lang,
  uc.level,
  case when uc.is_active then 'active' else 'cancelled' end,
  case when uc.is_active then uc.created_at else null end,
  12,
  uc.class_sessions,
  uc.feedback_nm_url,
  uc.feedback_nm_notes,
  uc.weekly_objectives,
  uc.notes,
  uc.is_active,
  uc.created_at,
  uc.updated_at
from public.users_coaching uc;
