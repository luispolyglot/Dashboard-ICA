-- Instagram tracker (Luis, 6 Oct): each day opens at midnight in the student's own time zone,
-- not at midnight UTC. In Colombia (UTC-5) day 6 was opening at 19:00 of day 5.
-- The 48-hour window to save a post now also counts from that local midnight.
begin;

-- Time zone of the signed-in student (profiles.timezone), or UTC if unknown or invalid.
-- Takes no argument so nobody can read someone else's time zone with it.
create or replace function public.instagram_track_my_timezone()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    (
      select tzn.name
      from public.profiles p
      join pg_timezone_names tzn on tzn.name = nullif(trim(p.timezone), '')
      where p.id = auth.uid()
    ),
    'UTC'
  );
$$;

revoke all on function public.instagram_track_my_timezone() from public, anon;
grant execute on function public.instagram_track_my_timezone() to authenticated;

-- Local midnight of that day in the given time zone.
create or replace function public.instagram_track_day_unlock_at(
  p_track_month date,
  p_day_index smallint,
  p_timezone text
)
returns timestamptz
language sql
stable
as $$
  select (
    (p_track_month + (greatest(1, least(28, p_day_index))::int - 1))::timestamp
    at time zone coalesce(nullif(p_timezone, ''), 'UTC')
  );
$$;

-- Used by the insert/update policies: now in the student's own time zone.
create or replace function public.instagram_track_day_editable(
  p_track_month date,
  p_day_index smallint
)
returns boolean
language sql
stable
as $$
  select
    now() >= u.unlock_at
    and now() <= u.unlock_at + interval '48 hours'
  from (
    select public.instagram_track_day_unlock_at(
      p_track_month,
      p_day_index,
      public.instagram_track_my_timezone()
    ) as unlock_at
  ) u;
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

  if new.post_url is not null and new.post_url !~* '^https?://(www\.)?instagram\.com/.+' then
    raise exception 'TRACK_POST_URL_INVALID';
  end if;

  unlock_at := public.instagram_track_day_unlock_at(
    new.track_month,
    new.day_index,
    public.instagram_track_my_timezone()
  );

  if now() < unlock_at then
    raise exception 'TRACK_POST_DAY_NOT_UNLOCKED';
  end if;

  if now() > unlock_at + interval '48 hours' then
    raise exception 'TRACK_POST_EDIT_WINDOW_EXPIRED';
  end if;

  return new;
end;
$$;

commit;
