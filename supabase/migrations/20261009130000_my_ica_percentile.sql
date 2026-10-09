-- WRAPPED ICA: ¿EN QUÉ TOP ESTÁS? (Luis, 9 Oct)
--
-- get_my_ica_percentile(p_year): how often the signed-in student applied ICA in a year, compared
-- with every icademer who applied it at least once that year.
-- - Days that count for each person: from 1 January (or the day they signed up, if later) until
--   today (or 31 December, if the year is over), all in that person's own profile time zone
--   (Madrid if the profile has none).
-- - Applied = days with the ICA cycle completed (daily_metrics.creation_goal_completed).
-- - top_percent: the share of icademers with a frequency at least as high as yours (0.1 = top
--   0.1 %). The comparison counts at least 14 days per person (new accounts do not jump to the
--   top with two or three days). Only your own numbers and the total are returned.

begin;

create or replace function public.get_my_ica_percentile(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  year_start date;
  year_end date;
  result jsonb;
begin
  if me is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_year is null or p_year < 2020 or p_year > 2100 then
    raise exception 'YEAR_REQUIRED';
  end if;
  year_start := make_date(p_year, 1, 1);
  -- Widest possible end (time zones run up to a day ahead); each person is cut at their own today.
  year_end := least(make_date(p_year, 12, 31), (now() at time zone 'UTC')::date + 1);
  if year_end < year_start then
    return jsonb_build_object('users', 0, 'applied', 0);
  end if;

  with people as (
    select
      u.id as user_id,
      least(make_date(p_year, 12, 31), (now() at time zone coalesce(tzn.name, 'Europe/Madrid'))::date) as last_day,
      greatest(
        year_start,
        coalesce((u.created_at at time zone coalesce(tzn.name, 'Europe/Madrid'))::date, year_start)
      ) as first_day
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join pg_timezone_names tzn on tzn.name = nullif(p.timezone, '')
  ),
  counted as (
    select
      d.user_id,
      count(*)::integer as applied,
      (pe.last_day - pe.first_day + 1)::integer as span
    from public.daily_metrics d
    join people pe on pe.user_id = d.user_id
    where d.creation_goal_completed = true
      and d.day between year_start and least(year_end, pe.last_day)
    group by d.user_id, pe.last_day, pe.first_day
  ),
  frequency as (
    select
      user_id,
      applied,
      greatest(span, applied, 1) as possible,
      -- At least 14 days in the comparison, so someone who signed up three days ago and did
      -- three days does not jump straight to the top.
      applied::numeric / greatest(span, applied, 14) as ratio
    from counted
  ),
  mine as (
    select * from frequency where user_id = me
  )
  select case
    when not exists (select 1 from mine) then
      jsonb_build_object('users', (select count(*) from frequency), 'applied', 0)
    else
      jsonb_build_object(
        'users', (select count(*) from frequency),
        'applied', (select applied from mine),
        'possible', (select possible from mine),
        'ratio', round((select applied::numeric / possible from mine), 4),
        -- You plus everyone above you, as a share of all: the best one is in the top 1/total.
        'top_percent', round(
          (((select count(*) from frequency f where f.ratio > (select ratio from mine)) + 1)::numeric
            / (select count(*) from frequency)) * 100,
          1
        )
      )
  end
  into result;

  return result;
end;
$$;

revoke all on function public.get_my_ica_percentile(integer) from public, anon;
grant execute on function public.get_my_ica_percentile(integer) to authenticated;

commit;
