begin;

create table if not exists public.lexicard_example_jobs (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  lexicard_id uuid not null references public.lexicards (id) on delete cascade,
  target_word text not null,
  native_meaning text not null,
  target_lang text not null,
  native_lang text not null,
  cefr_level text not null default 'A2',
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 6,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lexicard_id)
);

create index if not exists lexicard_example_jobs_user_status_idx
  on public.lexicard_example_jobs (user_id, status, next_run_at);

create index if not exists lexicard_example_jobs_status_next_run_idx
  on public.lexicard_example_jobs (status, next_run_at);

drop trigger if exists lexicard_example_jobs_set_updated_at on public.lexicard_example_jobs;
create trigger lexicard_example_jobs_set_updated_at
before update on public.lexicard_example_jobs
for each row execute procedure public.set_updated_at();

create or replace function public.enqueue_lexicard_example_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_target_lang text;
  resolved_native_lang text;
  resolved_level text;
begin
  if new.example_phrase is not null and new.example_translation is not null then
    return new;
  end if;

  resolved_target_lang := nullif(trim(coalesce(new.target_lang, '')), '');
  resolved_native_lang := nullif(trim(coalesce(new.native_lang, '')), '');

  if resolved_target_lang is null or resolved_native_lang is null then
    select
      nullif(trim(coalesce(us.target_lang, '')), ''),
      nullif(trim(coalesce(us.native_lang, '')), ''),
      nullif(trim(coalesce(us.cefr_level, '')), '')
    into
      resolved_target_lang,
      resolved_native_lang,
      resolved_level
    from public.user_settings us
    where us.user_id = new.user_id;
  else
    select nullif(trim(coalesce(us.cefr_level, '')), '')
    into resolved_level
    from public.user_settings us
    where us.user_id = new.user_id;
  end if;

  if resolved_target_lang is null then
    resolved_target_lang := 'English';
  end if;

  if resolved_native_lang is null then
    resolved_native_lang := 'Spanish';
  end if;

  if resolved_level is null then
    resolved_level := 'A2';
  end if;

  insert into public.lexicard_example_jobs (
    user_id,
    lexicard_id,
    target_word,
    native_meaning,
    target_lang,
    native_lang,
    cefr_level,
    status,
    attempts,
    next_run_at
  )
  values (
    new.user_id,
    new.id,
    new.target,
    new.native,
    resolved_target_lang,
    resolved_native_lang,
    resolved_level,
    'pending',
    0,
    now()
  )
  on conflict (lexicard_id)
  do nothing;

  return new;
end;
$$;

drop trigger if exists lexicards_enqueue_example_job_trigger on public.lexicards;
create trigger lexicards_enqueue_example_job_trigger
after insert on public.lexicards
for each row execute procedure public.enqueue_lexicard_example_job();

create or replace function public.requeue_stale_lexicard_example_jobs(
  p_stale_before interval default interval '5 minutes'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.lexicard_example_jobs j
  set
    status = case
      when j.attempts >= j.max_attempts then 'failed'
      else 'retry'
    end,
    next_run_at = case
      when j.attempts >= j.max_attempts then j.next_run_at
      else now()
    end,
    last_error = case
      when coalesce(j.last_error, '') = '' then 'Job processing timeout'
      else j.last_error
    end,
    locked_at = null,
    updated_at = now()
  where j.user_id = auth.uid()
    and j.status = 'processing'
    and j.locked_at is not null
    and j.locked_at < now() - p_stale_before;

  get diagnostics updated_count = row_count;
  return coalesce(updated_count, 0);
end;
$$;

create or replace function public.claim_lexicard_example_jobs(
  p_limit integer default 3
)
returns table (
  id bigint,
  lexicard_id uuid,
  target_word text,
  native_meaning text,
  target_lang text,
  native_lang text,
  cefr_level text,
  attempts integer,
  max_attempts integer
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  with candidates as (
    select j.id
    from public.lexicard_example_jobs j
    where j.user_id = auth.uid()
      and j.status in ('pending', 'retry')
      and j.next_run_at <= now()
    order by j.next_run_at asc, j.id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 20))
  )
  update public.lexicard_example_jobs j
  set
    status = 'processing',
    attempts = j.attempts + 1,
    locked_at = now(),
    last_error = null,
    updated_at = now()
  from candidates c
  where j.id = c.id
  returning
    j.id,
    j.lexicard_id,
    j.target_word,
    j.native_meaning,
    j.target_lang,
    j.native_lang,
    j.cefr_level,
    j.attempts,
    j.max_attempts;
end;
$$;

revoke all on function public.requeue_stale_lexicard_example_jobs(interval) from public;
grant execute on function public.requeue_stale_lexicard_example_jobs(interval) to authenticated;

revoke all on function public.claim_lexicard_example_jobs(integer) from public;
grant execute on function public.claim_lexicard_example_jobs(integer) to authenticated;

alter table public.lexicard_example_jobs enable row level security;

drop policy if exists "lexicard_example_jobs_all_own" on public.lexicard_example_jobs;
create policy "lexicard_example_jobs_all_own"
on public.lexicard_example_jobs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into public.lexicard_example_jobs (
  user_id,
  lexicard_id,
  target_word,
  native_meaning,
  target_lang,
  native_lang,
  cefr_level,
  status,
  attempts,
  next_run_at
)
select
  l.user_id,
  l.id,
  l.target,
  l.native,
  coalesce(nullif(trim(l.target_lang), ''), us.target_lang, 'English') as target_lang,
  coalesce(nullif(trim(l.native_lang), ''), us.native_lang, 'Spanish') as native_lang,
  coalesce(nullif(trim(us.cefr_level), ''), 'A2') as cefr_level,
  'pending',
  0,
  now()
from public.lexicards l
left join public.user_settings us
  on us.user_id = l.user_id
where (l.example_phrase is null or l.example_translation is null)
on conflict (lexicard_id)
do nothing;

commit;
