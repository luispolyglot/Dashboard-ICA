-- AVISOS ACTIVADOS DE SERIE (Luis, 7 oct): las filas nuevas de preferencias de notificación
-- nacen con la racha ICA, la racha de flashcards y la pérdida de hábito activadas (la racha en
-- peligro ya venía activada). Solo cambia el valor por defecto de las filas que se creen a partir
-- de ahora: las filas que ya existen no se tocan, así que nadie pierde lo que eligió.
-- La función streak-push-reminders usa los mismos valores para quien tiene el dispositivo
-- suscrito pero aún no tiene fila.

begin;

alter table public.user_push_notification_preferences
  alter column ica_streak_enabled set default true,
  alter column flashcards_streak_enabled set default true,
  alter column habit_loss_enabled set default true;

commit;
