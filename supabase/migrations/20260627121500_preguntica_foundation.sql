begin;

create table if not exists public.preguntica_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  timezone text not null default 'UTC',
  required_activation_words integer not null default 20 check (required_activation_words > 0),
  activation_words_count integer not null default 0 check (activation_words_count >= 0),
  is_unlocked boolean not null default false,
  unlocked_via text check (unlocked_via in ('progress', 'tokens', 'manual')),
  unlocked_at timestamptz,
  completed_attempt_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  check (week_end = week_start + 7),
  check ((is_unlocked and unlocked_via is not null) or (not is_unlocked and unlocked_via is null))
);

create index if not exists preguntica_weeks_user_week_idx
  on public.preguntica_weeks (user_id, week_start desc);

drop trigger if exists preguntica_weeks_set_updated_at on public.preguntica_weeks;
create trigger preguntica_weeks_set_updated_at
before update on public.preguntica_weeks
for each row execute procedure public.set_updated_at();

create table if not exists public.preguntica_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preguntica_week_id uuid not null references public.preguntica_weeks (id) on delete cascade,
  attempt_number integer not null check (attempt_number between 1 and 3),
  attempt_kind text not null default 'weekly' check (attempt_kind in ('weekly', 'token_unlock')),
  word_mode text not null default 'mixed',
  level text,
  target_lang text,
  native_lang text,
  question_audio_path text,
  question_text text,
  ica_words jsonb not null default '[]'::jsonb,
  response_text text,
  response_char_count integer check (response_char_count between 100 and 1200),
  transcript_text text,
  transcript_provider text,
  transcript_model text,
  analysis_provider text,
  analysis_model text,
  analysis_score numeric(4, 1),
  analysis_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending_response'
    check (status in ('pending_response', 'analyzing', 'analyzed', 'completed', 'failed')),
  retry_count integer not null default 0 check (retry_count between 0 and 3),
  suggestions_refresh_count integer not null default 0 check (suggestions_refresh_count between 0 and 3),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (preguntica_week_id, attempt_kind, attempt_number)
);

create index if not exists preguntica_attempts_user_week_idx
  on public.preguntica_attempts (user_id, preguntica_week_id, created_at desc);

drop trigger if exists preguntica_attempts_set_updated_at on public.preguntica_attempts;
create trigger preguntica_attempts_set_updated_at
before update on public.preguntica_attempts
for each row execute procedure public.set_updated_at();

alter table public.preguntica_weeks
  add constraint preguntica_weeks_completed_attempt_fk
  foreign key (completed_attempt_id)
  references public.preguntica_attempts (id)
  on delete set null;

create table if not exists public.preguntica_attempt_audios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preguntica_attempt_id uuid not null references public.preguntica_attempts (id) on delete cascade,
  storage_path text not null,
  duration_ms integer,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'transcribed', 'ready', 'failed')),
  transcription_text text,
  transcription_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_path)
);

create index if not exists preguntica_attempt_audios_attempt_idx
  on public.preguntica_attempt_audios (preguntica_attempt_id, created_at desc);

drop trigger if exists preguntica_attempt_audios_set_updated_at on public.preguntica_attempt_audios;
create trigger preguntica_attempt_audios_set_updated_at
before update on public.preguntica_attempt_audios
for each row execute procedure public.set_updated_at();

create table if not exists public.preguntica_feedback_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preguntica_attempt_id uuid not null references public.preguntica_attempts (id) on delete cascade,
  refresh_index integer not null check (refresh_index between 0 and 3),
  suggested_words jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  unique (preguntica_attempt_id, refresh_index)
);

create index if not exists preguntica_feedback_suggestions_attempt_idx
  on public.preguntica_feedback_suggestions (preguntica_attempt_id, created_at desc);

create table if not exists public.preguntica_token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type text not null check (entry_type in ('monthly_earn', 'redeem_unlock', 'manual_adjustment')),
  tokens_delta integer not null,
  reference_month date,
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists preguntica_token_ledger_user_created_idx
  on public.preguntica_token_ledger (user_id, created_at desc);

create unique index if not exists preguntica_token_ledger_monthly_unique
  on public.preguntica_token_ledger (user_id, entry_type, reference_month)
  where entry_type = 'monthly_earn';

create table if not exists public.preguntica_week_token_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preguntica_week_id uuid not null references public.preguntica_weeks (id) on delete cascade,
  tokens_spent integer not null check (tokens_spent > 0),
  ledger_entry_id uuid not null references public.preguntica_token_ledger (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (ledger_entry_id)
);

create index if not exists preguntica_week_token_unlocks_user_week_idx
  on public.preguntica_week_token_unlocks (user_id, preguntica_week_id, created_at desc);

alter table public.preguntica_weeks enable row level security;
alter table public.preguntica_attempts enable row level security;
alter table public.preguntica_attempt_audios enable row level security;
alter table public.preguntica_feedback_suggestions enable row level security;
alter table public.preguntica_token_ledger enable row level security;
alter table public.preguntica_week_token_unlocks enable row level security;

drop policy if exists "preguntica_weeks_all_own" on public.preguntica_weeks;
create policy "preguntica_weeks_all_own"
on public.preguntica_weeks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "preguntica_attempts_all_own" on public.preguntica_attempts;
create policy "preguntica_attempts_all_own"
on public.preguntica_attempts
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.preguntica_weeks pw
    where pw.id = preguntica_week_id
      and pw.user_id = auth.uid()
  )
);

drop policy if exists "preguntica_attempt_audios_all_own" on public.preguntica_attempt_audios;
create policy "preguntica_attempt_audios_all_own"
on public.preguntica_attempt_audios
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.preguntica_attempts pa
    where pa.id = preguntica_attempt_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "preguntica_feedback_suggestions_all_own" on public.preguntica_feedback_suggestions;
create policy "preguntica_feedback_suggestions_all_own"
on public.preguntica_feedback_suggestions
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.preguntica_attempts pa
    where pa.id = preguntica_attempt_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "preguntica_token_ledger_all_own" on public.preguntica_token_ledger;
create policy "preguntica_token_ledger_all_own"
on public.preguntica_token_ledger
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "preguntica_week_token_unlocks_all_own" on public.preguntica_week_token_unlocks;
create policy "preguntica_week_token_unlocks_all_own"
on public.preguntica_week_token_unlocks
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.preguntica_weeks pw
    where pw.id = preguntica_week_id
      and pw.user_id = auth.uid()
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'preguntica-audios',
  'preguntica-audios',
  false,
  15728640,
  array[
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/ogg;codecs=opus'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "preguntica_audio_select_own" on storage.objects;
create policy "preguntica_audio_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'preguntica-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "preguntica_audio_insert_own" on storage.objects;
create policy "preguntica_audio_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'preguntica-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "preguntica_audio_update_own" on storage.objects;
create policy "preguntica_audio_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'preguntica-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'preguntica-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "preguntica_audio_delete_own" on storage.objects;
create policy "preguntica_audio_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'preguntica-audios'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.get_my_preguntica_week_status(
  p_reference timestamptz default now()
)
returns table (
  week_id uuid,
  week_start date,
  week_end date,
  timezone text,
  required_activation_words integer,
  activation_words_count integer,
  is_unlocked boolean,
  unlocked_via text,
  unlocked_at timestamptz,
  completed_at timestamptz,
  attempts_used integer,
  token_unlocks_used integer,
  can_start boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  tz text;
  today_local date;
  current_week_start date;
  current_week_end date;
  previous_week_start date;
  previous_week_end date;
  previous_week_start_utc timestamptz;
  previous_week_end_utc timestamptz;
  words_count integer;
  progress_unlock boolean;
  v_week_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(tzn.name, 'UTC')
  into tz
  from public.profiles p
  left join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
  where p.id = current_user_id;

  tz := coalesce(tz, 'UTC');
  today_local := (coalesce(p_reference, now()) at time zone tz)::date;
  current_week_start := today_local - ((extract(dow from today_local)::integer - 5 + 7) % 7);
  current_week_end := current_week_start + 7;
  previous_week_start := current_week_start - 7;
  previous_week_end := current_week_start;
  previous_week_start_utc := previous_week_start::timestamp at time zone tz;
  previous_week_end_utc := previous_week_end::timestamp at time zone tz;

  select count(distinct pla.lexicard_id)::integer
  into words_count
  from public.phrase_lexicard_activations pla
  where pla.user_id = current_user_id
    and pla.created_at >= previous_week_start_utc
    and pla.created_at < previous_week_end_utc;

  words_count := coalesce(words_count, 0);
  progress_unlock := words_count >= 20;

  insert into public.preguntica_weeks (
    user_id,
    week_start,
    week_end,
    timezone,
    required_activation_words,
    activation_words_count,
    is_unlocked,
    unlocked_via,
    unlocked_at
  )
  values (
    current_user_id,
    current_week_start,
    current_week_end,
    tz,
    20,
    words_count,
    progress_unlock,
    case when progress_unlock then 'progress' else null end,
    case when progress_unlock then now() else null end
  )
  on conflict (user_id, week_start)
  do update
  set
    week_end = excluded.week_end,
    timezone = excluded.timezone,
    required_activation_words = excluded.required_activation_words,
    activation_words_count = excluded.activation_words_count,
    is_unlocked = case
      when public.preguntica_weeks.is_unlocked then true
      else excluded.is_unlocked
    end,
    unlocked_via = case
      when public.preguntica_weeks.is_unlocked then public.preguntica_weeks.unlocked_via
      when excluded.is_unlocked then excluded.unlocked_via
      else null
    end,
    unlocked_at = case
      when public.preguntica_weeks.unlocked_at is not null then public.preguntica_weeks.unlocked_at
      when excluded.is_unlocked then now()
      else null
    end,
    updated_at = now()
  returning id into v_week_id;

  return query
  with usage_stats as (
    select
      (
        select count(*)::integer
        from public.preguntica_attempts pa
        where pa.preguntica_week_id = v_week_id
          and pa.user_id = current_user_id
          and pa.attempt_kind = 'weekly'
      ) as attempts_used,
      (
        select count(*)::integer
        from public.preguntica_week_token_unlocks pwtu
        where pwtu.preguntica_week_id = v_week_id
          and pwtu.user_id = current_user_id
      ) as token_unlocks_used
  )
  select
    pw.id,
    pw.week_start,
    pw.week_end,
    pw.timezone,
    pw.required_activation_words,
    pw.activation_words_count,
    pw.is_unlocked,
    pw.unlocked_via,
    pw.unlocked_at,
    pw.completed_at,
    us.attempts_used,
    us.token_unlocks_used,
    pw.is_unlocked
      and pw.completed_at is null
      and us.attempts_used < 3
  from public.preguntica_weeks pw
  cross join usage_stats us
  where pw.id = v_week_id;
end;
$$;

revoke all on function public.get_my_preguntica_week_status(timestamptz) from public;
grant execute on function public.get_my_preguntica_week_status(timestamptz) to authenticated;

create or replace function public.create_preguntica_attempt(
  p_word_mode text,
  p_reference timestamptz default now()
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  status_row record;
  mode_normalized text;
  new_attempt public.preguntica_attempts;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  mode_normalized := lower(trim(coalesce(p_word_mode, 'mixed')));
  if mode_normalized = '' then
    mode_normalized := 'mixed';
  end if;

  select *
  into status_row
  from public.get_my_preguntica_week_status(p_reference);

  if coalesce(status_row.is_unlocked, false) is false then
    raise exception 'WEEK_LOCKED_NOT_ENOUGH_ACTIVATIONS';
  end if;

  if status_row.completed_at is not null then
    raise exception 'WEEK_ALREADY_COMPLETED';
  end if;

  if coalesce(status_row.attempts_used, 0) >= 3 then
    raise exception 'WEEK_ATTEMPT_LIMIT_REACHED';
  end if;

  insert into public.preguntica_attempts (
    user_id,
    preguntica_week_id,
    attempt_number,
    attempt_kind,
    word_mode,
    status
  )
  values (
    current_user_id,
    status_row.week_id,
    status_row.attempts_used + 1,
    'weekly',
    mode_normalized,
    'pending_response'
  )
  returning *
  into new_attempt;

  return new_attempt;
end;
$$;

revoke all on function public.create_preguntica_attempt(text, timestamptz) from public;
grant execute on function public.create_preguntica_attempt(text, timestamptz) to authenticated;

create or replace function public.complete_preguntica_attempt(
  p_attempt_id uuid
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  attempt_row public.preguntica_attempts;
  completed_week_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_attempt_id is null then
    raise exception 'ATTEMPT_REQUIRED';
  end if;

  select *
  into attempt_row
  from public.preguntica_attempts pa
  where pa.id = p_attempt_id
    and pa.user_id = current_user_id
  for update;

  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  if attempt_row.status = 'failed' then
    raise exception 'FAILED_ATTEMPT_CANNOT_BE_COMPLETED';
  end if;

  update public.preguntica_attempts pa
  set
    status = 'completed',
    updated_at = now()
  where pa.id = attempt_row.id
  returning *
  into attempt_row;

  update public.preguntica_weeks pw
  set
    completed_attempt_id = attempt_row.id,
    completed_at = coalesce(pw.completed_at, now()),
    updated_at = now()
  where pw.id = attempt_row.preguntica_week_id
    and pw.user_id = current_user_id
    and (pw.completed_attempt_id is null or pw.completed_attempt_id = attempt_row.id)
  returning pw.id
  into completed_week_id;

  if completed_week_id is null then
    raise exception 'WEEK_ALREADY_COMPLETED_WITH_ANOTHER_ATTEMPT';
  end if;

  return attempt_row;
end;
$$;

revoke all on function public.complete_preguntica_attempt(uuid) from public;
grant execute on function public.complete_preguntica_attempt(uuid) to authenticated;

create or replace function public.get_my_preguntica_token_balance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  balance integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(sum(ptl.tokens_delta), 0)::integer
  into balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  return coalesce(balance, 0);
end;
$$;

revoke all on function public.get_my_preguntica_token_balance() from public;
grant execute on function public.get_my_preguntica_token_balance() to authenticated;

create or replace function public.redeem_preguntica_tokens_for_week(
  p_week_start date,
  p_tokens_to_spend integer default 2
)
returns table (
  unlock_id uuid,
  week_id uuid,
  spent_tokens integer,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  target_week_id uuid;
  target_week_completed_at timestamptz;
  spent integer;
  current_balance integer;
  ledger_id uuid;
  new_unlock_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_week_start is null then
    raise exception 'WEEK_START_REQUIRED';
  end if;

  spent := coalesce(p_tokens_to_spend, 2);
  if spent <> 2 then
    raise exception 'REDEEM_COST_MUST_BE_2_TOKENS';
  end if;

  select pw.id, pw.completed_at
  into target_week_id, target_week_completed_at
  from public.preguntica_weeks pw
  where pw.user_id = current_user_id
    and pw.week_start = p_week_start
  for update;

  if target_week_id is null then
    raise exception 'WEEK_NOT_FOUND';
  end if;

  if target_week_completed_at is null then
    raise exception 'WEEK_MUST_BE_COMPLETED_BEFORE_REDEEM';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text || ':preguntica_tokens'));

  select coalesce(sum(ptl.tokens_delta), 0)::integer
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  if current_balance < spent then
    raise exception 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.preguntica_token_ledger (
    user_id,
    entry_type,
    tokens_delta,
    reference_type,
    reference_id,
    metadata
  )
  values (
    current_user_id,
    'redeem_unlock',
    -spent,
    'preguntica_week',
    target_week_id,
    jsonb_build_object('week_start', p_week_start)
  )
  returning id
  into ledger_id;

  insert into public.preguntica_week_token_unlocks (
    user_id,
    preguntica_week_id,
    tokens_spent,
    ledger_entry_id
  )
  values (
    current_user_id,
    target_week_id,
    spent,
    ledger_id
  )
  returning id
  into new_unlock_id;

  select coalesce(sum(ptl.tokens_delta), 0)::integer
  into current_balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = current_user_id;

  return query
  select
    new_unlock_id,
    target_week_id,
    spent,
    current_balance;
end;
$$;

revoke all on function public.redeem_preguntica_tokens_for_week(date, integer) from public;
grant execute on function public.redeem_preguntica_tokens_for_week(date, integer) to authenticated;

create or replace function public.grant_preguntica_monthly_tokens(
  p_user_id uuid,
  p_month_start date,
  p_points numeric
)
returns table (
  granted_tokens integer,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  points_value numeric;
  tokens_to_grant integer;
  balance integer;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_month_start is null then
    raise exception 'MONTH_REQUIRED';
  end if;

  month_start := date_trunc('month', p_month_start::timestamp)::date;
  points_value := greatest(coalesce(p_points, 0), 0);
  tokens_to_grant := floor(points_value)::integer;

  insert into public.preguntica_token_ledger (
    user_id,
    entry_type,
    tokens_delta,
    reference_month,
    reference_type,
    metadata
  )
  values (
    p_user_id,
    'monthly_earn',
    tokens_to_grant,
    month_start,
    'monthly_points',
    jsonb_build_object('points', points_value)
  )
  on conflict (user_id, entry_type, reference_month)
  where entry_type = 'monthly_earn'
  do update
  set
    tokens_delta = excluded.tokens_delta,
    metadata = excluded.metadata,
    created_at = public.preguntica_token_ledger.created_at;

  select coalesce(sum(ptl.tokens_delta), 0)::integer
  into balance
  from public.preguntica_token_ledger ptl
  where ptl.user_id = p_user_id;

  return query
  select
    tokens_to_grant,
    balance;
end;
$$;

revoke all on function public.grant_preguntica_monthly_tokens(uuid, date, numeric) from public;
grant execute on function public.grant_preguntica_monthly_tokens(uuid, date, numeric) to service_role;

commit;
