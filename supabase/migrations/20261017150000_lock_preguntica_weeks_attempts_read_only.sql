-- PREGUNTICA: SEMANAS E INTENTOS SOLO DE LECTURA PARA EL ALUMNO (revisión de seguridad, 17 Oct).
-- preguntica_weeks y preguntica_attempts tenían una política FOR ALL «lo tuyo», así que un alumno,
-- con su propia sesión, podía crear, cambiar o borrar sus semanas e intentos (p. ej. marcar la
-- semana como desbloqueada o completada, o cambiar la nota de un intento).
-- Nadie lo necesita: la app solo los LEE, y todo lo que escribe en ellas pasa por funciones
-- SECURITY DEFINER (create_preguntica_attempt, create_preguntica_attempt_with_prompt_data,
-- complete_preguntica_attempt, get_my_preguntica_week_status) o por la Edge Function
-- preguntica-center con la service role. Ninguna de ellas usa estas políticas.
-- Mismo patrón que 20261002120000_lock_coin_tables_to_read_only.sql.

begin;

drop policy if exists "preguntica_weeks_all_own" on public.preguntica_weeks;
drop policy if exists "preguntica_weeks_select_own" on public.preguntica_weeks;
create policy "preguntica_weeks_select_own"
on public.preguntica_weeks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "preguntica_attempts_all_own" on public.preguntica_attempts;
drop policy if exists "preguntica_attempts_select_own" on public.preguntica_attempts;
create policy "preguntica_attempts_select_own"
on public.preguntica_attempts
for select
to authenticated
using (auth.uid() = user_id);

-- Por si algún día se añade otra política permisiva: los roles del API no escriben directamente.
revoke insert, update, delete, truncate on public.preguntica_weeks from anon, authenticated;
revoke insert, update, delete, truncate on public.preguntica_attempts from anon, authenticated;

commit;
