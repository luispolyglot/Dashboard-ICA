begin;

create or replace function public.daily_metrics_compute_goal_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  day_start_utc timestamptz;
  day_end_utc timestamptz;
  has_activation boolean;
  today_local date;
begin
  tz := coalesce(
    (select nullif(p.timezone, '') from public.profiles p where p.id = new.user_id),
    'UTC'
  );

  today_local := (now() at time zone tz)::date;
  day_start_utc := (new.day::timestamp at time zone tz);
  day_end_utc := ((new.day + 1)::timestamp at time zone tz);

  select exists (
    select 1
    from public.phrase_voice_activations pva
    where pva.user_id = new.user_id
      and pva.created_at >= day_start_utc
      and pva.created_at < day_end_utc
  )
  into has_activation;

  new.review_goal_completed := coalesce(new.correct_reviews, 0) >= 10;

  -- Regla transicional:
  -- - dias historicos (< hoy local): no exigir activacion
  -- - hoy/futuro: exigir activacion
  new.creation_goal_completed :=
    coalesce(new.words_added, 0) >= 5
    and coalesce(new.phrase_generated, false)
    and (new.day < today_local or has_activation);

  return new;
end;
$$;

-- Backfill/recompute para que se apliquen las nuevas reglas a todo el historico
-- (solo dispara el trigger; no cambia el dia)
update public.daily_metrics dm
set day = dm.day
where dm.day <= current_date;

commit;