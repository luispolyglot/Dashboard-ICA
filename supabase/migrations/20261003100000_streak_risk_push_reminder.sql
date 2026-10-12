-- RACHA EN PELIGRO (Luis, 3 oct): notificación «Te quedan 5 horas» cuando ayer hiciste el
-- ciclo ICA (o lo salvaste con CongeladICA), hoy aún no, y son las 19:00 en tu zona horaria.
-- La manda streak-push-reminders (la misma función de los recordatorios de racha, que corre
-- cada hora). Viene activada: se puede quitar en Notificaciones.

begin;

alter table public.user_push_notification_preferences
  add column if not exists streak_risk_enabled boolean not null default true,
  add column if not exists streak_risk_last_day date;

commit;
