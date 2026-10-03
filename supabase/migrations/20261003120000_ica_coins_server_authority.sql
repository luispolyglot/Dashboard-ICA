begin;

-- ICA Coins share the existing PreguntICA balance and ledger. Browser preview rows are
-- deliberately not imported: they are not authoritative and may have been edited.
alter table public.preguntica_token_ledger
  add column if not exists reference_day date,
  add column if not exists reference_key text;

alter table public.preguntica_token_ledger
  drop constraint if exists preguntica_token_ledger_entry_type_check;

alter table public.preguntica_token_ledger
  add constraint preguntica_token_ledger_entry_type_check
  check (entry_type in (
    'monthly_earn',
    'redeem_unlock',
    'manual_adjustment',
    'cycle_chest',
    'streak_milestone',
    'flash_milestone',
    'challenge_win',
    'phase_boost',
    'challenge_pass'
  ));

create unique index if not exists preguntica_ledger_cycle_chest_once_per_day
  on public.preguntica_token_ledger (user_id, entry_type, reference_day)
  where entry_type = 'cycle_chest';

create unique index if not exists preguntica_ledger_phase_boost_once_per_day
  on public.preguntica_token_ledger (user_id, entry_type, reference_day, reference_key)
  where entry_type = 'phase_boost';

create unique index if not exists preguntica_ledger_milestone_once
  on public.preguntica_token_ledger (user_id, entry_type, reference_key)
  where entry_type in ('streak_milestone', 'flash_milestone');

create unique index if not exists preguntica_ledger_challenge_win_once
  on public.preguntica_token_ledger (user_id, entry_type, reference_key)
  where entry_type = 'challenge_win';

alter table public.preguntica_token_ledger
  add constraint preguntica_ledger_ica_reference_required
  check (
    (entry_type not in ('cycle_chest', 'phase_boost', 'streak_milestone', 'flash_milestone', 'challenge_win', 'challenge_pass'))
    or reference_day is not null
    or entry_type in ('streak_milestone', 'flash_milestone', 'challenge_win', 'challenge_pass')
  ),
  add constraint preguntica_ledger_ica_reference_key_required
  check (
    (entry_type not in ('phase_boost', 'streak_milestone', 'flash_milestone', 'challenge_win', 'challenge_pass'))
    or nullif(reference_key, '') is not null
  ),
  add constraint preguntica_ledger_phase_reference_valid
  check (entry_type <> 'phase_boost' or reference_key in ('words', 'phrases', 'activations'));

create table if not exists public.ica_challenge_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ledger_entry_id uuid not null unique references public.preguntica_token_ledger (id) on delete restrict,
  used_challenge_id uuid unique references public.ica_challenges (id) on delete restrict,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint ica_challenge_pass_used_state_check
    check ((used_challenge_id is null) = (used_at is null))
);

create index if not exists ica_challenge_passes_unused_user_idx
  on public.ica_challenge_passes (user_id, created_at)
  where used_at is null;

alter table public.ica_challenge_passes enable row level security;
drop policy if exists ica_challenge_passes_select_own on public.ica_challenge_passes;
create policy ica_challenge_passes_select_own
  on public.ica_challenge_passes
  for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.ica_challenge_passes from anon, authenticated;
grant select on public.ica_challenge_passes to authenticated;

create table if not exists public.ica_challenge_reactions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.ica_challenges (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('face', 'phrase')),
  value text not null,
  created_at timestamptz not null default now(),
  constraint ica_challenge_reactions_value_check check (
    (kind = 'face' and value in ('feliz', 'risa', 'guino', 'sorpresa', 'gafas', 'lagrima'))
    or (kind = 'phrase' and value in ('bien-jugado', 'revancha', 'vamos', 'gracias'))
  )
);

create index if not exists ica_challenge_reactions_challenge_created_idx
  on public.ica_challenge_reactions (challenge_id, created_at, id);
alter table public.ica_challenge_reactions enable row level security;
drop policy if exists ica_challenge_reactions_select_players on public.ica_challenge_reactions;
create policy ica_challenge_reactions_select_players
  on public.ica_challenge_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.ica_challenges c
      where c.id = ica_challenge_reactions.challenge_id
        and c.status = 'completed'
        and (c.challenger_user_id = auth.uid() or c.challenged_user_id = auth.uid())
    )
  );
revoke all on public.ica_challenge_reactions from anon, authenticated;
grant select on public.ica_challenge_reactions to authenticated;

create or replace function public.send_ica_challenge_reaction(
  p_sender_user_id uuid,
  p_challenge_id uuid,
  p_kind text,
  p_value text
)
returns public.ica_challenge_reactions
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.ica_challenges%rowtype;
  reaction_row public.ica_challenge_reactions%rowtype;
  recent_senders uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_sender_user_id is null or p_challenge_id is null then raise exception 'REACTION_REQUEST_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-reaction:' || p_challenge_id::text, 0));
  select c.* into challenge_row from public.ica_challenges c where c.id = p_challenge_id for update;
  if not found then raise exception 'ICA_CHALLENGE_NOT_FOUND'; end if;
  if challenge_row.status <> 'completed' then raise exception 'REACTION_CHALLENGE_NOT_COMPLETED'; end if;
  if p_sender_user_id not in (challenge_row.challenger_user_id, challenge_row.challenged_user_id) then
    raise exception 'REACTION_NOT_PARTICIPANT';
  end if;
  if p_kind not in ('face', 'phrase') then raise exception 'REACTION_KIND_INVALID'; end if;
  if not (
    (p_kind = 'face' and p_value in ('feliz', 'risa', 'guino', 'sorpresa', 'gafas', 'lagrima'))
    or (p_kind = 'phrase' and p_value in ('bien-jugado', 'revancha', 'vamos', 'gracias'))
  ) then raise exception 'REACTION_VALUE_INVALID'; end if;

  select array_agg(recent.sender_user_id order by recent.created_at desc, recent.id desc)
  into recent_senders
  from (
    select r.sender_user_id, r.created_at, r.id
    from public.ica_challenge_reactions r
    where r.challenge_id = p_challenge_id
    order by r.created_at desc, r.id desc
    limit 2
  ) recent;
  if coalesce(array_length(recent_senders, 1), 0) = 2
    and recent_senders[1] = p_sender_user_id
    and recent_senders[2] = p_sender_user_id then
    raise exception 'REACTION_STREAK_LIMIT';
  end if;

  insert into public.ica_challenge_reactions (challenge_id, sender_user_id, kind, value, created_at)
  values (p_challenge_id, p_sender_user_id, p_kind, p_value, clock_timestamp())
  returning * into reaction_row;
  return reaction_row;
end;
$$;

revoke all on function public.send_ica_challenge_reaction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.send_ica_challenge_reaction(uuid, uuid, text, text) to service_role;

create table if not exists public.ica_daily_game_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('pairs', 'choice', 'write', 'listen', 'speak')),
  correct integer not null check (correct >= 0),
  total integer not null check (total between 1 and 10 and correct <= total),
  finished_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.ica_daily_game_results enable row level security;
drop policy if exists ica_daily_game_results_select_own on public.ica_daily_game_results;
create policy ica_daily_game_results_select_own
  on public.ica_daily_game_results for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.ica_daily_game_results from public, anon, authenticated;
grant select on public.ica_daily_game_results to authenticated;

create or replace function public.get_my_daily_game_result()
returns table (day date, kind text, correct integer, total integer, finished_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  local_day := public.ica_local_today(v_user_id);
  return query
  select r.day, r.kind, r.correct, r.total, r.finished_at
  from public.ica_daily_game_results r
  where r.user_id = v_user_id and r.day = local_day;
end;
$$;
revoke all on function public.get_my_daily_game_result() from public, anon;
grant execute on function public.get_my_daily_game_result() to authenticated;

create or replace function public.save_daily_game_result(p_kind text, p_correct integer, p_total integer)
returns public.ica_daily_game_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  result_row public.ica_daily_game_results%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('pairs', 'choice', 'write', 'listen', 'speak') then raise exception 'DAILY_GAME_KIND_INVALID'; end if;
  if p_total is null or p_correct is null or p_total <> 10 or p_correct < 0 or p_correct > p_total then
    raise exception 'DAILY_GAME_RESULT_INVALID';
  end if;
  local_day := public.ica_local_today(v_user_id);

  insert into public.ica_daily_game_results (user_id, day, kind, correct, total, finished_at)
  values (v_user_id, local_day, p_kind, p_correct, p_total, now())
  on conflict (user_id, day) do update
  set kind = excluded.kind, correct = excluded.correct, total = excluded.total, finished_at = excluded.finished_at
  where excluded.correct > public.ica_daily_game_results.correct;

  select r.* into result_row
  from public.ica_daily_game_results r
  where r.user_id = v_user_id and r.day = local_day;
  return result_row;
end;
$$;
revoke all on function public.save_daily_game_result(text, integer, integer) from public, anon;
grant execute on function public.save_daily_game_result(text, integer, integer) to authenticated;

-- Keep the pre-existing row trigger, but permit a fourth challenger slot only when the
-- transaction carries an unused pass owned by that challenger. The target remains capped at 3.
create or replace function public.enforce_ica_challenges_active_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  challenger_active_count integer;
  challenged_active_count integer;
  extra_pass_id uuid;
  pass_valid boolean := false;
begin
  if new.status not in ('created', 'in_progress') then return new; end if;
  if new.challenger_user_id = new.challenged_user_id then raise exception 'ICA_CHALLENGE_SELF_NOT_ALLOWED'; end if;

  select count(*)::integer into challenger_active_count
  from public.ica_challenges c
  where (c.challenger_user_id = new.challenger_user_id or c.challenged_user_id = new.challenger_user_id)
    and c.status in ('created', 'in_progress')
    and c.id <> coalesce(new.id, gen_random_uuid());

  if challenger_active_count >= 3 then
    begin
      extra_pass_id := nullif(new.game_metadata ->> 'ica_extra_slot_pass_id', '')::uuid;
    exception when invalid_text_representation then
      extra_pass_id := null;
    end;
    if extra_pass_id is not null then
      select exists (
        select 1 from public.ica_challenge_passes cp
        where cp.id = extra_pass_id
          and cp.user_id = new.challenger_user_id
          and (cp.used_challenge_id is null or cp.used_challenge_id = new.id)
      ) into pass_valid;
    end if;
    if challenger_active_count >= 4 or not pass_valid then
      raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED';
    end if;
  end if;

  select count(*)::integer into challenged_active_count
  from public.ica_challenges c
  where (c.challenger_user_id = new.challenged_user_id or c.challenged_user_id = new.challenged_user_id)
    and c.status in ('created', 'in_progress')
    and c.id <> coalesce(new.id, gen_random_uuid());
  if challenged_active_count >= 3 then
    raise exception 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

create or replace function public.ica_local_date(p_user_id uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (p_at at time zone coalesce(tzn.name, 'UTC'))::date
  from (select 1) seed
  left join public.profiles p on p.id = p_user_id
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
$$;

revoke all on function public.ica_local_date(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.ica_local_today(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.ica_local_date(p_user_id, now())
$$;

revoke all on function public.ica_local_today(uuid) from public, anon, authenticated;

create or replace function public.ica_current_streak(p_user_id uuid, p_kind text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  local_today date;
  cursor_day date;
  completed boolean;
  continuous boolean;
  streak integer := 0;
  day_row public.daily_metrics%rowtype;
begin
  if p_kind not in ('ica', 'flashcards') then
    raise exception 'INVALID_STREAK_KIND';
  end if;

  local_today := public.ica_local_today(p_user_id);
  if exists (
    select 1
    from public.daily_metrics dm
    where dm.user_id = p_user_id
      and dm.day in (local_today, local_today - 1)
      and case p_kind
        when 'ica' then dm.creation_goal_completed or dm.creation_streak_saved_at is not null
        else dm.review_goal_completed
      end
  ) then
    select max(dm.day)
    into cursor_day
    from public.daily_metrics dm
    where dm.user_id = p_user_id
      and dm.day in (local_today, local_today - 1)
      and case p_kind
        when 'ica' then dm.creation_goal_completed or dm.creation_streak_saved_at is not null
        else dm.review_goal_completed
      end;
  else
    return 0;
  end if;

  for step in 1..365 loop
    select *
    into day_row
    from public.daily_metrics dm
    where dm.user_id = p_user_id and dm.day = cursor_day;

    if not found then
      exit;
    end if;

    if p_kind = 'ica' then
      completed := coalesce(day_row.creation_goal_completed, false);
      continuous := completed or day_row.creation_streak_saved_at is not null;
    else
      completed := coalesce(day_row.review_goal_completed, false);
      continuous := completed;
    end if;

    if not continuous then
      exit;
    end if;
    if completed then
      streak := streak + 1;
    end if;
    cursor_day := cursor_day - 1;
  end loop;

  return streak;
end;
$$;

revoke all on function public.ica_current_streak(uuid, text) from public, anon, authenticated;

create table if not exists public.ica_daily_limit_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_day date not null,
  usage_kind text not null check (usage_kind in ('words', 'phrases', 'activations')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, usage_day, usage_kind, source_id)
);

create index if not exists ica_daily_limit_usage_user_day_kind_idx
  on public.ica_daily_limit_usage (user_id, usage_day, usage_kind);
create unique index if not exists ica_daily_limit_usage_source_once_idx
  on public.ica_daily_limit_usage (user_id, usage_kind, source_id);

alter table public.ica_daily_limit_usage enable row level security;
revoke all on public.ica_daily_limit_usage from public, anon, authenticated;

alter table public.phrase_generations
  add column if not exists is_regeneration boolean not null default false;

create or replace function public.ica_record_daily_limit_usage(
  p_user_id uuid,
  p_kind text,
  p_source_id uuid,
  p_is_regeneration boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_day date;
  base_limit integer;
  active_limit integer;
  used_count integer;
  has_boost boolean;
begin
  if p_user_id is null or p_source_id is null then raise exception 'DAILY_LIMIT_USAGE_INVALID'; end if;
  if p_kind not in ('words', 'phrases', 'activations') then raise exception 'DAILY_LIMIT_KIND_INVALID'; end if;
  if p_kind = 'phrases' and coalesce(p_is_regeneration, false) then return; end if;

  local_day := public.ica_local_today(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ica-daily-limit:' || p_user_id::text || ':' || p_kind, 0));

  if exists (
    select 1 from public.ica_daily_limit_usage u
    where u.user_id = p_user_id and u.usage_day = local_day
      and u.usage_kind = p_kind and u.source_id = p_source_id
  ) then return; end if;

  if p_kind = 'activations' and exists (
    select 1 from public.ica_daily_limit_usage u
    where u.user_id = p_user_id and u.usage_kind = 'activations' and u.source_id = p_source_id
  ) then return; end if;

  base_limit := case p_kind when 'words' then 10 when 'phrases' then 2 else 2 end;
  select exists (
    select 1 from public.preguntica_token_ledger l
    where l.user_id = p_user_id and l.entry_type = 'phase_boost'
      and l.reference_day = local_day and l.reference_key = p_kind
  ) into has_boost;
  active_limit := base_limit * case when has_boost then 2 else 1 end;

  select count(*)::integer into used_count
  from public.ica_daily_limit_usage u
  where u.user_id = p_user_id and u.usage_day = local_day and u.usage_kind = p_kind;
  if used_count >= active_limit then
    raise exception using message = case p_kind
      when 'words' then 'DAILY_LIMIT_WORDS'
      when 'phrases' then 'DAILY_LIMIT_PHRASES'
      else 'DAILY_LIMIT_ACTIVATIONS'
    end;
  end if;

  insert into public.ica_daily_limit_usage (user_id, usage_day, usage_kind, source_id)
  values (p_user_id, local_day, p_kind, p_source_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.ica_record_daily_limit_usage(uuid, text, uuid, boolean) from public, anon, authenticated;

create or replace function public.ica_enforce_creation_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_created_at timestamptz;
begin
  if tg_table_name = 'lexicards' then
    if tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.created_at := old.created_at;
      return new;
    end if;
    select l.created_at into existing_created_at
    from public.lexicards l where l.id = new.id and l.user_id = new.user_id;
    if found then
      new.created_at := existing_created_at;
      return new;
    end if;
    new.created_at := now();
    perform public.ica_record_daily_limit_usage(new.user_id, 'words', new.id, false);
    return new;
  elsif tg_table_name = 'phrase_generations' then
    if tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.created_at := old.created_at;
      new.is_regeneration := old.is_regeneration;
      return new;
    end if;
    new.created_at := now();
    -- Regeneration classification is derived from a prior successful generation with the
    -- same selected source words today; a client-supplied flag cannot turn a new word set free.
    new.is_regeneration := coalesce(new.success, true) and coalesce(new.model, '') <> 'manual' and exists (
      select 1
      from public.phrase_generations previous
      where previous.user_id = new.user_id
        and coalesce(previous.success, true)
        and coalesce(previous.model, '') <> 'manual'
        and coalesce(previous.source_words_v2, to_jsonb(previous.source_words))
          = coalesce(new.source_words_v2, to_jsonb(new.source_words))
        and public.ica_local_date(previous.user_id, previous.created_at) = public.ica_local_today(new.user_id)
    );
    if coalesce(new.success, true) and not new.is_regeneration then
      perform public.ica_record_daily_limit_usage(new.user_id, 'phrases', new.id, false);
    end if;
    return new;
  elsif tg_table_name = 'phrase_voice_activations' then
    if tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.phrase_generation_id := old.phrase_generation_id;
      new.created_at := old.created_at;
      return new;
    end if;
    new.created_at := now();
    perform public.ica_record_daily_limit_usage(new.user_id, 'activations', new.phrase_generation_id, false);
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists lexicards_enforce_daily_limit on public.lexicards;
create trigger lexicards_enforce_daily_limit
  before insert or update of user_id, created_at on public.lexicards
  for each row execute function public.ica_enforce_creation_daily_limit();

drop trigger if exists phrase_generations_enforce_daily_limit on public.phrase_generations;
create trigger phrase_generations_enforce_daily_limit
  before insert or update of user_id, created_at, is_regeneration on public.phrase_generations
  for each row execute function public.ica_enforce_creation_daily_limit();

drop trigger if exists phrase_voice_activations_enforce_daily_limit on public.phrase_voice_activations;
create trigger phrase_voice_activations_enforce_daily_limit
  before insert or update of user_id, phrase_generation_id, created_at on public.phrase_voice_activations
  for each row execute function public.ica_enforce_creation_daily_limit();

-- Seed today's counters from persisted source rows so release doesn't reset a partially used day.
insert into public.ica_daily_limit_usage (user_id, usage_day, usage_kind, source_id, created_at)
select l.user_id, public.ica_local_date(l.user_id, l.created_at), 'words', l.id, now()
from public.lexicards l
where public.ica_local_date(l.user_id, l.created_at) = public.ica_local_today(l.user_id)
on conflict do nothing;

insert into public.ica_daily_limit_usage (user_id, usage_day, usage_kind, source_id, created_at)
select pg.user_id, public.ica_local_date(pg.user_id, pg.created_at), 'phrases', pg.id, now()
from public.phrase_generations pg
where coalesce(pg.success, true)
  and not coalesce(pg.is_regeneration, false)
  and public.ica_local_date(pg.user_id, pg.created_at) = public.ica_local_today(pg.user_id)
on conflict do nothing;

insert into public.ica_daily_limit_usage (user_id, usage_day, usage_kind, source_id, created_at)
select pva.user_id, public.ica_local_today(pva.user_id), 'activations', pva.phrase_generation_id, now()
from public.phrase_voice_activations pva
where public.ica_local_date(pva.user_id, pva.created_at) = public.ica_local_today(pva.user_id)
  and not exists (
    select 1 from public.phrase_voice_activations earlier
    where earlier.user_id = pva.user_id
      and earlier.phrase_generation_id = pva.phrase_generation_id
      and earlier.created_at < pva.created_at
  )
group by pva.user_id, pva.phrase_generation_id
on conflict do nothing;

-- Phrase logging is authenticated and tied to the user's own selected cards. Regeneration is
-- derived by the database from a same-day generation with the same source set.
create or replace function public.record_phrase_generation_event(
  p_word_ids uuid[],
  p_phrase text,
  p_translation text,
  p_target_lang text,
  p_native_lang text,
  p_source text default 'generated'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  phrase_id uuid := gen_random_uuid();
  source_ids uuid[];
  source_words text[];
  source_v2 jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_source not in ('generated', 'manual') then raise exception 'PHRASE_SOURCE_INVALID'; end if;
  if nullif(trim(coalesce(p_phrase, '')), '') is null then raise exception 'PHRASE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_target_lang, '')), '') is null
    or nullif(trim(coalesce(p_native_lang, '')), '') is null then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;
  if coalesce(array_length(p_word_ids, 1), 0) < 1 or array_length(p_word_ids, 1) > 10 then
    raise exception 'PHRASE_WORD_COUNT_INVALID';
  end if;

  select array_agg(l.id order by input.ordinality),
         array_agg(l.target order by input.ordinality),
         jsonb_agg(jsonb_build_object('lexicard_id', l.id, 'word', l.target) order by input.ordinality)
  into source_ids, source_words, source_v2
  from unnest(p_word_ids) with ordinality as input(id, ordinality)
  join public.lexicards l on l.id = input.id and l.user_id = v_user_id
  where lower(trim(coalesce(l.target_lang, ''))) = lower(trim(p_target_lang))
    and lower(trim(coalesce(l.native_lang, ''))) = lower(trim(p_native_lang));

  if coalesce(array_length(source_ids, 1), 0) <> array_length(p_word_ids, 1) then
    raise exception 'PHRASE_WORDS_NOT_OWNED';
  end if;

  insert into public.phrase_generations (
    id, user_id, source_words, source_words_v2, generated_phrase, translation,
    model, success, target_lang, native_lang
  ) values (
    phrase_id, v_user_id, source_words, source_v2, trim(p_phrase), p_translation,
    case when p_source = 'manual' then 'manual' else 'generated' end,
    true, lower(trim(p_target_lang)), lower(trim(p_native_lang))
  );
  return phrase_id;
end;
$$;

revoke all on function public.record_phrase_generation_event(uuid[], text, text, text, text, text) from public, anon;
grant execute on function public.record_phrase_generation_event(uuid[], text, text, text, text, text) to authenticated;

revoke insert, update on public.phrase_generations from anon, authenticated;
grant select, delete on public.phrase_generations to authenticated;

-- Only this RPC may write activation links, and each link must correspond to a selected source word.
alter function public.register_phrase_lexicard_activations(uuid, uuid[], text, text) security definer;
revoke insert, update, delete on public.phrase_lexicard_activations from anon, authenticated;
grant select on public.phrase_lexicard_activations to authenticated;

create or replace function public.ica_validate_phrase_activation_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_ids jsonb;
begin
  if tg_op = 'UPDATE' then return new; end if;
  select pg.source_words_v2 into source_ids
  from public.phrase_generations pg
  where pg.id = new.phrase_generation_id and pg.user_id = new.user_id;
  if not found or jsonb_typeof(source_ids) is distinct from 'array' then
    raise exception 'PHRASE_SOURCE_WORDS_INVALID';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(source_ids) source
    where source ->> 'lexicard_id' = new.lexicard_id::text
  ) then raise exception 'PHRASE_WORD_NOT_IN_SOURCE'; end if;
  return new;
end;
$$;

revoke all on function public.ica_validate_phrase_activation_source() from public, anon, authenticated;
drop trigger if exists ica_validate_phrase_activation_source_trigger on public.phrase_lexicard_activations;
create trigger ica_validate_phrase_activation_source_trigger
  before insert or update on public.phrase_lexicard_activations
  for each row execute function public.ica_validate_phrase_activation_source();

create or replace function public.get_my_ica_coins_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  week_start date;
  balance numeric(10,2);
  chest_row public.preguntica_token_ledger%rowtype;
  entries jsonb;
  boosts jsonb;
  claimed_ica jsonb;
  claimed_flash jsonb;
  unused_pass_count integer;
  wins numeric(10,2);
  usage_words integer;
  usage_phrases integer;
  usage_activations integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  local_day := public.ica_local_today(v_user_id);
  week_start := local_day - (extract(isodow from local_day)::integer - 1);

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into balance
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id;

  select l.* into chest_row
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'cycle_chest'
    and l.reference_day = local_day
  limit 1;

  select coalesce(jsonb_agg(l.reference_key), '[]'::jsonb)
  into boosts
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'phase_boost'
    and l.reference_day = local_day;

  select coalesce(jsonb_agg(l.reference_key::integer), '[]'::jsonb)
  into claimed_ica
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id and l.entry_type = 'streak_milestone';

  select coalesce(jsonb_agg(l.reference_key::integer), '[]'::jsonb)
  into claimed_flash
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id and l.entry_type = 'flash_milestone';

  select count(*)::integer into unused_pass_count
  from public.ica_challenge_passes cp
  where cp.user_id = v_user_id and cp.used_at is null;

  select coalesce(sum(l.tokens_delta), 0)::numeric(10,2) into wins
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'challenge_win'
    and l.reference_day >= week_start
    and l.reference_day <= local_day;

  select count(*) filter (where u.usage_kind = 'words')::integer,
         count(*) filter (where u.usage_kind = 'phrases')::integer,
         count(*) filter (where u.usage_kind = 'activations')::integer
  into usage_words, usage_phrases, usage_activations
  from public.ica_daily_limit_usage u
  where u.user_id = v_user_id and u.usage_day = local_day;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into entries
  from (
    select jsonb_build_object(
      'id', l.id,
      'type', case l.entry_type when 'challenge_pass' then 'challenge_slot' else l.entry_type end,
      'delta', l.tokens_delta,
      'day', coalesce(l.reference_day, (l.created_at at time zone coalesce(tzn.name, 'UTC'))::date),
      'createdAt', floor(extract(epoch from l.created_at) * 1000)::bigint,
      'milestoneDays', case when l.entry_type in ('streak_milestone', 'flash_milestone') then l.reference_key::integer else null end,
      'phase', case when l.entry_type = 'phase_boost' then l.reference_key else null end,
      'challengeId', case when l.entry_type = 'challenge_win' then l.reference_key else null end,
      'rolled', nullif(l.metadata ->> 'rolled', '')::integer,
      'used', case when l.entry_type = 'challenge_pass' then cp.used_at is not null else null end
    ) as item
    from public.preguntica_token_ledger l
    left join pg_timezone_names tzn on tzn.name = coalesce(
      (select nullif(trim(p.timezone), '') from public.profiles p where p.id = v_user_id), 'UTC'
    )
    left join public.ica_challenge_passes cp on cp.ledger_entry_id = l.id
    where l.user_id = v_user_id
    order by l.created_at desc, l.id desc
    limit 40
  ) recent;

  return jsonb_build_object(
    'balance', balance,
    'today', local_day,
    'chestOpened', chest_row.id is not null,
    'chestCoins', coalesce(chest_row.tokens_delta, 0),
    'chestRolled', nullif(chest_row.metadata ->> 'rolled', '')::integer,
    'phaseBoosts', boosts,
    'unusedPasses', unused_pass_count,
    'claimedIcaMilestones', claimed_ica,
    'claimedFlashMilestones', claimed_flash,
    'challengeWinsThisWeek', wins,
    'icaStreak', public.ica_current_streak(v_user_id, 'ica'),
    'flashStreak', public.ica_current_streak(v_user_id, 'flashcards'),
    'usageToday', jsonb_build_object(
      'words', coalesce(usage_words, 0),
      'phrases', coalesce(usage_phrases, 0),
      'activations', coalesce(usage_activations, 0)
    ),
    'entries', entries
  );
end;
$$;

revoke all on function public.get_my_ica_coins_state() from public, anon;
grant execute on function public.get_my_ica_coins_state() to authenticated;

create or replace function public.claim_cycle_chest()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  metrics record;
  existing_row public.preguntica_token_ledger%rowtype;
  current_balance numeric(10,2);
  rolled integer;
  credited numeric(10,2);
  roll_value numeric;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));
  local_day := public.ica_local_today(v_user_id);

  select * into metrics
  from public.recompute_daily_creation_metrics_for_user_day(v_user_id, local_day);
  if not coalesce(metrics.creation_goal_completed, false) then
    raise exception 'ICA_CYCLE_INCOMPLETE';
  end if;

  select l.* into existing_row
  from public.preguntica_token_ledger l
  where l.user_id = v_user_id
    and l.entry_type = 'cycle_chest'
    and l.reference_day = local_day;
  if found then
    return jsonb_build_object(
      'coins', existing_row.tokens_delta,
      'rolled', coalesce(nullif(existing_row.metadata ->> 'rolled', '')::integer, existing_row.tokens_delta::integer),
      'alreadyOpened', true
    );
  end if;

  roll_value := random() * 100;
  rolled := case
    when roll_value < 40 then 1
    when roll_value < 70 then 2
    when roll_value < 90 then 3
    when roll_value < 98 then 4
    else 5
  end;

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance
  from public.preguntica_token_ledger l where l.user_id = v_user_id;
  credited := greatest(0, least(rolled::numeric, 100 - current_balance));

  insert into public.preguntica_token_ledger (
    user_id, entry_type, tokens_delta, reference_day, metadata
  ) values (
    v_user_id, 'cycle_chest', credited, local_day,
    jsonb_build_object('rolled', rolled, 'source', 'ica_cycle')
  );

  return jsonb_build_object('coins', credited, 'rolled', rolled, 'alreadyOpened', false);
end;
$$;

revoke all on function public.claim_cycle_chest() from public, anon;
grant execute on function public.claim_cycle_chest() to authenticated;

create or replace function public.claim_streak_milestones(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  streak integer;
  milestone_days integer[] := array[7, 30, 90, 180, 360];
  milestone_rewards integer[];
  gained numeric(10,2) := 0;
  inserted_delta numeric(10,2);
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind = 'ica' then
    milestone_rewards := array[2, 5, 10, 20, 40];
  elsif p_kind = 'flashcards' then
    milestone_rewards := array[1, 3, 5, 10, 20];
  else
    raise exception 'INVALID_STREAK_KIND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));
  local_day := public.ica_local_today(v_user_id);
  streak := public.ica_current_streak(v_user_id, p_kind);

  for i in 1..array_length(milestone_days, 1) loop
    if streak >= milestone_days[i] then
      insert into public.preguntica_token_ledger (
        user_id, entry_type, tokens_delta, reference_day, reference_key, metadata
      ) values (
        v_user_id,
        case when p_kind = 'ica' then 'streak_milestone' else 'flash_milestone' end,
        milestone_rewards[i],
        local_day,
        milestone_days[i]::text,
        jsonb_build_object('streak_days', milestone_days[i])
      ) on conflict do nothing
      returning tokens_delta into inserted_delta;
      gained := gained + coalesce(inserted_delta, 0);
      inserted_delta := null;
    end if;
  end loop;

  return jsonb_build_object('gained', gained, 'streak', streak);
end;
$$;

revoke all on function public.claim_streak_milestones(text) from public, anon;
grant execute on function public.claim_streak_milestones(text) to authenticated;

create or replace function public.buy_phase_boost(p_phase text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  current_balance numeric(10,2);
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_phase not in ('words', 'phrases', 'activations') then raise exception 'INVALID_PHASE'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));
  local_day := public.ica_local_today(v_user_id);

  if exists (
    select 1 from public.preguntica_token_ledger l
    where l.user_id = v_user_id and l.entry_type = 'phase_boost'
      and l.reference_day = local_day and l.reference_key = p_phase
  ) then
    return jsonb_build_object('ok', true, 'alreadyOwned', true);
  end if;

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance from public.preguntica_token_ledger l where l.user_id = v_user_id;
  if current_balance < 15 then raise exception 'INSUFFICIENT_TOKENS'; end if;

  insert into public.preguntica_token_ledger (
    user_id, entry_type, tokens_delta, reference_day, reference_key, metadata
  ) values (
    v_user_id, 'phase_boost', -15, local_day, p_phase, jsonb_build_object('cost', 15)
  );
  return jsonb_build_object('ok', true, 'alreadyOwned', false);
end;
$$;

revoke all on function public.buy_phase_boost(text) from public, anon;
grant execute on function public.buy_phase_boost(text) to authenticated;

create or replace function public.buy_challenge_pass()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  pass_id uuid;
  ledger_id uuid;
  current_balance numeric(10,2);
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':preguntica_tokens'));
  local_day := public.ica_local_today(v_user_id);

  select cp.id into pass_id
  from public.ica_challenge_passes cp
  where cp.user_id = v_user_id and cp.used_at is null
  order by cp.created_at, cp.id
  for update
  limit 1;
  if pass_id is not null then
    return jsonb_build_object('ok', true, 'passId', pass_id, 'alreadyOwned', true);
  end if;

  pass_id := gen_random_uuid();
  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance from public.preguntica_token_ledger l where l.user_id = v_user_id;
  if current_balance < 15 then raise exception 'INSUFFICIENT_TOKENS'; end if;

  insert into public.preguntica_token_ledger (
    user_id, entry_type, tokens_delta, reference_day, reference_key, metadata
  ) values (
    v_user_id, 'challenge_pass', -15, local_day, pass_id::text,
    jsonb_build_object('pass_id', pass_id, 'cost', 15)
  ) returning id into ledger_id;

  insert into public.ica_challenge_passes (id, user_id, ledger_entry_id)
  values (pass_id, v_user_id, ledger_id);

  return jsonb_build_object('ok', true, 'passId', pass_id);
end;
$$;

revoke all on function public.buy_challenge_pass() from public, anon;
grant execute on function public.buy_challenge_pass() to authenticated;

create or replace function public.create_ica_challenge_with_pass(
  p_user_id uuid,
  p_challenged_user_id uuid,
  p_challenge_slug text,
  p_scope text,
  p_target_lang text,
  p_native_lang text,
  p_duration_seconds integer,
  p_expires_at timestamptz,
  p_accept_until timestamptz,
  p_game_metadata jsonb,
  p_phases_json jsonb,
  p_use_extra_slot boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_id uuid := gen_random_uuid();
  active_count integer;
  rival_active_count integer;
  pass_id uuid;
  first_lock text;
  second_lock text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_user_id is null or p_challenged_user_id is null or p_user_id = p_challenged_user_id then
    raise exception 'INVALID_CHALLENGE_PARTICIPANTS';
  end if;

  first_lock := least(p_user_id::text, p_challenged_user_id::text);
  second_lock := greatest(p_user_id::text, p_challenged_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-active:' || first_lock, 0));
  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-active:' || second_lock, 0));

  select count(*)::integer into active_count
  from public.ica_challenges c
  where c.status in ('created', 'in_progress')
    and (c.challenger_user_id = p_user_id or c.challenged_user_id = p_user_id);
  select count(*)::integer into rival_active_count
  from public.ica_challenges c
  where c.status in ('created', 'in_progress')
    and (c.challenger_user_id = p_challenged_user_id or c.challenged_user_id = p_challenged_user_id);

  if active_count >= 4 then raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED'; end if;
  if active_count >= 3 then
    if not coalesce(p_use_extra_slot, false) then raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED'; end if;
    select cp.id into pass_id
    from public.ica_challenge_passes cp
    where cp.user_id = p_user_id and cp.used_at is null
    order by cp.created_at, cp.id
    for update skip locked
    limit 1;
    if pass_id is null then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
    p_game_metadata := coalesce(p_game_metadata, '{}'::jsonb)
      || jsonb_build_object('ica_extra_slot_pass_id', pass_id);
  end if;
  if rival_active_count >= 3 then raise exception 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED'; end if;
  if exists (
    select 1 from public.ica_challenges c
    where c.status in ('created', 'in_progress')
      and ((c.challenger_user_id = p_user_id and c.challenged_user_id = p_challenged_user_id)
        or (c.challenger_user_id = p_challenged_user_id and c.challenged_user_id = p_user_id))
  ) then raise exception 'ICA_CHALLENGE_ACTIVE_PAIR_EXISTS'; end if;

  insert into public.ica_challenges (
    id, challenge_slug, status, result_type, scope, target_lang, native_lang,
    challenger_user_id, challenged_user_id, duration_seconds, expires_at,
    accept_until, game_metadata, phases_json
  ) values (
    challenge_id, p_challenge_slug, 'created', 'pending', p_scope,
    case when p_scope = 'language' then p_target_lang else null end,
    case when p_scope = 'language' then p_native_lang else null end,
    p_user_id, p_challenged_user_id, p_duration_seconds, p_expires_at,
    p_accept_until, coalesce(p_game_metadata, '{}'::jsonb), coalesce(p_phases_json, '[]'::jsonb)
  );

  insert into public.ica_challenge_competitors (
    challenge_id, user_id, competitor_order, invitation_status, accepted_at
  ) values
    (challenge_id, p_user_id, 1, 'accepted', now()),
    (challenge_id, p_challenged_user_id, 2, 'pending', null);

  if pass_id is not null then
    update public.ica_challenge_passes
    set used_challenge_id = challenge_id, used_at = now()
    where id = pass_id and used_at is null;
    if not found then raise exception 'ICA_CHALLENGE_PASS_REQUIRED'; end if;
  end if;

  return challenge_id;
end;
$$;

revoke all on function public.create_ica_challenge_with_pass(uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.create_ica_challenge_with_pass(uuid, uuid, text, text, text, text, integer, timestamptz, timestamptz, jsonb, jsonb, boolean) to service_role;

create or replace function public.award_ica_challenge_win()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  local_day date;
  week_start date;
  current_balance numeric(10,2);
  weekly_earned numeric(10,2);
  credited numeric(10,2);
begin
  if new.status <> 'completed' or new.winner_user_id is null
    or coalesce(new.finalized_at, now()) < timestamptz '2026-10-01 00:00:00+00'
    or (old.status = 'completed' and old.winner_user_id is not distinct from new.winner_user_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.winner_user_id::text || ':preguntica_tokens'));
  local_day := public.ica_local_date(new.winner_user_id, coalesce(new.finalized_at, now()));
  week_start := local_day - (extract(isodow from local_day)::integer - 1);

  select coalesce(round(sum(l.tokens_delta), 2), 0)::numeric(10,2)
  into current_balance from public.preguntica_token_ledger l where l.user_id = new.winner_user_id;
  select coalesce(sum(l.tokens_delta), 0)::numeric(10,2)
  into weekly_earned
  from public.preguntica_token_ledger l
  where l.user_id = new.winner_user_id
    and l.entry_type = 'challenge_win'
    and l.reference_day >= week_start and l.reference_day <= local_day;

  credited := greatest(0, least(1::numeric, 7 - weekly_earned, 100 - current_balance));
  insert into public.preguntica_token_ledger (
    user_id, entry_type, tokens_delta, reference_day, reference_key, reference_type, reference_id, metadata
  ) values (
    new.winner_user_id, 'challenge_win', credited, local_day, new.id::text,
    'ica_challenge', new.id, jsonb_build_object('challenge_id', new.id)
  ) on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists ica_challenges_award_coin_on_win on public.ica_challenges;
create trigger ica_challenges_award_coin_on_win
  after update of status, winner_user_id on public.ica_challenges
  for each row
  when (new.status = 'completed' and new.winner_user_id is not null)
  execute function public.award_ica_challenge_win();

revoke all on function public.award_ica_challenge_win() from public, anon, authenticated;

-- Review metrics are built from server-timestamped review events, never client deltas/days.
create or replace function public.record_review_event(
  p_lexicard_id uuid,
  p_knew boolean,
  p_response_time_ms integer default null
)
returns table (review_day date, correct_reviews integer, review_goal_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  day_start timestamptz;
  day_end timestamptz;
  timezone_name text;
  card_row public.lexicards%rowtype;
  activated_words integer;
  correct_count integer;
  xp_points integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_lexicard_id is null or p_knew is null then raise exception 'REVIEW_EVENT_INVALID'; end if;
  if p_response_time_ms is not null and p_response_time_ms < 0 then raise exception 'REVIEW_RESPONSE_TIME_INVALID'; end if;

  select l.* into card_row
  from public.lexicards l
  where l.id = p_lexicard_id and l.user_id = v_user_id;
  if not found then raise exception 'LEXICARD_NOT_FOUND'; end if;

  select count(distinct pla.lexicard_id)::integer into activated_words
  from public.phrase_lexicard_activations pla
  join public.lexicards l on l.id = pla.lexicard_id
  where pla.user_id = v_user_id
    and lower(trim(pla.target_lang)) = lower(trim(coalesce(card_row.target_lang, '')))
    and lower(trim(pla.native_lang)) = lower(trim(coalesce(card_row.native_lang, '')));
  if coalesce(activated_words, 0) < 20 then raise exception 'FLASHCARDS_LOCKED_20_ACTIVATED_WORDS'; end if;

  local_day := public.ica_local_today(v_user_id);
  select coalesce(tzn.name, 'UTC') into timezone_name
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = v_user_id;
  timezone_name := coalesce(timezone_name, 'UTC');
  day_start := local_day::timestamp at time zone timezone_name;
  day_end := (local_day + 1)::timestamp at time zone timezone_name;

  perform pg_advisory_xact_lock(hashtextextended('ica-review-day:' || v_user_id::text || ':' || local_day::text, 0));
  insert into public.lexicard_reviews (
    user_id, lexicard_id, knew, response_time_ms, reviewed_at, created_at
  ) values (
    v_user_id, card_row.id, p_knew, p_response_time_ms, now(), now()
  );

  select count(*) filter (where lr.knew)::integer into correct_count
  from public.lexicard_reviews lr
  where lr.user_id = v_user_id and lr.reviewed_at >= day_start and lr.reviewed_at < day_end;
  xp_points := case when p_knew then 10 else 2 end;

  insert into public.daily_metrics (user_id, day, correct_reviews, xp_earned)
  values (v_user_id, local_day, coalesce(correct_count, 0), xp_points)
  on conflict (user_id, day) do update
  set correct_reviews = greatest(public.daily_metrics.correct_reviews, excluded.correct_reviews),
      xp_earned = public.daily_metrics.xp_earned + xp_points;

  insert into public.goal_completions (user_id, day, goal_type, completed, progress_value, target_value)
  select v_user_id, local_day, 'review_goal', dm.review_goal_completed, dm.correct_reviews, 10
  from public.daily_metrics dm
  where dm.user_id = v_user_id and dm.day = local_day
  on conflict (user_id, day, goal_type) do update
  set completed = excluded.completed,
      progress_value = excluded.progress_value,
      target_value = excluded.target_value,
      updated_at = now();

  insert into public.xp_events (user_id, source, points, metadata)
  values (
    v_user_id,
    case when p_knew then 'review_correct' else 'review_incorrect' end,
    xp_points,
    jsonb_build_object('lexicard_id', card_row.id, 'importance', card_row.importance)
  );

  return query
  select local_day, dm.correct_reviews, dm.review_goal_completed
  from public.daily_metrics dm where dm.user_id = v_user_id and dm.day = local_day;
end;
$$;

revoke all on function public.record_review_event(uuid, boolean, integer) from public, anon;
grant execute on function public.record_review_event(uuid, boolean, integer) to authenticated;

revoke all on function public.bump_daily_review_metrics(date, integer, integer) from public, anon, authenticated;
revoke insert, update, delete on public.lexicard_reviews from anon, authenticated;
grant select on public.lexicard_reviews to authenticated;

-- Remove historical client-incremented review totals and derive flags from persisted review rows.
create or replace function public.daily_metrics_compute_goal_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  timezone_name text;
  day_start timestamptz;
  day_end timestamptz;
  true_reviews integer;
begin
  select coalesce(tzn.name, 'UTC') into timezone_name
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = new.user_id;
  timezone_name := coalesce(timezone_name, 'UTC');
  day_start := new.day::timestamp at time zone timezone_name;
  day_end := (new.day + 1)::timestamp at time zone timezone_name;

  select count(*) filter (where lr.knew)::integer into true_reviews
  from public.lexicard_reviews lr
  where lr.user_id = new.user_id and lr.reviewed_at >= day_start and lr.reviewed_at < day_end;
  new.correct_reviews := coalesce(true_reviews, 0);
  new.review_goal_completed := new.correct_reviews >= 10;

  new.voice_requirement_met := case
    when new.day < date '2026-05-25' then true
    else coalesce(new.voice_activations_count, 0) > 0
  end;
  new.creation_goal_completed :=
    coalesce(new.words_added, 0) >= 5
    and coalesce(new.phrase_generated, false)
    and new.voice_requirement_met;
  return new;
end;
$$;

insert into public.daily_metrics (user_id, day, correct_reviews)
select
  lr.user_id,
  (lr.reviewed_at at time zone coalesce(tzn.name, 'UTC'))::date,
  count(*) filter (where lr.knew)::integer
from public.lexicard_reviews lr
left join public.profiles p on p.id = lr.user_id
left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
group by lr.user_id, (lr.reviewed_at at time zone coalesce(tzn.name, 'UTC'))::date
on conflict (user_id, day) do nothing;

update public.daily_metrics dm
set correct_reviews = dm.correct_reviews;

-- Keep profile timezone changes usable for travelers while preventing repeated flips from
-- resetting quotas. Four changes per rolling 24 hours allow two-zone trips with a margin.
create table if not exists public.ica_timezone_change_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  previous_timezone text not null,
  next_timezone text not null,
  changed_at timestamptz not null default now()
);
create index if not exists ica_timezone_change_log_user_recent_idx
  on public.ica_timezone_change_log (user_id, changed_at desc);
alter table public.ica_timezone_change_log enable row level security;
revoke all on public.ica_timezone_change_log from public, anon, authenticated;

create or replace function public.ica_guard_profile_timezone_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and current_setting('ica.allow_timezone_update', true) is distinct from 'true'
    and tg_op = 'INSERT' and coalesce(new.timezone, 'UTC') <> 'UTC' then
    raise exception 'USE_SET_MY_TIMEZONE';
  end if;
  if auth.uid() is not null and tg_op = 'UPDATE'
    and new.timezone is distinct from old.timezone
    and current_setting('ica.allow_timezone_update', true) is distinct from 'true' then
    raise exception 'USE_SET_MY_TIMEZONE';
  end if;
  return new;
end;
$$;
revoke all on function public.ica_guard_profile_timezone_update() from public, anon, authenticated;
drop trigger if exists profiles_ica_timezone_guard on public.profiles;
create trigger profiles_ica_timezone_guard
  before insert or update of timezone on public.profiles
  for each row execute function public.ica_guard_profile_timezone_update();

create or replace function public.set_my_timezone(p_timezone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  previous_timezone text;
  resolved_timezone text;
  recent_changes integer;
  old_today_local date;
  new_today_local date;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(nullif(p.timezone, ''), 'UTC') into previous_timezone
  from public.profiles p where p.id = v_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select tzn.name into resolved_timezone
  from pg_timezone_names tzn
  where tzn.name = nullif(trim(p_timezone), '')
  limit 1;
  if resolved_timezone is null then raise exception 'TIMEZONE_INVALID'; end if;
  if resolved_timezone = coalesce(previous_timezone, 'UTC') then return resolved_timezone; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':timezone-change'));
  select count(*)::integer into recent_changes
  from public.ica_timezone_change_log l
  where l.user_id = v_user_id and l.changed_at > now() - interval '24 hours';
  if recent_changes >= 4 then raise exception 'TIMEZONE_CHANGE_RATE_LIMIT'; end if;

  insert into public.ica_timezone_change_log (user_id, previous_timezone, next_timezone)
  values (v_user_id, coalesce(previous_timezone, 'UTC'), resolved_timezone);
  perform set_config('ica.allow_timezone_update', 'true', true);
  update public.profiles set timezone = resolved_timezone where id = v_user_id;
  update public.ica_daily_limit_usage u
  set usage_day = public.ica_local_date(v_user_id, u.created_at)
  where u.user_id = v_user_id;

  old_today_local := (now() at time zone coalesce(previous_timezone, 'UTC'))::date;
  new_today_local := (now() at time zone resolved_timezone)::date;
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, old_today_local);
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, old_today_local - 1);
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, new_today_local);
  perform public.recompute_daily_creation_metrics_for_user_day(v_user_id, new_today_local - 1);
  perform set_config('ica.allow_timezone_update', 'false', true);
  return resolved_timezone;
end;
$$;
revoke all on function public.set_my_timezone(text) from public, anon;
grant execute on function public.set_my_timezone(text) to authenticated;

-- Featured badges are stored on the profile only after a database-side eligibility check.
alter table public.profiles
  add column if not exists featured_badge text,
  add constraint profiles_featured_badge_format_check
    check (featured_badge is null or featured_badge ~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios):(bronce|plata|oro|rubi|diamante)$');

create or replace function public.ica_best_streak(p_user_id uuid, p_kind text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item record;
  previous_day date;
  run_length integer := 0;
  best integer := 0;
  completed boolean;
begin
  if p_kind not in ('ica', 'flashcards') then raise exception 'INVALID_STREAK_KIND'; end if;
  for item in
    select dm.day, dm.creation_goal_completed, dm.creation_streak_saved_at, dm.review_goal_completed
    from public.daily_metrics dm
    where dm.user_id = p_user_id
      and case p_kind
        when 'ica' then dm.creation_goal_completed or dm.creation_streak_saved_at is not null
        else dm.review_goal_completed
      end
    order by dm.day
  loop
    if previous_day is null or item.day <> previous_day + 1 then run_length := 0; end if;
    completed := case when p_kind = 'ica' then item.creation_goal_completed else item.review_goal_completed end;
    if completed then run_length := run_length + 1; end if;
    best := greatest(best, run_length);
    previous_day := item.day;
  end loop;
  return best;
end;
$$;
revoke all on function public.ica_best_streak(uuid, text) from public, anon, authenticated;

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
  threshold integer;
  current_value numeric;
  first_count integer;
  second_count integer;
  third_count integer;
  best_efficacy numeric;
begin
  if p_badge is null or p_badge !~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios):(bronce|plata|oro|rubi|diamante)$' then
    return false;
  end if;
  category := split_part(p_badge, ':', 1);
  tier := split_part(p_badge, ':', 2);
  threshold := case tier when 'bronce' then 1 when 'plata' then 2 when 'oro' then 3 when 'rubi' then 4 else 5 end;

  if category = 'rachaICA' then
    current_value := public.ica_best_streak(p_user_id, 'ica');
    return current_value >= (array[7, 30, 90, 180, 360])[threshold];
  elsif category = 'rachaFlash' then
    current_value := public.ica_best_streak(p_user_id, 'flashcards');
    return current_value >= (array[7, 30, 90, 180, 360])[threshold];
  elsif category = 'vocab' then
    select count(*)::numeric into current_value from public.lexicards l where l.user_id = p_user_id;
    return current_value >= (array[50, 100, 200, 500, 1000])[threshold];
  elsif category = 'desafios' then
    select count(*)::numeric into current_value from public.ica_challenges c where c.winner_user_id = p_user_id;
    return current_value >= (array[10, 20, 50, 100, 200])[threshold];
  elsif category = 'ranking' then
    select count(*) filter (where ls.rank = 1)::integer,
           count(*) filter (where ls.rank = 2)::integer,
           count(*) filter (where ls.rank = 3)::integer
    into first_count, second_count, third_count
    from public.leaderboard_snapshots ls
    where ls.period = 'monthly'
      and ls.user_id = p_user_id
      and ls.period_end >= ls.period_start + 27;
    return case threshold
      when 1 then first_count + second_count + third_count >= 1
      when 2 then first_count + second_count >= 1
      when 3 then first_count >= 1
      when 4 then first_count >= 2
      else first_count >= 3
    end;
  else
    select max(
      greatest(0, least(100, round(
        coalesce(nullif(ls.payload ->> 'total_points', '')::numeric, ls.score::numeric / 10)
        / (10 + 2.8 + 8 + 14 + case when nullif(ls.payload ->> 'ica_test_points', '') is not null then 1.2 else 0 end)
        * 100
      )))
    ) into best_efficacy
    from public.leaderboard_snapshots ls
    where ls.period = 'monthly'
      and ls.user_id = p_user_id
      and ls.period_end >= ls.period_start + 27;
    return coalesce(best_efficacy, 0) >= (array[50, 65, 80, 90, 100])[threshold];
  end if;
end;
$$;
revoke all on function public.ica_featured_badge_earned(uuid, text) from public, anon, authenticated;

create or replace function public.ica_guard_featured_badge_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.featured_badge is not null
    and current_setting('ica.allow_featured_badge_update', true) is distinct from 'true'
    and tg_op = 'INSERT' then
    raise exception 'USE_SET_MY_FEATURED_BADGE';
  end if;
  if auth.uid() is not null and tg_op = 'UPDATE'
    and new.featured_badge is distinct from old.featured_badge
    and current_setting('ica.allow_featured_badge_update', true) is distinct from 'true' then
    raise exception 'USE_SET_MY_FEATURED_BADGE';
  end if;
  return new;
end;
$$;
revoke all on function public.ica_guard_featured_badge_update() from public, anon, authenticated;
drop trigger if exists profiles_ica_featured_badge_guard on public.profiles;
create trigger profiles_ica_featured_badge_guard
  before insert or update of featured_badge on public.profiles
  for each row execute function public.ica_guard_featured_badge_update();

create or replace function public.set_my_featured_badge(p_badge text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_badge is not null and not public.ica_featured_badge_earned(v_user_id, p_badge) then
    raise exception 'FEATURED_BADGE_NOT_EARNED';
  end if;
  perform set_config('ica.allow_featured_badge_update', 'true', true);
  update public.profiles set featured_badge = p_badge where id = v_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  perform set_config('ica.allow_featured_badge_update', 'false', true);
  return p_badge;
end;
$$;
revoke all on function public.set_my_featured_badge(text) from public, anon;
grant execute on function public.set_my_featured_badge(text) to authenticated;

create or replace function public.ica_snapshot_featured_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_badge text;
begin
  if new.period = 'monthly' then
    select p.featured_badge into selected_badge from public.profiles p where p.id = new.user_id;
    new.payload := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('featured_badge', selected_badge);
  end if;
  return new;
end;
$$;
revoke all on function public.ica_snapshot_featured_badge() from public, anon, authenticated;
drop trigger if exists leaderboard_snapshots_ica_featured_badge on public.leaderboard_snapshots;
create trigger leaderboard_snapshots_ica_featured_badge
  before insert or update of payload on public.leaderboard_snapshots
  for each row execute function public.ica_snapshot_featured_badge();

-- Preserve the existing leaderboard calculations while extending their RPC return contracts.
alter function public.get_monthly_streak_leaderboard(integer) rename to get_monthly_streak_leaderboard_core;
revoke all on function public.get_monthly_streak_leaderboard_core(integer) from public, anon, authenticated;
create function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint, user_id uuid, username text, display_name text, ica_streak_days integer,
  avg_percent numeric, review_percent numeric, creation_percent numeric, is_creation_streak_frozen boolean,
  ica_test_points numeric, listening_points numeric, preguntica_points numeric,
  instagram_points numeric, total_points numeric, featured_badge text
)
language sql
security definer
set search_path = public
as $$
  select core.rank, core.user_id, core.username, core.display_name, core.ica_streak_days,
    core.avg_percent, core.review_percent, core.creation_percent, core.is_creation_streak_frozen,
    core.ica_test_points, core.listening_points, core.preguntica_points, core.instagram_points,
    core.total_points, p.featured_badge
  from public.get_monthly_streak_leaderboard_core(limit_count) core
  left join public.profiles p on p.id = core.user_id
$$;
revoke all on function public.get_monthly_streak_leaderboard(integer) from public, anon;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

alter function public.get_monthly_snapshot_leaderboard(date, integer, uuid) rename to get_monthly_snapshot_leaderboard_core;
revoke all on function public.get_monthly_snapshot_leaderboard_core(date, integer, uuid) from public, anon, authenticated;
create function public.get_monthly_snapshot_leaderboard(
  p_period_start date,
  limit_count integer default 33,
  include_user_id uuid default auth.uid()
)
returns table (
  rank bigint, user_id uuid, username text, display_name text, ica_streak_days integer,
  avg_percent numeric, review_percent numeric, creation_percent numeric, ica_test_points numeric,
  listening_points numeric, preguntica_points numeric, instagram_points numeric,
  total_points numeric, score integer, featured_badge text
)
language sql
security definer
set search_path = public
as $$
  select core.rank, core.user_id, core.username, core.display_name, core.ica_streak_days,
    core.avg_percent, core.review_percent, core.creation_percent, core.ica_test_points,
    core.listening_points, core.preguntica_points, core.instagram_points, core.total_points,
    core.score, ls.payload ->> 'featured_badge'
  from public.get_monthly_snapshot_leaderboard_core(p_period_start, limit_count, include_user_id) core
  left join public.leaderboard_snapshots ls
    on ls.period = 'monthly' and ls.period_start = p_period_start and ls.user_id = core.user_id
$$;
revoke all on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) from public, anon;
grant execute on function public.get_monthly_snapshot_leaderboard(date, integer, uuid) to authenticated;

create or replace function public.ica_assert_note_challenge_eligibility(p_user_id uuid, p_note_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_notes integer;
  note_duration bigint;
begin
  select count(*)::integer into closed_notes
  from public.master_notes mn
  where mn.user_id = p_user_id and mn.state = 'closed';
  if closed_notes < 2 then raise exception 'NOTE_CHALLENGE_NEEDS_TWO_CLOSED_NOTES'; end if;

  select mn.total_duration_ms into note_duration
  from public.master_notes mn
  where mn.id = p_note_id and mn.user_id = p_user_id and mn.state = 'closed';
  if not found then raise exception 'MASTER_NOTE_NOT_CLOSED'; end if;
  return coalesce(note_duration, 0);
end;
$$;
revoke all on function public.ica_assert_note_challenge_eligibility(uuid, uuid) from public, anon, authenticated;

create or replace function public.bump_master_note_challenge_listening(
  p_note_id uuid,
  p_day date,
  p_delta_seconds double precision
)
returns table (listened_seconds double precision, unlocked boolean, just_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_duration_ms bigint;
  local_day date;
  week_day date;
  cap_seconds double precision;
  needed_seconds double precision;
  delta_seconds double precision;
  elapsed_seconds double precision;
  last_update_at timestamptz;
  before_unlocked boolean;
  unlock_row public.master_note_challenge_unlocks%rowtype;
begin
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Keep the historical argument for app compatibility; its value never chooses the week.
  if p_day is null then raise exception 'DAY_REQUIRED'; end if;
  v_duration_ms := public.ica_assert_note_challenge_eligibility(v_user_id, p_note_id);
  local_day := public.ica_local_today(v_user_id);
  week_day := local_day - (extract(isodow from local_day)::integer - 1);
  perform pg_advisory_xact_lock(hashtextextended('ica-note-challenge:' || v_user_id::text || ':' || week_day::text, 0));

  cap_seconds := greatest(coalesce(v_duration_ms, 0), 0) / 1000.0;
  needed_seconds := cap_seconds * 0.8;

  insert into public.master_note_challenge_unlocks as u (user_id, note_id, day, listened_seconds, updated_at)
  values (v_user_id, p_note_id, week_day, 0, clock_timestamp() - interval '15 seconds')
  on conflict (user_id, note_id, day) do nothing;

  select u.unlocked_at is not null, u.updated_at into before_unlocked, last_update_at
  from public.master_note_challenge_unlocks u
  where u.user_id = v_user_id and u.note_id = p_note_id and u.day = week_day
  for update;

  elapsed_seconds := greatest(0, extract(epoch from (clock_timestamp() - last_update_at)) + 5);
  delta_seconds := least(greatest(coalesce(p_delta_seconds, 0), 0), 120, elapsed_seconds);

  update public.master_note_challenge_unlocks u
  set listened_seconds = least(u.listened_seconds + delta_seconds, cap_seconds),
      unlocked_at = coalesce(
        u.unlocked_at,
        case when needed_seconds > 0 and least(u.listened_seconds + delta_seconds, cap_seconds) >= needed_seconds
          then now() else null end
      ),
      updated_at = now()
  where u.user_id = v_user_id and u.note_id = p_note_id and u.day = week_day
  returning u.* into unlock_row;

  listened_seconds := unlock_row.listened_seconds;
  unlocked := unlock_row.unlocked_at is not null;
  just_unlocked := unlocked and not coalesce(before_unlocked, false);
  return next;
end;
$$;
revoke all on function public.bump_master_note_challenge_listening(uuid, date, double precision) from public, anon;
grant execute on function public.bump_master_note_challenge_listening(uuid, date, double precision) to authenticated;

create or replace function public.record_master_note_challenge_play(
  p_note_id uuid,
  p_day date,
  p_correct integer,
  p_total integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
begin
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- Keep the historical argument for app compatibility; its value never chooses the day.
  if p_day is null then raise exception 'DAY_REQUIRED'; end if;
  perform public.ica_assert_note_challenge_eligibility(v_user_id, p_note_id);
  if p_total is null or p_total <= 0 or p_correct is null or p_correct < 0 or p_correct > p_total then
    raise exception 'NOTE_CHALLENGE_RESULT_INVALID';
  end if;
  local_day := public.ica_local_today(v_user_id);
  insert into public.master_note_challenge_plays (user_id, note_id, day, correct, total)
  values (v_user_id, p_note_id, local_day, p_correct, p_total);
end;
$$;
revoke all on function public.record_master_note_challenge_play(uuid, date, integer, integer) from public, anon;
grant execute on function public.record_master_note_challenge_play(uuid, date, integer, integer) to authenticated;

create or replace function public.get_my_master_note_challenge_unlocks(p_note_ids uuid[])
returns table (note_id uuid, listened_seconds double precision, unlocked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  local_day date;
  week_day date;
  closed_notes integer;
begin
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select count(*)::integer into closed_notes
  from public.master_notes mn where mn.user_id = v_user_id and mn.state = 'closed';
  if closed_notes < 2 then return; end if;
  local_day := public.ica_local_today(v_user_id);
  week_day := local_day - (extract(isodow from local_day)::integer - 1);
  return query
  select u.note_id, u.listened_seconds, u.unlocked_at
  from public.master_note_challenge_unlocks u
  join public.master_notes mn on mn.id = u.note_id and mn.user_id = v_user_id and mn.state = 'closed'
  where u.user_id = v_user_id and u.day = week_day
    and (p_note_ids is null or u.note_id = any(p_note_ids));
end;
$$;
revoke all on function public.get_my_master_note_challenge_unlocks(uuid[]) from public, anon;
grant execute on function public.get_my_master_note_challenge_unlocks(uuid[]) to authenticated;
revoke select on public.master_note_challenge_unlocks from anon, authenticated;

commit;
