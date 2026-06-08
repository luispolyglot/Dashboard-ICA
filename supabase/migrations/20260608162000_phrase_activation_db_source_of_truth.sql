begin;

alter table public.phrase_generations
  add column if not exists source_words_v2 jsonb;

create table if not exists public.phrase_lexicard_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase_generation_id uuid not null references public.phrase_generations (id) on delete cascade,
  lexicard_id uuid not null references public.lexicards (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  uses_count integer not null default 1 check (uses_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phrase_generation_id, lexicard_id)
);

create index if not exists phrase_lexicard_activations_user_lang_idx
  on public.phrase_lexicard_activations (user_id, target_lang, native_lang);

create index if not exists phrase_lexicard_activations_lexicard_idx
  on public.phrase_lexicard_activations (lexicard_id);

drop trigger if exists phrase_lexicard_activations_set_updated_at on public.phrase_lexicard_activations;
create trigger phrase_lexicard_activations_set_updated_at
before update on public.phrase_lexicard_activations
for each row execute procedure public.set_updated_at();

alter table public.phrase_lexicard_activations enable row level security;

drop policy if exists "phrase_lexicard_activations_all_own" on public.phrase_lexicard_activations;
create policy "phrase_lexicard_activations_all_own"
on public.phrase_lexicard_activations
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.phrase_generations pg
    where pg.id = phrase_generation_id
      and pg.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.lexicards l
    where l.id = lexicard_id
      and l.user_id = auth.uid()
  )
);

create or replace function public.lexicards_protect_activation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.activation_count := greatest(coalesce(new.activation_count, 0), 0);

  if new.activation_count = 0 then
    new.first_activated_at := null;
    new.last_activated_at := null;
    return new;
  end if;

  new.first_activated_at := coalesce(new.first_activated_at, old.first_activated_at, now());
  new.last_activated_at := coalesce(new.last_activated_at, old.last_activated_at, new.first_activated_at);

  if new.first_activated_at > new.last_activated_at then
    new.last_activated_at := new.first_activated_at;
  end if;

  return new;
end;
$$;

create or replace function public.recompute_lexicard_activation_metrics_for_user_lang(
  p_user_id uuid,
  p_target_lang text,
  p_native_lang text
)
returns table (activation_words_total integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lang_norm text;
  native_lang_norm text;
  active_words integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  target_lang_norm := trim(coalesce(p_target_lang, ''));
  native_lang_norm := trim(coalesce(p_native_lang, ''));

  if target_lang_norm = '' or native_lang_norm = '' then
    raise exception 'LANG_REQUIRED';
  end if;

  with aggregated as (
    select
      pla.lexicard_id,
      sum(pla.uses_count)::integer as total_uses,
      min(pla.created_at) as first_activated_at,
      max(pla.created_at) as last_activated_at
    from public.phrase_lexicard_activations pla
    where pla.user_id = p_user_id
      and lower(trim(pla.target_lang)) = lower(target_lang_norm)
      and lower(trim(pla.native_lang)) = lower(native_lang_norm)
    group by pla.lexicard_id
  )
  update public.lexicards l
  set
    activation_count = coalesce((select a.total_uses from aggregated a where a.lexicard_id = l.id), 0),
    first_activated_at = (select a.first_activated_at from aggregated a where a.lexicard_id = l.id),
    last_activated_at = (select a.last_activated_at from aggregated a where a.lexicard_id = l.id)
  where l.user_id = p_user_id
    and lower(trim(coalesce(l.target_lang, ''))) = lower(target_lang_norm)
    and lower(trim(coalesce(l.native_lang, ''))) = lower(native_lang_norm);

  select count(*)::integer
  into active_words
  from public.lexicards l
  where l.user_id = p_user_id
    and lower(trim(coalesce(l.target_lang, ''))) = lower(target_lang_norm)
    and lower(trim(coalesce(l.native_lang, ''))) = lower(native_lang_norm)
    and coalesce(l.activation_count, 0) > 0;

  update public.user_meta_tracker umt
  set activation_words_total = active_words
  where umt.user_id = p_user_id
    and lower(trim(umt.target_lang)) = lower(target_lang_norm)
    and lower(trim(umt.native_lang)) = lower(native_lang_norm);

  if not found and active_words > 0 then
    insert into public.user_meta_tracker (
      user_id,
      target_lang,
      native_lang,
      activation_words_total
    )
    values (
      p_user_id,
      target_lang_norm,
      native_lang_norm,
      active_words
    )
    on conflict (user_id, target_lang, native_lang)
    do update set
      activation_words_total = excluded.activation_words_total;
  end if;

  return query select active_words;
end;
$$;

revoke all on function public.recompute_lexicard_activation_metrics_for_user_lang(uuid, text, text) from public;
grant execute on function public.recompute_lexicard_activation_metrics_for_user_lang(uuid, text, text) to authenticated;

create or replace function public.register_phrase_lexicard_activations(
  p_phrase_generation_id uuid,
  p_lexicard_ids uuid[],
  p_target_lang text,
  p_native_lang text
)
returns table (activation_words_total integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid;
  phrase_exists boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_phrase_generation_id is null then
    raise exception 'PHRASE_REQUIRED';
  end if;

  select exists (
    select 1
    from public.phrase_generations pg
    where pg.id = p_phrase_generation_id
      and pg.user_id = current_user_id
  )
  into phrase_exists;

  if not phrase_exists then
    raise exception 'PHRASE_NOT_FOUND';
  end if;

  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  valid as (
    select
      l.id as lexicard_id,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where lower(trim(coalesce(l.target_lang, p_target_lang, ''))) = lower(trim(coalesce(p_target_lang, '')))
      and lower(trim(coalesce(l.native_lang, p_native_lang, ''))) = lower(trim(coalesce(p_native_lang, '')))
  )
  insert into public.phrase_lexicard_activations (
    user_id,
    phrase_generation_id,
    lexicard_id,
    target_lang,
    native_lang,
    uses_count
  )
  select
    current_user_id,
    p_phrase_generation_id,
    v.lexicard_id,
    trim(coalesce(p_target_lang, '')),
    trim(coalesce(p_native_lang, '')),
    v.uses
  from valid v
  on conflict (phrase_generation_id, lexicard_id)
  do update set
    uses_count = excluded.uses_count,
    target_lang = excluded.target_lang,
    native_lang = excluded.native_lang,
    updated_at = now();

  with expanded as (
    select
      input_id as lexicard_id,
      count(*)::integer as uses
    from unnest(coalesce(p_lexicard_ids, array[]::uuid[])) as input_id
    group by input_id
  ),
  valid as (
    select
      l.id as lexicard_id,
      e.uses
    from expanded e
    join public.lexicards l
      on l.id = e.lexicard_id
     and l.user_id = current_user_id
    where lower(trim(coalesce(l.target_lang, p_target_lang, ''))) = lower(trim(coalesce(p_target_lang, '')))
      and lower(trim(coalesce(l.native_lang, p_native_lang, ''))) = lower(trim(coalesce(p_native_lang, '')))
  )
  delete from public.phrase_lexicard_activations pla
  where pla.user_id = current_user_id
    and pla.phrase_generation_id = p_phrase_generation_id
    and lower(trim(pla.target_lang)) = lower(trim(coalesce(p_target_lang, '')))
    and lower(trim(pla.native_lang)) = lower(trim(coalesce(p_native_lang, '')))
    and not exists (
      select 1
      from valid v
      where v.lexicard_id = pla.lexicard_id
    );

  return query
  select *
  from public.recompute_lexicard_activation_metrics_for_user_lang(
    current_user_id,
    trim(coalesce(p_target_lang, '')),
    trim(coalesce(p_native_lang, ''))
  );
end;
$$;

revoke all on function public.register_phrase_lexicard_activations(uuid, uuid[], text, text) from public;
grant execute on function public.register_phrase_lexicard_activations(uuid, uuid[], text, text) to authenticated;

create or replace function public.sync_lexicard_activation_metrics_from_phrase_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_lexicard_activation_metrics_for_user_lang(old.user_id, old.target_lang, old.native_lang);
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_lexicard_activation_metrics_for_user_lang(new.user_id, new.target_lang, new.native_lang);
    return null;
  end if;

  if old.user_id is distinct from new.user_id
    or lower(trim(old.target_lang)) is distinct from lower(trim(new.target_lang))
    or lower(trim(old.native_lang)) is distinct from lower(trim(new.native_lang))
  then
    perform public.recompute_lexicard_activation_metrics_for_user_lang(old.user_id, old.target_lang, old.native_lang);
    perform public.recompute_lexicard_activation_metrics_for_user_lang(new.user_id, new.target_lang, new.native_lang);
    return null;
  end if;

  perform public.recompute_lexicard_activation_metrics_for_user_lang(new.user_id, new.target_lang, new.native_lang);
  return null;
end;
$$;

drop trigger if exists sync_lexicard_activation_metrics_from_phrase_links_trigger on public.phrase_lexicard_activations;
create trigger sync_lexicard_activation_metrics_from_phrase_links_trigger
after insert or update or delete on public.phrase_lexicard_activations
for each row
execute procedure public.sync_lexicard_activation_metrics_from_phrase_links();

-- Historical backfill intentionally excluded from this migration to avoid
-- statement timeouts on large datasets. New activations are fully linked
-- through register_phrase_lexicard_activations and kept in sync by triggers.

commit;
