begin;

create table if not exists public.instagram_track_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  native_lang text not null,
  track_month date not null,
  day_index smallint not null,
  post_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_track_posts_month_is_first_day
    check (track_month = date_trunc('month', track_month::timestamp)::date),
  constraint instagram_track_posts_day_index_range
    check (day_index >= 1 and day_index <= 28),
  constraint instagram_track_posts_url_is_instagram
    check (
      post_url is null
      or post_url ~* '^https?://(www\\.)?instagram\\.com/.+'
    ),
  constraint instagram_track_posts_unique_day
    unique (user_id, target_lang, native_lang, track_month, day_index)
);

create index if not exists instagram_track_posts_user_scope_idx
  on public.instagram_track_posts (user_id, target_lang, native_lang, track_month desc, day_index asc);

create or replace function public.instagram_track_day_unlock_at(
  p_track_month date,
  p_day_index smallint
)
returns timestamptz
language sql
immutable
as $$
  select (p_track_month + (greatest(1, least(28, p_day_index))::int - 1))::timestamptz;
$$;

create or replace function public.instagram_track_day_editable(
  p_track_month date,
  p_day_index smallint
)
returns boolean
language sql
stable
as $$
  select
    now() >= public.instagram_track_day_unlock_at(p_track_month, p_day_index)
    and now() <= public.instagram_track_day_unlock_at(p_track_month, p_day_index) + interval '48 hours';
$$;

create or replace function public.validate_instagram_track_post_row()
returns trigger
language plpgsql
as $$
declare
  unlock_at timestamptz;
begin
  if new.track_month is null then
    raise exception 'TRACK_POST_MONTH_REQUIRED';
  end if;

  if new.track_month <> date_trunc('month', new.track_month::timestamp)::date then
    raise exception 'TRACK_POST_MONTH_INVALID';
  end if;

  if new.day_index is null or new.day_index < 1 or new.day_index > 28 then
    raise exception 'TRACK_POST_DAY_OUT_OF_RANGE';
  end if;

  if new.post_url is not null then
    new.post_url := nullif(btrim(new.post_url), '');
  end if;

  if new.post_url is not null and new.post_url !~* '^https?://(www\\.)?instagram\\.com/.+' then
    raise exception 'TRACK_POST_URL_INVALID';
  end if;

  unlock_at := public.instagram_track_day_unlock_at(new.track_month, new.day_index);

  if now() < unlock_at then
    raise exception 'TRACK_POST_DAY_NOT_UNLOCKED';
  end if;

  if now() > unlock_at + interval '48 hours' then
    raise exception 'TRACK_POST_EDIT_WINDOW_EXPIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists instagram_track_posts_validate_edit_window on public.instagram_track_posts;
create trigger instagram_track_posts_validate_edit_window
before insert or update on public.instagram_track_posts
for each row execute procedure public.validate_instagram_track_post_row();

drop trigger if exists instagram_track_posts_set_updated_at on public.instagram_track_posts;
create trigger instagram_track_posts_set_updated_at
before update on public.instagram_track_posts
for each row execute procedure public.set_updated_at();

alter table public.instagram_track_posts enable row level security;

drop policy if exists "instagram_track_posts_select_own" on public.instagram_track_posts;
create policy "instagram_track_posts_select_own" on public.instagram_track_posts
for select using (auth.uid() = user_id);

drop policy if exists "instagram_track_posts_insert_own_in_window" on public.instagram_track_posts;
create policy "instagram_track_posts_insert_own_in_window" on public.instagram_track_posts
for insert with check (
  auth.uid() = user_id
  and public.instagram_track_day_editable(track_month, day_index)
);

drop policy if exists "instagram_track_posts_update_own_in_window" on public.instagram_track_posts;
create policy "instagram_track_posts_update_own_in_window" on public.instagram_track_posts
for update using (
  auth.uid() = user_id
  and public.instagram_track_day_editable(track_month, day_index)
) with check (
  auth.uid() = user_id
  and public.instagram_track_day_editable(track_month, day_index)
);

commit;
