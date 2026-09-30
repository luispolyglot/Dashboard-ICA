-- Coaching V2: guardar TODAS las respuestas del alumno en cada intento del ejercicio de foco,
-- para que el coach vea el ejercicio tal y como lo hizo el alumno (no solo los fallos).
alter table public.coaching_v2_focus_exercise_attempts
  add column if not exists answers jsonb not null default '[]'::jsonb;
