create table if not exists public.coaching_session_weekly_objectives (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  words_target text,
  nm_target text,
  ica_streak_objective_pct text,
  flashcards_streak_objective_pct text,
  report_exercise_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, week_number)
);

create table if not exists public.coaching_session_classes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  week_number integer not null check (week_number between 1 and 12),
  title text not null default 'Clase semanal',
  loom_url text,
  report text,
  report_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_session_weekly_objectives_session_week_idx
  on public.coaching_session_weekly_objectives (session_id, week_number);

create index if not exists coaching_session_classes_session_week_idx
  on public.coaching_session_classes (session_id, week_number, created_at desc);

drop trigger if exists coaching_session_weekly_objectives_set_updated_at on public.coaching_session_weekly_objectives;
create trigger coaching_session_weekly_objectives_set_updated_at
before update on public.coaching_session_weekly_objectives
for each row execute procedure public.set_updated_at();

drop trigger if exists coaching_session_classes_set_updated_at on public.coaching_session_classes;
create trigger coaching_session_classes_set_updated_at
before update on public.coaching_session_classes
for each row execute procedure public.set_updated_at();

alter table public.coaching_session_weekly_objectives enable row level security;
alter table public.coaching_session_classes enable row level security;

drop policy if exists "coaching_session_weekly_objectives_select_own" on public.coaching_session_weekly_objectives;
create policy "coaching_session_weekly_objectives_select_own"
on public.coaching_session_weekly_objectives
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_session_weekly_objectives.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_session_classes_select_own" on public.coaching_session_classes;
create policy "coaching_session_classes_select_own"
on public.coaching_session_classes
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    where cs.id = public.coaching_session_classes.session_id
      and cs.user_id = auth.uid()
  )
);

drop policy if exists "coaching_session_weekly_objectives_select_coach" on public.coaching_session_weekly_objectives;
create policy "coaching_session_weekly_objectives_select_coach"
on public.coaching_session_weekly_objectives
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_session_weekly_objectives.session_id
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

drop policy if exists "coaching_session_classes_select_coach" on public.coaching_session_classes;
create policy "coaching_session_classes_select_coach"
on public.coaching_session_classes
for select
using (
  exists (
    select 1
    from public.coaching_sessions cs
    join public.admins_coaching ac on ac.user_id = auth.uid()
    where cs.id = public.coaching_session_classes.session_id
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

insert into public.coaching_session_weekly_objectives (
  session_id,
  week_number,
  words_target,
  nm_target,
  ica_streak_objective_pct,
  flashcards_streak_objective_pct,
  report_exercise_url
)
with source_rows as (
  select
    cs.id as session_id,
    case
      when kv.key ~ '^W[0-9]{1,2}$' then least(12, greatest(1, substring(kv.key from 2)::integer))
      when kv.key ~ '-S[0-9]$' then least(12, greatest(1, substring(kv.key from '.*-S([0-9])$')::integer))
      else null
    end as week_number,
    kv.value,
    case when kv.key ~ '^W[0-9]{1,2}$' then 2 else 1 end as key_priority
  from public.coaching_sessions cs
  cross join lateral jsonb_each(coalesce(cs.weekly_objectives, '{}'::jsonb)) kv(key, value)
  where jsonb_typeof(kv.value) = 'object'
    and (
      kv.key ~ '^W[0-9]{1,2}$'
      or kv.key ~ '-S[0-9]$'
    )
), ranked_rows as (
  select
    source_rows.session_id,
    source_rows.week_number,
    source_rows.value,
    row_number() over (
      partition by source_rows.session_id, source_rows.week_number
      order by source_rows.key_priority desc
    ) as row_rank
  from source_rows
  where source_rows.week_number is not null
)
select
  ranked_rows.session_id,
  ranked_rows.week_number,
  nullif(trim(ranked_rows.value ->> 'wordsTarget'), ''),
  nullif(trim(ranked_rows.value ->> 'nmTarget'), ''),
  nullif(trim(coalesce(ranked_rows.value ->> 'icaStreakObjectivePct', ranked_rows.value ->> 'icaStreakTargetPct')), ''),
  nullif(trim(coalesce(ranked_rows.value ->> 'flashcardsStreakObjectivePct', ranked_rows.value ->> 'flashcardsStreakAchievedPct', ranked_rows.value ->> 'icaStreakAchievedPct')), ''),
  nullif(trim(ranked_rows.value ->> 'reportExerciseUrl'), '')
from ranked_rows
where ranked_rows.row_rank = 1
on conflict (session_id, week_number) do update
set
  words_target = excluded.words_target,
  nm_target = excluded.nm_target,
  ica_streak_objective_pct = excluded.ica_streak_objective_pct,
  flashcards_streak_objective_pct = excluded.flashcards_streak_objective_pct,
  report_exercise_url = excluded.report_exercise_url,
  updated_at = now();

insert into public.coaching_session_classes (
  id,
  session_id,
  week_number,
  title,
  loom_url,
  report,
  report_image_path,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  cs.id,
  case
    when coalesce(item.value ->> 'key', item.value ->> 'weekKey', item.value ->> 'week_key', item.value ->> 'week') ~ '^W[0-9]{1,2}$'
      then least(12, greatest(1, substring(coalesce(item.value ->> 'key', item.value ->> 'weekKey', item.value ->> 'week_key', item.value ->> 'week') from 2)::integer))
    when coalesce(item.value ->> 'key', item.value ->> 'weekKey', item.value ->> 'week_key', item.value ->> 'week') ~ '-S[0-9]$'
      then least(12, greatest(1, substring(coalesce(item.value ->> 'key', item.value ->> 'weekKey', item.value ->> 'week_key', item.value ->> 'week') from '.*-S([0-9])$')::integer))
    else 1
  end,
  coalesce(nullif(trim(item.value ->> 'title'), ''), 'Clase semanal'),
  nullif(trim(coalesce(item.value ->> 'loomUrl', item.value ->> 'loom_url')), ''),
  nullif(trim(item.value ->> 'report'), ''),
  nullif(trim(coalesce(item.value ->> 'reportImagePath', item.value ->> 'report_image_path')), ''),
  coalesce(nullif(item.value ->> 'createdAt', '')::timestamptz, nullif(item.value ->> 'created_at', '')::timestamptz, now()),
  coalesce(nullif(item.value ->> 'updatedAt', '')::timestamptz, nullif(item.value ->> 'updated_at', '')::timestamptz, now())
from public.coaching_sessions cs
cross join lateral jsonb_array_elements(coalesce(cs.class_sessions, '[]'::jsonb)) item(value)
where jsonb_typeof(item.value) = 'object'
;
