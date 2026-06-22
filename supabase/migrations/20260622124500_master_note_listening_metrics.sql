begin;

create table if not exists public.master_note_listening_daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  target_lang text not null,
  native_lang text not null,
  listened_seconds integer not null default 0 check (listened_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, target_lang, native_lang)
);

create index if not exists master_note_listening_daily_metrics_user_day_idx
  on public.master_note_listening_daily_metrics (user_id, day desc);

create index if not exists master_note_listening_daily_metrics_user_lang_day_idx
  on public.master_note_listening_daily_metrics (user_id, target_lang, native_lang, day desc);

drop trigger if exists master_note_listening_daily_metrics_set_updated_at on public.master_note_listening_daily_metrics;
create trigger master_note_listening_daily_metrics_set_updated_at
before update on public.master_note_listening_daily_metrics
for each row execute procedure public.set_updated_at();

alter table public.master_note_listening_daily_metrics enable row level security;

drop policy if exists "master_note_listening_daily_metrics_select_own" on public.master_note_listening_daily_metrics;
create policy "master_note_listening_daily_metrics_select_own"
on public.master_note_listening_daily_metrics
for select
using (auth.uid() = user_id);

create table if not exists public.master_note_listening_ingest_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  day date not null,
  target_lang text not null,
  native_lang text not null,
  delta_seconds integer not null check (delta_seconds >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists master_note_listening_ingest_log_created_at_idx
  on public.master_note_listening_ingest_log (created_at desc);

create or replace function public.bump_master_note_listening_metrics(
  p_event_id text,
  p_day date,
  p_target_lang text,
  p_native_lang text,
  p_delta_seconds integer default 0
)
returns table (
  listened_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  safe_delta integer;
  safe_target_lang text;
  safe_native_lang text;
  inserted_log boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_day is null then
    raise exception 'DAY_REQUIRED';
  end if;

  if coalesce(trim(p_event_id), '') = '' then
    raise exception 'EVENT_ID_REQUIRED';
  end if;

  safe_target_lang := lower(trim(coalesce(p_target_lang, '')));
  safe_native_lang := lower(trim(coalesce(p_native_lang, '')));
  safe_delta := greatest(coalesce(p_delta_seconds, 0), 0);

  if safe_target_lang = '' then
    raise exception 'TARGET_LANG_REQUIRED';
  end if;

  if safe_native_lang = '' then
    raise exception 'NATIVE_LANG_REQUIRED';
  end if;

  insert into public.master_note_listening_ingest_log (
    user_id,
    event_id,
    day,
    target_lang,
    native_lang,
    delta_seconds
  )
  values (
    current_user_id,
    trim(p_event_id),
    p_day,
    safe_target_lang,
    safe_native_lang,
    safe_delta
  )
  on conflict (user_id, event_id) do nothing;

  inserted_log := found;

  if inserted_log and safe_delta > 0 then
    insert into public.master_note_listening_daily_metrics (
      user_id,
      day,
      target_lang,
      native_lang,
      listened_seconds
    )
    values (
      current_user_id,
      p_day,
      safe_target_lang,
      safe_native_lang,
      safe_delta
    )
    on conflict (user_id, day, target_lang, native_lang)
    do update
    set listened_seconds = public.master_note_listening_daily_metrics.listened_seconds + safe_delta;
  end if;

  return query
  select mnl.listened_seconds
  from public.master_note_listening_daily_metrics mnl
  where mnl.user_id = current_user_id
    and mnl.day = p_day
    and mnl.target_lang = safe_target_lang
    and mnl.native_lang = safe_native_lang;
end;
$$;

revoke all on function public.bump_master_note_listening_metrics(text, date, text, text, integer) from public;
grant execute on function public.bump_master_note_listening_metrics(text, date, text, text, integer) to authenticated;

commit;
