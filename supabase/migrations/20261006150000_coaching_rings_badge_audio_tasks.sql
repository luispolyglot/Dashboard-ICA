-- COACHING: WEEKLY RINGS, «COACHING» BADGE AND AUDIO TASKS (Luis, 6 Oct)
--
-- 1. Each week has 6 tasks (3 per class). Answering the 6 closes that week's ring. A week can
--    stay at 4/6 if the student does not answer the rest before the coach closes it.
-- 2. New badge family «coaching», counted on the student's best coaching:
--      Bronce 4 rings · Plata 5 · Oro 6 · Rubí 8 · Diamante 9 · Leyenda I 10 (all of them)
--      Leyenda II = 20 rings and Leyenda III = 30 rings, adding up all the student's coachings.
-- 3. The coach chooses which tasks are answered with an audio (task 3 of each class by default).
--    The student records it, the coach listens and answers with an audio, a text or both.
--    Audios live in the private bucket «coaching-task-audio» and only the coaching-center
--    function reads or writes them (signed links).

begin;

-- 1. Which tasks are answered with an audio -------------------------------------------------

alter table public.coaching_session_classes
  add column if not exists task_audio_1 boolean not null default false,
  add column if not exists task_audio_2 boolean not null default false,
  add column if not exists task_audio_3 boolean not null default false;

-- New classes: task 3 is an audio by default (the coach can switch it off).
alter table public.coaching_session_classes
  alter column task_audio_3 set default true;

-- Classes that already exist get the same default (Luis, 7 Oct: «tendría que estar activado
-- directamente»): task 3 becomes an audio in every week that is not closed yet, unless the student
-- already answered it in writing. Closed weeks stay as they were.
update public.coaching_session_classes c
set task_audio_3 = true
where coalesce(btrim(c.student_guideline_response_3), '') = ''
  and not exists (
    select 1
    from public.coaching_v2_period_activations a
    where a.session_id = c.session_id
      and a.period_number = c.week_number
      and a.ended_at is not null
  );

-- 2. Audio answers and the coach's feedback --------------------------------------------------

create table if not exists public.coaching_v2_task_audio (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.coaching_session_classes (id) on delete cascade,
  session_id uuid not null references public.coaching_sessions (id) on delete cascade,
  period_number integer not null check (period_number between 1 and 20),
  class_index integer not null check (class_index between 1 and 2),
  task_index integer not null check (task_index between 1 and 3),
  student_user_id uuid not null references auth.users (id) on delete cascade,
  student_audio_path text not null,
  student_audio_seconds numeric(6, 1),
  student_sent_at timestamptz not null default now(),
  feedback_text text,
  feedback_audio_path text,
  feedback_audio_seconds numeric(6, 1),
  feedback_by uuid references auth.users (id) on delete set null,
  feedback_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, task_index)
);

create index if not exists coaching_v2_task_audio_session_period_idx
  on public.coaching_v2_task_audio (session_id, period_number);

drop trigger if exists coaching_v2_task_audio_set_updated_at on public.coaching_v2_task_audio;
create trigger coaching_v2_task_audio_set_updated_at
before update on public.coaching_v2_task_audio
for each row execute procedure public.set_updated_at();

-- Server-only: the coaching-center function reads and writes it with the service role.
alter table public.coaching_v2_task_audio enable row level security;
revoke all on table public.coaching_v2_task_audio from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coaching-task-audio',
  'coaching-task-audio',
  false,
  15728640,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac']
)
on conflict (id) do nothing;
-- No storage.objects policies on purpose: uploads use signed upload links made by the function.

-- Coaches can switch off the push «X te ha mandado un audio».
alter table public.user_coaching_notification_preferences
  add column if not exists student_audio_enabled boolean not null default true;

-- 3. Rings ---------------------------------------------------------------------------------

-- Rings of every v2 coaching of a student: one per activated week with its 6 tasks answered
-- (text, or audio for audio tasks).
create or replace function public.coaching_rings_by_session(p_user_id uuid)
returns table (session_id uuid, rings integer)
language sql
stable
security definer
set search_path = public
as $$
  with task_counts as (
    select
      c.session_id,
      c.week_number,
      (
        (case when coalesce(btrim(c.student_guideline_response_1), '') <> ''
              or exists (select 1 from public.coaching_v2_task_audio ta where ta.class_id = c.id and ta.task_index = 1)
         then 1 else 0 end)
        + (case when coalesce(btrim(c.student_guideline_response_2), '') <> ''
              or exists (select 1 from public.coaching_v2_task_audio ta where ta.class_id = c.id and ta.task_index = 2)
         then 1 else 0 end)
        + (case when coalesce(btrim(c.student_guideline_response_3), '') <> ''
              or exists (select 1 from public.coaching_v2_task_audio ta where ta.class_id = c.id and ta.task_index = 3)
         then 1 else 0 end)
      ) as answered
    from public.coaching_sessions s
    join public.coaching_session_classes c on c.session_id = s.id
    join public.coaching_v2_period_activations a
      on a.session_id = s.id and a.period_number = c.week_number
    where s.user_id = p_user_id
      and s.program_version = 'v2'
      and c.class_index in (1, 2)
      and c.week_number between 1 and s.duration_periods
  ),
  weeks as (
    select tc.session_id, tc.week_number, sum(tc.answered) as answered
    from task_counts tc
    group by tc.session_id, tc.week_number
  )
  select w.session_id, (count(*) filter (where w.answered >= 6))::integer as rings
  from weeks w
  group by w.session_id;
$$;

revoke all on function public.coaching_rings_by_session(uuid) from public, anon, authenticated;

-- What the badge needs: rings of the best coaching and rings of all coachings together.
-- Any signed-in student may ask for anyone (badges are public in profiles and the ranking).
create or replace function public.get_coaching_ring_stats(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_best integer;
  v_total integer;
  v_has_coaching boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(max(r.rings), 0)::integer, coalesce(sum(r.rings), 0)::integer
  into v_best, v_total
  from public.coaching_rings_by_session(v_user_id) r;
  -- Anyone who has (or had) a coaching can earn the badge; for everyone else it is shown locked.
  select exists (
    select 1 from public.coaching_sessions s
    where s.user_id = v_user_id
      and s.program_version = 'v2'
      and s.status in ('active', 'completed', 'cancelled')
      and s.activated_at is not null
  ) into v_has_coaching;
  return jsonb_build_object(
    'bestRings', coalesce(v_best, 0),
    'totalRings', coalesce(v_total, 0),
    'hasCoaching', coalesce(v_has_coaching, false)
  );
end;
$$;

revoke all on function public.get_coaching_ring_stats(uuid) from public, anon;
grant execute on function public.get_coaching_ring_stats(uuid) to authenticated;

-- 4. «coaching» badges on the server ---------------------------------------------------------

alter table public.ica_featured_badges
  drop constraint if exists ica_featured_badges_badge_check;
alter table public.ica_featured_badges
  add constraint ica_featured_badges_badge_check
  check (badge ~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios|coaching):(bronce|plata|oro|rubi|diamante|leyenda1|leyenda2|leyenda3)$');

create or replace function public.ica_featured_badge_earned(p_user_id uuid, p_badge text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  category text;
  tier text;
  level integer;
  current_value numeric;
  first_count integer;
  second_count integer;
  third_count integer;
  best_efficacy numeric;
  perfect_months integer;
  best_rings integer;
  total_rings integer;
begin
  if p_badge is null
    or p_badge !~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios|coaching):(bronce|plata|oro|rubi|diamante|leyenda1|leyenda2|leyenda3)$' then
    return false;
  end if;
  category := split_part(p_badge, ':', 1);
  tier := split_part(p_badge, ':', 2);
  level := case tier
    when 'bronce' then 1 when 'plata' then 2 when 'oro' then 3 when 'rubi' then 4
    when 'diamante' then 5 when 'leyenda1' then 6 when 'leyenda2' then 7 else 8
  end;

  if category = 'rachaICA' then
    current_value := public.ica_best_streak(p_user_id, 'ica');
    return current_value >= (array[7, 30, 60, 120, 200, 365, 730, 1000])[level];
  elsif category = 'rachaFlash' then
    current_value := public.ica_best_streak(p_user_id, 'flashcards');
    return current_value >= (array[7, 30, 60, 120, 200, 365, 730, 1000])[level];
  elsif category = 'vocab' then
    select count(*)::numeric into current_value from public.lexicards l where l.user_id = p_user_id;
    return current_value >= (array[50, 100, 200, 500, 1000, 2000, 3000, 5000])[level];
  elsif category = 'desafios' then
    select count(*)::numeric into current_value from public.ica_challenges c where c.winner_user_id = p_user_id;
    return current_value >= (array[10, 20, 50, 100, 200, 365, 600, 1000])[level];
  elsif category = 'coaching' then
    select coalesce(max(r.rings), 0)::integer, coalesce(sum(r.rings), 0)::integer
    into best_rings, total_rings
    from public.coaching_rings_by_session(p_user_id) r;
    -- Leyenda II and III also need Leyenda I (one coaching with all 10 rings).
    if coalesce(best_rings, 0) < (array[4, 5, 6, 8, 9, 10, 10, 10])[level] then
      return false;
    end if;
    return level <= 6 or coalesce(total_rings, 0) >= (array[0, 0, 0, 0, 0, 0, 20, 30])[level];
  elsif category = 'ranking' then
    select count(*) filter (where ls.rank = 1)::integer,
           count(*) filter (where ls.rank = 2)::integer,
           count(*) filter (where ls.rank = 3)::integer
    into first_count, second_count, third_count
    from public.leaderboard_snapshots ls
    where ls.period = 'monthly'
      and ls.user_id = p_user_id
      and ls.period_end >= ls.period_start + 27;
    return case level
      when 1 then first_count + second_count + third_count >= 1
      when 2 then first_count + second_count >= 1
      else first_count >= (array[0, 0, 1, 2, 3, 5, 8, 12])[level]
    end;
  else
    -- Eficacia de cada mes cerrado (la misma cuenta que closedMonthEfficacy en la app).
    select max(e.efficacy), count(*) filter (where e.efficacy >= 100)::integer
    into best_efficacy, perfect_months
    from (
      select greatest(0, least(100, round(
        coalesce(nullif(ls.payload ->> 'total_points', '')::numeric, ls.score::numeric / 10)
        / (10 + 2.8 + 8 + 14 + case when nullif(ls.payload ->> 'ica_test_points', '') is not null then 1.2 else 0 end)
        * 100
      ))) as efficacy
      from public.leaderboard_snapshots ls
      where ls.period = 'monthly'
        and ls.user_id = p_user_id
        and ls.period_end >= ls.period_start + 27
    ) e;
    if level <= 4 then
      return coalesce(best_efficacy, 0) >= (array[60, 70, 90, 100])[level];
    end if;
    return coalesce(perfect_months, 0) >= (array[0, 0, 0, 0, 3, 6, 9, 12])[level];
  end if;
end;
$$;
revoke all on function public.ica_featured_badge_earned(uuid, text) from public, anon, authenticated;

create or replace function public.set_my_profile_badges(p_badges text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_badge text;
  v_clean text[] := array[]::text[];
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  if p_badges is null or cardinality(p_badges) = 0 then
    delete from public.ica_profile_badges where user_id = v_user_id;
    return array[]::text[];
  end if;

  if cardinality(p_badges) > 3 then raise exception 'PROFILE_BADGES_TOO_MANY'; end if;

  foreach v_badge in array p_badges loop
    if v_badge is null
      or v_badge !~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios|coaching):(bronce|plata|oro|rubi|diamante|leyenda1|leyenda2|leyenda3)$'
    then
      raise exception 'PROFILE_BADGE_INVALID';
    end if;
    if v_badge = any (v_clean) then raise exception 'PROFILE_BADGE_DUPLICATED'; end if;
    if not public.ica_featured_badge_earned(v_user_id, v_badge) then
      raise exception 'PROFILE_BADGE_NOT_EARNED';
    end if;
    v_clean := v_clean || v_badge;
  end loop;

  insert into public.ica_profile_badges (user_id, badges)
  values (v_user_id, v_clean)
  on conflict (user_id) do update set badges = excluded.badges, updated_at = now();
  return v_clean;
end;
$$;
revoke all on function public.set_my_profile_badges(text[]) from public, anon;
grant execute on function public.set_my_profile_badges(text[]) to authenticated;

commit;
