begin;

create table if not exists public.coaching_session_week_activations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  activated_at timestamptz not null default now(),
  activated_by uuid references auth.users (id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaching_session_week_activations_end_after_start
    check (ended_at is null or ended_at >= activated_at),
  unique (session_id, week_number)
);

create index if not exists coaching_week_activations_session_week_idx
  on public.coaching_session_week_activations (session_id, week_number);

create index if not exists coaching_week_activations_session_activated_idx
  on public.coaching_session_week_activations (session_id, activated_at desc);

drop trigger if exists coaching_week_activations_set_updated_at on public.coaching_session_week_activations;
create trigger coaching_week_activations_set_updated_at
before update on public.coaching_session_week_activations
for each row execute procedure public.set_updated_at();

alter table public.coaching_session_week_activations enable row level security;

drop policy if exists "coaching_week_activations_select_own" on public.coaching_session_week_activations;
create policy "coaching_week_activations_select_own"
on public.coaching_session_week_activations
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_session_week_activations.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_week_activations_select_coach" on public.coaching_session_week_activations;
create policy "coaching_week_activations_select_coach"
on public.coaching_session_week_activations
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_session_week_activations.session_id
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

with base as (
  select
    cs.id as session_id,
    cs.status,
    cs.activated_at,
    cs.closed_at,
    cs.archived_at,
    cs.updated_at,
    cs.coach_user_id,
    coalesce(cl.completed_weeks, null) as closure_completed_weeks,
    least(
      12,
      greatest(
        0,
        case
          when cs.activated_at is null then 0
          when cs.status = 'draft' then 0
          when cs.status = 'completed' and cl.completed_weeks is not null then cl.completed_weeks
          when cs.status = 'completed' then
            floor(extract(epoch from (coalesce(cs.closed_at, now()) - cs.activated_at)) / (7 * 24 * 60 * 60))::int + 1
          when cs.status = 'cancelled' then
            floor(extract(epoch from (coalesce(cs.archived_at, cs.updated_at, now()) - cs.activated_at)) / (7 * 24 * 60 * 60))::int + 1
          when cs.status = 'active' then
            floor(extract(epoch from (now() - cs.activated_at)) / (7 * 24 * 60 * 60))::int + 1
          else 0
        end
      )
    ) as weeks_to_seed
  from public.coaching_sessions cs
  left join public.coaching_session_closures cl on cl.session_id = cs.id
), expanded as (
  select
    b.session_id,
    gs.week_number,
    (b.activated_at + ((gs.week_number - 1) * interval '7 days')) as week_activated_at,
    b.coach_user_id as activated_by
  from base b
  join lateral (
    select generate_series(1, b.weeks_to_seed) as week_number
  ) gs on true
  where b.activated_at is not null
)
insert into public.coaching_session_week_activations (
  session_id,
  week_number,
  activated_at,
  activated_by
)
select
  e.session_id,
  e.week_number,
  e.week_activated_at,
  e.activated_by
from expanded e
on conflict (session_id, week_number) do nothing;

commit;
