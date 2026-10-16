-- AVISOS DE RACHA EN UN SOLO INTERRUPTOR (Luis, 16 Oct 2026)
--
-- En Notificaciones, «Avísame 5 horas antes de perder mi racha» (streak_risk_enabled) y
-- «Avísame si dejo de entrar» (habit_loss_enabled) ahora son una sola opción: «Avísame si voy a
-- perder mi racha». El interruptor sale encendido si cualquiera de los dos lo estaba y, al
-- tocarlo, cambia los dos a la vez.
--
-- Para que lo que ve cada alumno sea lo que recibe, las filas que ya existen quedan con los dos
-- valores iguales: encendidos si alguno lo estaba. En producción (16 Oct) eran 35 de 89 filas,
-- todas con «5 horas antes» encendido y «si dejo de entrar» apagado (casi todas son de antes del
-- 7 Oct, cuando «si dejo de entrar» venía apagado de serie).
-- No se toca nada más: quien tenía los dos apagados los sigue teniendo apagados.

begin;

update public.user_push_notification_preferences
   set streak_risk_enabled = true,
       habit_loss_enabled = true
 where streak_risk_enabled is distinct from habit_loss_enabled
   and (streak_risk_enabled is true or habit_loss_enabled is true);

commit;
