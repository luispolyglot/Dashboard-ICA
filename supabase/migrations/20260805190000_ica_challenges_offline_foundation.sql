begin;

create table if not exists public.users_ica_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_ica_challenges_target_lang_not_empty
    check (length(trim(target_lang)) > 0),
  constraint users_ica_challenges_native_lang_not_empty
    check (length(trim(native_lang)) > 0),
  constraint users_ica_challenges_unique_lang
    unique (user_id, target_lang, native_lang)
);

create index if not exists users_ica_challenges_user_active_idx
  on public.users_ica_challenges (user_id, is_active, updated_at desc);

create table if not exists public.ica_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_slug text not null,
  status text not null default 'created',
  scope text not null default 'global',
  target_lang text,
  native_lang text,
  challenger_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  challenged_user_id uuid not null references auth.users (id) on delete cascade,
  winner_user_id uuid references auth.users (id) on delete set null,
  duration_seconds integer,
  expires_at timestamptz,
  started_at timestamptz,
  finalized_at timestamptz,
  game_metadata jsonb not null default '{}'::jsonb,
  phases_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ica_challenges_slug_not_empty
    check (length(trim(challenge_slug)) > 0),
  constraint ica_challenges_status_check
    check (status in ('created', 'in_progress', 'completed', 'cancelled', 'expired', 'not_accepted')),
  constraint ica_challenges_scope_check
    check (scope in ('global', 'language')),
  constraint ica_challenges_duration_positive
    check (duration_seconds is null or duration_seconds > 0),
  constraint ica_challenges_players_different
    check (challenger_user_id <> challenged_user_id),
  constraint ica_challenges_scope_language_requires_lang
    check (
      scope <> 'language'
      or (length(trim(coalesce(target_lang, ''))) > 0 and length(trim(coalesce(native_lang, ''))) > 0)
    ),
  constraint ica_challenges_scope_global_ignores_lang
    check (
      scope <> 'global'
      or (target_lang is null and native_lang is null)
    )
);

create index if not exists ica_challenges_challenger_idx
  on public.ica_challenges (challenger_user_id, created_at desc);

create index if not exists ica_challenges_challenged_idx
  on public.ica_challenges (challenged_user_id, created_at desc);

create index if not exists ica_challenges_status_scope_idx
  on public.ica_challenges (status, scope, created_at desc);

create index if not exists ica_challenges_lang_idx
  on public.ica_challenges (target_lang, native_lang, status, created_at desc)
  where scope = 'language';

create table if not exists public.ica_challenge_competitors (
  challenge_id uuid not null references public.ica_challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  competitor_order integer not null default 1,
  invitation_status text not null default 'pending',
  score integer,
  payload jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id),
  constraint ica_challenge_competitors_invitation_status_check
    check (invitation_status in ('pending', 'accepted', 'rejected')),
  constraint ica_challenge_competitors_order_positive
    check (competitor_order > 0)
);

create index if not exists ica_challenge_competitors_user_idx
  on public.ica_challenge_competitors (user_id, created_at desc);

create index if not exists ica_challenge_competitors_challenge_idx
  on public.ica_challenge_competitors (challenge_id, competitor_order asc);

drop trigger if exists users_ica_challenges_set_updated_at on public.users_ica_challenges;
create trigger users_ica_challenges_set_updated_at
before update on public.users_ica_challenges
for each row execute procedure public.set_updated_at();

drop trigger if exists ica_challenges_set_updated_at on public.ica_challenges;
create trigger ica_challenges_set_updated_at
before update on public.ica_challenges
for each row execute procedure public.set_updated_at();

drop trigger if exists ica_challenge_competitors_set_updated_at on public.ica_challenge_competitors;
create trigger ica_challenge_competitors_set_updated_at
before update on public.ica_challenge_competitors
for each row execute procedure public.set_updated_at();

alter table public.users_ica_challenges enable row level security;
alter table public.ica_challenges enable row level security;
alter table public.ica_challenge_competitors enable row level security;

drop policy if exists "users_ica_challenges_all_own" on public.users_ica_challenges;
create policy "users_ica_challenges_all_own"
on public.users_ica_challenges
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ica_challenges_select_own" on public.ica_challenges;
create policy "ica_challenges_select_own"
on public.ica_challenges
for select
using (
  auth.uid() = challenger_user_id
  or auth.uid() = challenged_user_id
);

drop policy if exists "ica_challenges_insert_challenger" on public.ica_challenges;
create policy "ica_challenges_insert_challenger"
on public.ica_challenges
for insert
with check (auth.uid() = challenger_user_id);

drop policy if exists "ica_challenges_update_participants" on public.ica_challenges;
create policy "ica_challenges_update_participants"
on public.ica_challenges
for update
using (
  auth.uid() = challenger_user_id
  or auth.uid() = challenged_user_id
)
with check (
  auth.uid() = challenger_user_id
  or auth.uid() = challenged_user_id
);

drop policy if exists "ica_challenge_competitors_select_own_challenges" on public.ica_challenge_competitors;
create policy "ica_challenge_competitors_select_own_challenges"
on public.ica_challenge_competitors
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.ica_challenges c
    where c.id = ica_challenge_competitors.challenge_id
      and (c.challenger_user_id = auth.uid() or c.challenged_user_id = auth.uid())
  )
);

drop policy if exists "ica_challenge_competitors_insert_by_challenger" on public.ica_challenge_competitors;
create policy "ica_challenge_competitors_insert_by_challenger"
on public.ica_challenge_competitors
for insert
with check (
  exists (
    select 1
    from public.ica_challenges c
    where c.id = ica_challenge_competitors.challenge_id
      and c.challenger_user_id = auth.uid()
  )
);

drop policy if exists "ica_challenge_competitors_update_own_row" on public.ica_challenge_competitors;
create policy "ica_challenge_competitors_update_own_row"
on public.ica_challenge_competitors
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
