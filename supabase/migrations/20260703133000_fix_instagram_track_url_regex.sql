begin;

alter table public.instagram_track_posts
  drop constraint if exists instagram_track_posts_url_is_instagram;

alter table public.instagram_track_posts
  add constraint instagram_track_posts_url_is_instagram
  check (
    post_url is null
    or post_url ~* '^https?://(www\.)?instagram\.com/.+'
  );

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

commit;
