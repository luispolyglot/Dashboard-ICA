begin;

create table if not exists public.coaching_v2_period_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 10),
  report_text text,
  report_image_path text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, period_number)
);

create index if not exists coaching_v2_period_reports_session_period_idx
  on public.coaching_v2_period_reports (session_id, period_number);

drop trigger if exists coaching_v2_period_reports_set_updated_at on public.coaching_v2_period_reports;
create trigger coaching_v2_period_reports_set_updated_at
before update on public.coaching_v2_period_reports
for each row execute procedure public.set_updated_at();

alter table public.coaching_v2_period_reports enable row level security;

drop policy if exists "coaching_v2_period_reports_select_own" on public.coaching_v2_period_reports;
create policy "coaching_v2_period_reports_select_own"
on public.coaching_v2_period_reports
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_v2_period_reports.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_v2_period_reports_select_coach" on public.coaching_v2_period_reports;
create policy "coaching_v2_period_reports_select_coach"
on public.coaching_v2_period_reports
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_v2_period_reports.session_id
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
