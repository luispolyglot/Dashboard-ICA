-- RANKING DEL MES LENTO EN PRODUCCIÓN (12 Oct, después del lanzamiento).
--
-- get_monthly_streak_leaderboard tardaba ~36 s en producción (125 alumnos) y la app daba
-- «No se pudo cargar el ranking mensual» (el límite de una consulta de la app es de pocos segundos).
-- La causa: para cada alumno, get_user_monthly_listening_score buscaba su zona horaria en
-- pg_timezone_names, que lee todas las zonas del disco en cada búsqueda (~220 ms por alumno).
--
-- Arreglo: ica_valid_timezone() comprueba la zona directamente (microsegundos) y devuelve null si
-- no es válida, igual que antes el left join. Mismo resultado, sin cambiar ninguna regla.
-- Las dos funciones son copia exacta de su última versión (20261007143000 y 20261008100000)
-- salvo esa búsqueda.

begin;

create or replace function public.ica_valid_timezone(p_timezone text)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  if nullif(btrim(p_timezone), '') is null then
    return null;
  end if;
  perform now() at time zone p_timezone;
  return p_timezone;
exception when others then
  return null;
end;
$$;
revoke all on function public.ica_valid_timezone(text) from public, anon;
grant execute on function public.ica_valid_timezone(text) to authenticated, service_role;

create or replace function public.get_user_monthly_listening_score(
  p_user_id uuid,
  p_month_start date default null,
  p_day_cap integer default null
)
returns table (
  listening_points numeric,
  listening_day_cap integer
)
language sql
stable
security definer
set search_path = public
as $$
  with user_clock as (
    select
      coalesce(
        (
          select public.ica_valid_timezone(p.timezone)
          from public.profiles p
          where p.id = p_user_id
        ),
        'UTC'
      ) as timezone_name,
      now() as now_utc
  ),
  bounds as (
    select
      uc.timezone_name,
      (uc.now_utc at time zone uc.timezone_name) as now_local,
      coalesce(
        p_month_start,
        date_trunc('month', uc.now_utc at time zone uc.timezone_name)::date
      ) as month_start,
      least(
        28,
        greatest(
          1,
          coalesce(
            p_day_cap,
            case
              when p_month_start is null
                or p_month_start = date_trunc('month', uc.now_utc at time zone uc.timezone_name)::date
                then extract(day from (uc.now_utc at time zone uc.timezone_name))::integer
              else 28
            end
          )
        )
      ) as day_cap
    from user_clock uc
  ),
  event_days as (
    select
      case
        when l.local_day is not null then l.local_day
        when l.occurred_at is not null then
          (l.occurred_at at time zone coalesce(nullif(l.timezone_name, ''), b.timezone_name))::date
        when (l.created_at at time zone 'UTC')::date > l.day + 1 then null
        else (l.created_at at time zone b.timezone_name)::date
      end as listening_day,
      l.delta_seconds
    from public.master_note_listening_ingest_log l
    cross join bounds b
    where l.user_id = p_user_id
      and l.delta_seconds > 0
  ),
  daily_seconds as (
    select
      ed.listening_day,
      sum(ed.delta_seconds)::bigint as listened_seconds
    from event_days ed
    cross join bounds b
    where ed.listening_day >= b.month_start
      and ed.listening_day < (b.month_start + interval '1 month')::date
      and extract(day from ed.listening_day)::integer <= b.day_cap
    group by ed.listening_day
  )
  select
    coalesce(
      sum(case when ds.listened_seconds >= 600 then 0.1::numeric else 0::numeric end),
      0::numeric
    ),
    b.day_cap
  from bounds b
  left join daily_seconds ds on true
  group by b.day_cap;
$$;
revoke all on function public.get_user_monthly_listening_score(uuid, date, integer)
  from public, anon, authenticated;

create or replace function public.get_monthly_streak_leaderboard(limit_count integer default 20)
returns table (
  rank bigint,
  user_id uuid,
  username text,
  display_name text,
  ica_streak_days integer,
  avg_percent numeric,
  review_percent numeric,
  creation_percent numeric,
  is_creation_streak_frozen boolean,
  ica_test_points numeric,
  listening_points numeric,
  preguntica_points numeric,
  instagram_points numeric,
  total_points numeric,
  featured_badge text,
  display_flag text,
  daily_game_correct integer,
  listening_day_cap integer
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      core.*,
      date_trunc('month', now() at time zone coalesce(public.ica_valid_timezone(p.timezone), 'UTC'))::date as profile_month,
      fb.badge as featured_badge,
      df.lang as display_flag,
      floor.listening_points as october_score_floor,
      listening.listening_points as local_listening_points,
      listening.listening_day_cap
    from public.get_monthly_streak_leaderboard_core(100000) core
    left join public.profiles p on p.id = core.user_id
    left join public.ica_featured_badges fb on fb.user_id = core.user_id
    left join public.ica_display_flags df on df.user_id = core.user_id
    left join public.master_note_listening_monthly_score_floors floor
      on floor.user_id = core.user_id and floor.period_start = date '2026-10-01'
    cross join lateral public.get_user_monthly_listening_score(core.user_id, null, null) listening
  ),
  adjusted as (
    select
      b.*,
      case
        when b.profile_month = date '2026-10-01'
          then greatest(
            coalesce(b.october_score_floor, 0),
            coalesce(b.listening_points, 0),
            b.local_listening_points
          )
        else b.local_listening_points
      end as adjusted_listening_points
    from base b
  ),
  scored as (
    select
      a.*,
      round(
        a.total_points - coalesce(a.listening_points, 0) + a.adjusted_listening_points,
        2
      ) as adjusted_total_points
    from adjusted a
  ),
  ranked as (
    select
      row_number() over (
        order by
          s.adjusted_total_points desc,
          case
            when date_trunc('month', now())::date >= date '2026-11-01'
              then coalesce(s.daily_game_correct, 0)
            else 0
          end desc,
          s.avg_percent desc,
          s.ica_streak_days desc,
          s.user_id
      ) as adjusted_rank,
      s.*
    from scored s
  )
  select
    r.adjusted_rank,
    r.user_id,
    r.username,
    r.display_name,
    r.ica_streak_days,
    r.avg_percent,
    r.review_percent,
    r.creation_percent,
    r.is_creation_streak_frozen,
    r.ica_test_points,
    r.adjusted_listening_points,
    r.preguntica_points,
    r.instagram_points,
    r.adjusted_total_points,
    r.featured_badge,
    r.display_flag,
    r.daily_game_correct,
    r.listening_day_cap
  from ranked r
  order by r.adjusted_rank
  limit greatest(limit_count, 1);
$$;
revoke all on function public.get_monthly_streak_leaderboard(integer) from public, anon;
grant execute on function public.get_monthly_streak_leaderboard(integer) to authenticated;

commit;
