begin;

create table if not exists public.preguntica_question_bank (
  id uuid primary key default gen_random_uuid(),
  question_es text not null,
  question_es_normalized text generated always as (lower(trim(question_es))) stored,
  translations jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(question_es)) > 0)
);

alter table public.preguntica_question_bank
  add constraint preguntica_question_bank_question_es_normalized_key
  unique (question_es_normalized);

create index if not exists preguntica_question_bank_active_idx
  on public.preguntica_question_bank (is_active, created_at desc);

drop trigger if exists preguntica_question_bank_set_updated_at on public.preguntica_question_bank;
create trigger preguntica_question_bank_set_updated_at
before update on public.preguntica_question_bank
for each row execute procedure public.set_updated_at();

alter table public.preguntica_attempts
  add column if not exists question_id uuid;

alter table public.preguntica_attempts
  drop constraint if exists preguntica_attempts_question_id_fkey;

alter table public.preguntica_attempts
  add constraint preguntica_attempts_question_id_fkey
  foreign key (question_id)
  references public.preguntica_question_bank (id)
  on delete set null;

alter table public.preguntica_question_bank enable row level security;

drop policy if exists "preguntica_question_bank_select_super_admin" on public.preguntica_question_bank;
create policy "preguntica_question_bank_select_super_admin"
on public.preguntica_question_bank
for select
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

drop policy if exists "preguntica_question_bank_insert_super_admin" on public.preguntica_question_bank;
create policy "preguntica_question_bank_insert_super_admin"
on public.preguntica_question_bank
for insert
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

drop policy if exists "preguntica_question_bank_update_super_admin" on public.preguntica_question_bank;
create policy "preguntica_question_bank_update_super_admin"
on public.preguntica_question_bank
for update
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
)
with check (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

drop policy if exists "preguntica_question_bank_delete_super_admin" on public.preguntica_question_bank;
create policy "preguntica_question_bank_delete_super_admin"
on public.preguntica_question_bank
for delete
using (
  exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and a.role = 'super_admin'
  )
);

create or replace function public.pick_preguntica_question(
  p_target_lang text
)
returns table (
  question_id uuid,
  question_es text,
  question_target text,
  needs_translation boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  lang_key text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  lang_key := lower(trim(coalesce(p_target_lang, '')));
  if lang_key = '' then
    raise exception 'TARGET_LANG_REQUIRED';
  end if;

  return query
  with candidate as (
    select
      q.id,
      q.question_es,
      case
        when lang_key in ('es', 'espanol', 'español', 'spanish') then q.question_es
        else coalesce(q.translations ->> lang_key, '')
      end as cached_target,
      (
        select max(pa.created_at)
        from public.preguntica_attempts pa
        where pa.user_id = current_user_id
          and pa.question_id = q.id
      ) as last_used_at,
      exists (
        select 1
        from public.preguntica_attempts pa
        where pa.user_id = current_user_id
          and pa.question_id = q.id
      ) as already_used
    from public.preguntica_question_bank q
    where q.is_active
  ),
  selected as (
    select *
    from candidate
    order by
      already_used asc,
      last_used_at asc nulls first,
      random()
    limit 1
  )
  select
    s.id,
    s.question_es,
    case when s.cached_target = '' then null else s.cached_target end,
    case
      when lang_key in ('es', 'espanol', 'español', 'spanish') then false
      else s.cached_target = ''
    end
  from selected s;

  if not found then
    raise exception 'QUESTION_BANK_EMPTY';
  end if;
end;
$$;

revoke all on function public.pick_preguntica_question(text) from public;
grant execute on function public.pick_preguntica_question(text) to authenticated;

create or replace function public.save_preguntica_question_translation(
  p_question_id uuid,
  p_target_lang text,
  p_translation text
)
returns public.preguntica_question_bank
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  lang_key text;
  translation_text text;
  updated_row public.preguntica_question_bank;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_question_id is null then
    raise exception 'QUESTION_ID_REQUIRED';
  end if;

  lang_key := lower(trim(coalesce(p_target_lang, '')));
  if lang_key = '' then
    raise exception 'TARGET_LANG_REQUIRED';
  end if;

  translation_text := trim(coalesce(p_translation, ''));
  if translation_text = '' then
    raise exception 'TRANSLATION_REQUIRED';
  end if;

  update public.preguntica_question_bank q
  set
    translations = coalesce(q.translations, '{}'::jsonb) || jsonb_build_object(lang_key, translation_text),
    updated_at = now()
  where q.id = p_question_id
  returning q.*
  into updated_row;

  if updated_row.id is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.save_preguntica_question_translation(uuid, text, text) from public;
grant execute on function public.save_preguntica_question_translation(uuid, text, text) to authenticated;

commit;
