create table if not exists public.admins_coaching (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('coach_admin', 'super_admin')),
  coach_scopes jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users_coaching (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  coach_user_id uuid references auth.users (id) on delete set null,
  target_lang text not null,
  native_lang text,
  level text not null default 'A2',
  class_sessions jsonb not null default '[]'::jsonb,
  feedback_nm_url text,
  feedback_nm_notes text,
  weekly_objectives jsonb not null default '{}'::jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_lang)
);

create index if not exists users_coaching_coach_lang_idx
  on public.users_coaching (coach_user_id, target_lang, level)
  where is_active = true;

create index if not exists users_coaching_user_active_idx
  on public.users_coaching (user_id, is_active, updated_at desc);

drop trigger if exists admins_coaching_set_updated_at on public.admins_coaching;
create trigger admins_coaching_set_updated_at
before update on public.admins_coaching
for each row execute procedure public.set_updated_at();

drop trigger if exists users_coaching_set_updated_at on public.users_coaching;
create trigger users_coaching_set_updated_at
before update on public.users_coaching
for each row execute procedure public.set_updated_at();

alter table public.admins_coaching enable row level security;
alter table public.users_coaching enable row level security;

drop policy if exists "admins_coaching_select_own" on public.admins_coaching;
create policy "admins_coaching_select_own"
on public.admins_coaching
for select
using (auth.uid() = user_id);

drop policy if exists "users_coaching_select_own" on public.users_coaching;
create policy "users_coaching_select_own"
on public.users_coaching
for select
using (auth.uid() = user_id);

drop policy if exists "users_coaching_select_assigned_coach" on public.users_coaching;
create policy "users_coaching_select_assigned_coach"
on public.users_coaching
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
            where lower(coalesce(scope ->> 'targetLang', scope ->> 'target_lang', '')) = lower(public.users_coaching.target_lang)
              and (
                jsonb_typeof(scope -> 'levels') <> 'array'
                or jsonb_array_length(scope -> 'levels') = 0
                or exists (
                  select 1
                  from jsonb_array_elements_text(scope -> 'levels') lvl
                  where lower(lvl.value) = lower(public.users_coaching.level)
                )
              )
          )
        )
      )
  )
);
