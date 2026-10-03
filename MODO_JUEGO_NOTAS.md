# Cambios Dashboard ICA · Modo juego

3 de octubre de 2026 · Luis

Rediseño de toda la app con un modo juego propio del método ICA: camino I → C → A, cofre, ICA Coins, insignias, ranking nuevo y Reto del día. Lleva dentro Desafíos ICA, la interfaz en español e inglés y el coaching rediseñado. La guía para revisarlo y subirlo, paso a paso, también está en Notion («Modo juego · Entrega a Nahuel»); este archivo es la referencia técnica.

## Lee esto primero

| Dato | Valor |
|---|---|
| Rama | `feat/modo-juego`. PR contra `develop` |
| Base | `develop` actual (255b39c, con «cargas fluidas» y el CI con el pooler IPv4) ya unida en la rama: no quedan conflictos |
| Commits | 1) `feat: modo juego` (todo el trabajo, sobre 6085f2b) · 2) merge de `develop` · 3) `fix: ajustes tras unir develop` · 4) `fix(security)` del saldo de monedas · 5) estas notas · 6) `feat: ajustes del 3 de octubre` · 7) `feat: economía de la ICA Coin, racha en peligro y chat de icademers` · 8) `fix: ampliaciones otra vez a 15` · 9) `feat(chat): avisos del grupo, plegar mensajes, confirmar salida y horas de cada uno` · 10) merge de `develop` 255b39c (ver «Historial», con estas notas al día) |
| Tamaño frente a develop | 264 archivos: 92 nuevos, 165 modificados y 7 borrados (unas +38.100 / −15.600 líneas). Unas 3.200 líneas son diccionarios de inglés y la mayoría del resto es interfaz |
| Comprobado | `npm run build` sin errores. Tests unitarios: 241/241. `supabase db reset --local` reconstruye todas las migraciones (incluida `20261003120000_ica_coins_server_authority.sql`) y `supabase db lint --local --schema public --fail-on error` no encuentra errores. Se probaron RPCs de saldo/pase/4.º reto, premio automático, límites de reacciones, timestamp de palabra, regeneración y puerta de 20 palabras. `deno check --unstable` solo muestra el error de tipos preexistente en `_shared/coaching-auth.ts`; no hay errores nuevos en `reactions.ts`. No se han desplegado migraciones ni Edge Functions remotas |
| Al unir con `develop` | El CI (`deploy-supabase.yml`) aplicará las migraciones nuevas en DEV y desplegará `ica-challenges-center` con las acciones de reacciones y creación transaccional |
| Production | No subir a `main` hasta probar en DEV el nuevo ledger, los límites, el cuarto desafío y el flujo social. El modo juego no va detrás de un flag: lo que entre en `develop` sale entero en la próxima subida a `main` |

### Qué hacer, en orden

1. Revisar la PR. Lo que toca datos o servidor está en «Qué revisar con atención»; el resto es interfaz.
2. Unir a `develop`. El CI aplica las migraciones y despliega las funciones en DEV.
3. En DEV: activar las flags `ica-challenges` y `nota-desafiante`. Comprobar que `streak-push-reminders` se llama cada hora (el aviso de racha en peligro sale a las 19:00 de cada alumno). Opcional: secret `ANTHROPIC_FAST_MODEL` (si no está, se usa `claude-haiku-4-5-20251001`).
4. Probar con la lista de «Qué probar en development».
5. Antes de production: probar en DEV las RPC/migraciones de «Estado actualizado en esta rama», los límites y el cuarto desafío; revisar los movimientos y el ranking con insignia. La interfaz no está protegida por un flag.

## Migraciones nuevas

| Migración | Qué hace |
|---|---|
| `20261001120000_preguntica_extra_attempt_coins.sql` | PreguntICA extra por 50 ICA Coins, también con la semana bloqueada. Redefine 4 funciones con las mismas firmas: `redeem_preguntica_tokens_for_week`, `get_my_preguntica_week_status` (`can_start`), `create_preguntica_attempt` y `complete_preguntica_attempt` (el intento pagado ya no cierra la semana) |
| `20261001130000_nota_desafiante_weekly_unlock.sql` | El desbloqueo de la nota desafiante dura toda la semana: `bump_master_note_challenge_listening` acepta `p_day` hasta 7 días atrás (la app manda el lunes) |
| `20261001140000_master_note_challenge_plays.sql` | Tabla `master_note_challenge_plays` y RPC `record_master_note_challenge_play` (solo `authenticated`): guarda cada nota desafiante terminada. **No toca el ranking**: el 0,1 diario sigue siendo «10 minutos de notas maestras escuchadas», como en production (decisión de Luis del 3 de octubre). Los datos quedan guardados por si más adelante la nota desafiante cuenta. Antes se llamaba `..._ranking_point_listen_and_challenge_note.sql` y sí cambiaba el 0,1; no llegó a aplicarse en ningún entorno |
| `20261002120000_lock_coin_tables_to_read_only.sql` | **Seguridad, dos agujeros que existen hoy en production.** 1) `preguntica_token_ledger` y `preguntica_week_token_unlocks` tenían una política `FOR ALL` para su dueño: cualquiera con sesión podía insertarse monedas (+1000 con un `manual_adjustment`), editarlas, borrarlas o crearse un desbloqueo gratis desde la API. Pasan a solo lectura; todas las escrituras legítimas ya iban por funciones `SECURITY DEFINER`. 2) `grant_preguntica_monthly_tokens` y `distribute_preguntica_monthly_tokens_from_snapshot` son `SECURITY DEFINER`, no comprueban quién llama y solo tenían `revoke ... from public`, que no quita el EXECUTE que los privilegios por defecto de Supabase dan a `anon` y `authenticated`: cualquiera, incluso sin sesión, podía darse 100.000 monedas. Se quita EXECUTE a `public`, `anon` y `authenticated` en esas dos, en `snapshot_monthly_leaderboard`, `run_monthly_leaderboard_snapshot_if_needed` y en los trabajos de caducidad de Desafíos; solo los usan el cron (como dueño) y `service_role`. Probado en Postgres 16 con los privilegios por defecto de Supabase simulados: antes, las llamadas funcionan; después, «permission denied», y el canje de 50 por RPC sigue funcionando |
| `20261003100000_streak_risk_push_reminder.sql` | Columnas `streak_risk_enabled` (por defecto `true`) y `streak_risk_last_day` en `user_push_notification_preferences`, para el aviso «Te quedan 5 horas» |
| `20261003110000_icademer_language_chat.sql` | Chat de icademers por idioma: tablas `icademer_chat_members` e `icademer_chat_messages` (sin lectura ni escritura directa desde la API) y RPCs `get_my_icademer_chat_status`, `join_icademer_chat`, `set_icademer_chat_notifications`, `leave_icademer_chat`, `get_icademer_chat` y `send_icademer_chat_message` (solo `authenticated`). Avisos por grupo: `icademer_chat_members.notifications_enabled` (null = aún no se ha preguntado) y `last_notified_at`; `icademer_chat_messages.push_sent_at`. El servidor comprueba que aprendes ese idioma (`user_settings.target_lang` o palabras de ese idioma), que el mensaje es uno de los 8 de la lista, que la hora va en cuartos, como mucho 3 mensajes seguidos (con `pg_advisory_xact_lock` por chat) y uno cada 3 s. Nadie ve la lista de miembros, solo el número; cada mensaje lleva nombre e inicial del apellido. Probado en Postgres con 3 usuarios (idioma equivocado, sin ser miembro, lectura directa, 4.º seguido, mensaje inventado, hora 18:40, anon) |

`--include-all` del CI aplica también `20261001100000` (la tuya de `develop`) si aún no estaba en DEV. Ninguna de las nuestras toca los mismos objetos que la tuya.

## Funciones

| Función | Cambio |
|---|---|
| `ica-challenges-center` | Acción nueva `public-profile` (`{ profileUserId }`) en `profile.ts`, con el mismo patrón de dependencias que `directory.ts`. Devuelve `profile` (nombre, idioma, nivel), `stats` (mejor racha ICA y de flashcards, palabras y desafíos ganados) y `challenge` (`canChallenge`, `blockedReason`, `blockedCode`) con las mismas reglas que al crear un desafío Global. `review` devuelve también `rivalWords` (para «Añadir a mi Baúl ICA») |
| `anthropic-proxy` | Acción nueva `pronunciation` (`{ words, targetLang, nativeLang }`, máximo 20; responde `{ result: { palabra: transcripción } }`). Las tareas cortas pasan a Haiku (ver «Haiku») |
| `lexicard-example-worker` | Usa Haiku (`ANTHROPIC_FAST_MODEL` o `claude-haiku-4-5-20251001`) |
| `streak-push-reminders` | «Racha en peligro»: a las 19:00 locales (`profiles.timezone`), si ayer se hizo el ciclo ICA o se salvó con CongeladICA y hoy aún no, manda «Te quedan 5 horas» con un reloj (`/push-clock-192.png`). Si coincide con el recordatorio normal de racha ICA, solo sale este. Viene activado: también para quien tiene el móvil suscrito pero nunca abrió las preferencias (se le crea la fila al avisar). `push-sw.js` acepta ahora `icon` en el payload |
| `icademer-chat-push` (nueva) | La llama la app de quien escribe justo después de enviar (`{ messageId }`, con su sesión). Marca `push_sent_at` (cada mensaje avisa una vez, solo su autor y solo si es de hace menos de 2 min) y manda la notificación a los miembros con avisos activados que no han leído el chat y a los que no se avisó en los últimos 10 min: «Icademers de polaco · Marta L.: ¿Alguien se apunta al Club de DinámICA?». La hora de «¿A las…?» llega en la hora de cada uno (`profiles.timezone`). Mismos secretos VAPID que los recordatorios; `verify_jwt` por defecto (con sesión) |
| `_shared/pronunciation-prompt.ts` | Nuevo. Al cambiar `_shared/`, el CI redespliega todas las funciones |
| `_shared/calendar-icademy-catalog.ts` | Francés queda como una sola clase «Francés» (`fr_basico`). `calendar-icademy-bulk-upsert` se redespliega con el resto |

## Decisiones al unir `develop`

| Archivo | Qué se hizo |
|---|---|
| `ica-challenges-center/index.ts` | Tu versión (con `directory.ts` e `invitations.ts`) más lo nuestro: `rivalWords` en `reviewGame` y el despacho de `public-profile`, que vive en `profile.ts` |
| `icaChallengesLocal.ts` y su test | Tu versión entera. Quitados de la rama la demo local (8 icademers virtuales, «Preparar demo», `?reto-virtual`) y su recuadro |
| `IcaChallengesView.tsx` | Tus imports (`icaChallengesLocalBridge`, `icaChallengesLocalMode`) y tu recuadro «Modo local de prueba»; las filas de Pendientes del diseño nuevo. Como en tu versión, «Aceptar» ya no se bloquea en el cliente (valida el servidor) |
| `icaChallenges.ts` | Tu carga diferida (`loadLocalChallenges`) más nuestro filtro por idioma en `listMyIcaChallenges` |
| `IcaChallengePlayView.tsx`, `game/IcademerProfile.tsx` | Ya no importan `icaChallengesLocal` (el simulador no entra en el build de production; comprobado) |

**Segunda unión (3 de octubre, `develop` 255b39c: «cargas fluidas» de la PR #85 y el CI con el pooler IPv4).** Las dos ramas hacían lo mismo en varios sitios; se quedó así:

| Archivo | Qué se hizo |
|---|---|
| `index.html`, `fullscreen-loading.tsx` | La pantalla de arranque del modo juego (logo ICA quieto, igual en `index.html` y en React). Fuera la barra de progreso y los logos PNG de `develop`. `.loading-reveal` de `index.css` se queda (lo usa `loading-state.tsx`) |
| `router/RouteGuards.tsx` | La versión del modo juego (caché rápida por usuario). Pasan los tests nuevos de `develop` (`RouteGuards.test.tsx`) |
| Vistas con conflicto (admin, coaching, notas maestras, PreguntICA, trackers, ranking…) | El diseño del modo juego, con lo de «cargas fluidas» encima: `useSoftLoading` (el contenido se queda al recargar y gira el icono de recargar) y los esqueletos de `loading-state.tsx` donde quedaba un «Cargando…» de texto (menú de usuario, Instagram, notas offline, calendario de coaching, sesión de coaching). Donde el modo juego ya tenía su esqueleto, se queda el suyo |
| `MetaTracker/MetaTrackerSection.tsx` | Sigue borrado (ya no lo usa nada) |

Después de la primera unión (commit `fix: ajustes tras unir develop`): traducidos al inglés tus 4 mensajes nuevos de `invitations.ts`; `public-profile` resuelve el idioma del rival con `resolvePlayerPair` y responde 500 en JSON si falla la base de datos; la caché rápida se borra al cerrar sesión (y una respuesta que llegue después ya no se guarda); la precarga de Desafíos solo se reutiliza si es de la misma cuenta.

## Qué revisar con atención (toca datos o servidor)

El resto de archivos es interfaz: mismas llamadas, mismos datos.

| Dónde | Qué cambia | Riesgo |
|---|---|---|
| Migración PreguntICA + `services/preguntica.ts` | El canje pasa de 1 a 50 y ya no exige la semana completada. El front que hay hoy en production manda 1: **front y migración tienen que salir a la vez** | Alto |
| `router/RouteGuards.tsx` | Los guards (admin, super admin, coaching admin, miembro) pintan al momento si la caché rápida dice que sí y comprueban por detrás. A quien le quitan un rol aún ve la pantalla hasta que vuelve la comprobación; la protección real sigue en RLS y funciones. La caché se borra al cerrar sesión | Alto |
| `streak-push-reminders` (racha en peligro) | Ahora lee todas las filas de preferencias (antes filtraba por las activadas) y añade a quien tiene el móvil suscrito sin fila. «Racha en peligro» viene activada: le llegará a gente que solo activó las notificaciones de clases. Probar en DEV que no se duplica con el recordatorio normal | Medio |
| Chat de icademers | Superficie social nueva. Los avisos los dispara la app de quien escribe (`icademer-chat-push`); si alguien llama a la función a mano, solo puede avisar de sus propios mensajes recientes y una vez por mensaje. Mensajes cerrados (no hay texto libre), pero el nombre y la inicial del apellido se ven entre quien aprende el mismo idioma. Sin moderación ni bloqueo de usuarios: si hiciera falta, `leave` lo hace el propio alumno y un admin puede borrar su fila de `icademer_chat_members` | Medio |
| `public-profile` | Con service role, cualquier usuario con sesión ve de cualquier `profileUserId`: nombre, username, idiomas, nivel, mejores rachas, número de palabras y victorias. Es lo que se enseña en el ranking | Medio |
| Migración de la nota desafiante semanal | Con el front nuevo y la base sin migrar, de miércoles a domingo da `INVALID_DAY`: salen juntas | Medio |
| `anthropic-proxy` / `lexicard-example-worker` | Haiku en traducción, ortografía, ejemplos, explicación de palabras y revisión de frase manual. Probar calidad en DEV | Medio |
| `createIcaChallenge` | Manda `useExtraSlot`, que el servidor ignora (ver «Desafío extra») | Medio |
| `record_master_note_challenge_play` | No comprueba el desbloqueo ni un mínimo de aciertos (una partida con `total = 0` se guarda). Hoy da igual porque no da puntos; si algún día cuenta para el ranking, habrá que validarlo | Bajo |
| `MetaTrackerSetupModal.tsx` | Solo pregunta el nivel: guarda siempre `priorIcaWords: 0` | Medio |
| `utils.ts` `sortRoundByReviewPriority` | Cambia el orden de la ronda de flashcards en todos los modos, no solo en «Solo por aprender» | Bajo |
| `services/leaderboard.ts` | El ranking del mes se pide con 250 filas o más y las fotos con 400 o más; se precargan al abrir la app | Bajo |
| `services/adminAnalytics.ts` `fetchAdminRole` | `getSession()` en vez de `getUser()` y rol en caché 60 s | Bajo |
| `ManageCoachingCalendarView.tsx` | Flechas de mes en vez del `<select>`: deja ir a meses fuera de `availableMonths` (salen vacíos) | Bajo |

Archivos grandes que son solo presentación (mismas llamadas): `CoachingV3SessionBoard`, `ManageCoachingUserView`, `CalendarIcademyBoard`, `ProfileView` (salvo el tope de 20 caracteres en el nombre). Con algo de lógica de interfaz: `PregunticaView` (precio 50, `paidAttemptPending`, `?extra=1`), `PhraseView` (límite diario, frase pendiente), `ReviewView` (`ignoreNewCardLimits`, «Continuar», pronunciación).

## Haiku (el modelo barato)

Las tareas cortas de todos los días pasan a Haiku. Lo que necesita más calidad sigue con Sonnet (`ANTHROPIC_MODEL`). El cambio está en `callAnthropic`, con `options.model`.

| Tarea | Acción | Modelo |
|---|---|---|
| Traducir lo que se escribe en Inmersión | `translate` | Haiku |
| Corregir la ortografía | `spellcheck` | Haiku |
| Ejemplos de las flashcards | `word_example` y `lexicard-example-worker` | Haiku |
| Explicar una palabra de la frase | `phrase_token_insight` | Haiku |
| Corregir la frase escrita a mano | `manual_phrase_suggestion` | Haiku |
| Generar la frase de Creación | `activation_phrase` | Sonnet |
| Nota desafiante y ejercicio de coaching | `split_phrase`, `coaching_focus_exercise` | Sonnet |

Antes de pasarlo a production, conviene probar en development unas cuantas traducciones y correcciones.

## Qué cambia para el usuario

- **Diseño y navegación.** Letra Nunito, colores nuevos (`--ica-*`) y modo claro gris azulado. En el móvil, barra Inicio · Ranking · + · Juegos · Perfil; en el ordenador, pestañas arriba. La app se llama «ICA» y no lleva emojis.
- **Inicio.** Camino I → C → A → cofre del ciclo (de 1 a 5 ICA Coins, con animación) → Reto del día (`/reto-del-dia`, un minijuego con tus palabras). Los pasos van en orden y los bloqueados tiemblan al tocarlos.
- **Límites diarios.** 10 palabras, 2 frases y 2 activaciones. Cada fase se puede ampliar por separado, solo ese día: «Ampliar Inmersión», «Ampliar Creación» y «Ampliar Activación», 15 ICA Coins cada una, duplican el límite de esa fase.
- **Economía de la ICA Coin.** Hucha de 100 como máximo (por encima, el cofre y los desafíos no suman; los hitos y el ranking sí), y máximo 7 ICA Coins por semana con desafíos ganados. Ver «Economía de la ICA Coin».
- **Racha en peligro.** Desde 5 horas antes de medianoche, si hay racha y el ciclo de hoy no está hecho: aviso en Inicio con un reloj y la cuenta atrás, y notificación «Te quedan 5 horas» a las 19:00 (se quita en Notificaciones).
- **Chat de icademers.** Un grupo por idioma con 8 mensajes cerrados. Se entra por una invitación que sale una sola vez (al cerrar la celebración del cofre) o desde Perfil, debajo de Notificaciones, con aviso de mensajes nuevos.
- **ICA Coins (`/fichas`).** Tienda: desafío extra (15), ampliar Inmersión, Creación o Activación (15 cada una) y PreguntICA extra (50), además de cómo se ganan. En el ordenador, al pasar el ratón por un precio, el botón se vuelve dorado, sube un poco y la moneda gira. En admin, «ICA Coins de usuarios» con botones −/+.
- **Barra de arriba (ordenador).** Al pasar el ratón: por la racha, la semana; por las ICA Coins, en qué gastarlas hoy (las 5 compras de la tienda, con su dibujo); y, para coachers, por «Coaching», sus alumnos (clic en uno abre su ficha), «Todos» y «Calendario».
- **Juegos.**
  - Flashcards, desde 20 palabras activadas.
  - Desafíos ICA.
  - PreguntICA.
  - Nota desafiante (`/nota-desafiante`): pide 2 notas maestras terminadas, se queda abierta toda la semana y tiene «Escuchar todas seguidas».
- **Desafíos ICA.** Los de tu rama, con el diseño nuevo:
  - Avisos en Juegos.
  - Celebración al llegar a 20 palabras.
  - Reacciones al acabar.
  - «Añadir a mi Baúl ICA» con las palabras del rival.
- **Ranking.** Tu puesto fijo arriba, podio, insignia en cada fila y filas que se van apagando a partir del puesto 26.
- **Perfil.** Insignias (`/insignias`: 6 categorías × 5 rangos) y ajustes de cuenta (`/profile/account`). Quien no está en el coaching ve una invitación que lleva a Tally.
- **Estadísticas y Rachas.** Estadísticas trae un recap mensual que se puede descargar. Rachas está rediseñada, con hitos que dan ICA Coins.
- **Resto de pantallas con el estilo nuevo.** Coaching (azul noche y oro), login y registro, calendarios de ICADEMY y de coaching, admin, notificaciones y trackers.
- **Idioma.** La interfaz va en el idioma nativo del alumno: español si es español, inglés para el resto. Funciona con `t()` en `src/i18n`, y los diccionarios están en `src/i18n/en/*.ts`. El login sale siempre en español la primera vez, y el admin solo está en español.
- **Velocidad.** `services/quickCache.ts` enseña al momento lo último que se cargó (ranking, insignias, monedas, flags, permisos de admin…) y lo actualiza por detrás. Las claves van por usuario.

## Historial de cambios

### Tarde del 1 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Aulas que ya no se imparten | Los alumnos ya no ven alemán (básico y conversacional), inglés avanzado, italiano avanzado ni francés conversacional, ni sus sesiones ni sus avisos. Francés queda como una sola clase, «Francés», que usa la clave `fr_basico` (así se conservan sus sesiones y los avisos de quien la tenía). En el admin siguen todas, marcadas «(oculta a los alumnos)» | `retired` en `constants/calendarIcademyCatalog.ts`. `fetchCalendarIcademyEntries()` las quita salvo con `{ includeRetired: true }` (solo el admin) |
| Sonido de las insignias | Al abrir una insignia (perfil, Insignias y ranking) suena según el rango. Rehecho por la noche: ver «Cambios de la noche del 1 de octubre». Respeta el interruptor de sonido del perfil | `playBadgeSound()` en `game/sfx.ts`, `game/badgeSounds.ts` y `game/useBadgeSound.ts` |
| Una sola llama para las rachas | La racha ICA y la de flashcards usan la misma llama (`FlameIcon`): naranja la ICA y azul la de flashcards (tono nuevo `flash`). También en las insignias de racha, en Rachas, en la celebración diaria, en ICA Coins y en Notificaciones | `game/icons.tsx`, `game/medals.ts` y pantallas que la usan |
| Sin el recuadro gris al pasar el ratón | Se quitan los `title` nativos de la app (barra de arriba, ranking, calendario, coaching…). Si el elemento no tenía `aria-label`, el texto pasa a `aria-label`. Se mantienen en iframes y en el admin (gráficas y calendario de coaching) | 29 sitios |
| Desplegables en la barra de arriba (ordenador) | Al pasar el ratón por la racha: la semana (L–D) con los días hechos, salvados o pendientes, el próximo hito y la racha de flashcards. Por las ICA Coins: en qué puedes gastarlas hoy (precio y si te alcanza) y «Ir a la tienda». En el móvil, tocar sigue abriendo su pantalla | `game/HoverPanel.tsx` y `game/GameStatsBar.tsx` |
| Perfil de un icademer en el ranking | Tocar la inicial o el nombre (también en el podio) abre una ventana con su nombre, idioma que aprende, nivel, sus insignias (la más alta de cada categoría) y «Desafiar a …». Si no se puede, «No se puede desafiar a este icademer» con el motivo. «Desafiar» lleva a `/desafios-ica?retar=<id>`, que abre el reto con esa persona (Por idioma si es de tu idioma y nivel; si no, Global). En el podio, los puntos abren el detalle de puntos | `game/IcademerProfile.tsx`, `game/ranking.tsx`, `views/LeaderboardView.tsx`, `views/IcaChallengesView.tsx` |

### Noche del 1 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Desplegables con el estilo de la app | Los `<select>` del coaching (filtros de «Tus alumnos», asignar clase, cambiar coacher…) abrían el menú gris del sistema. Ahora usan `AppSelect`, que se escribe igual que un `<select>` (mismas `<option>` y `onChange`) pero abre el menú de ICA | `components/ui/app-select.tsx`, 4 vistas de coaching |
| Flashcards «Solo por aprender» | Fallo confirmado: casi todas las pendientes son nuevas y `buildReviewRound` solo deja 2 nuevas por ronda (y espera 2 días), así que salían 2 tarjetas. Con «Solo por aprender» ya no se aplican esos topes (opción `ignoreNewCardLimits`) | `utils.ts`, `ReviewView.tsx` |
| Botón de sonido en las flashcards | Altavoz arriba a la derecha de la ronda para quitar o poner los sonidos de acierto y fallo (mismo ajuste que en Perfil) | `game/SoundToggleButton.tsx` |
| Sonidos de insignias nuevos | Sustituidos el 2 de octubre por un whoosh suave (ver abajo) | `game/badgeSounds.ts` |

### 2 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Pronunciación transcrita | Debajo de la palabra sale cómo suena, escrito a la manera del idioma del alumno: para un hispanohablante, beaucoup → /bocú/; para el resto, sílabas con la tónica en mayúsculas. Sale en el reverso de las flashcards y en «Últimas añadidas» de Inmersión. Se activa o se quita en Perfil (bloque «Pronunciación», «Visible» / «Oculta»; viene activada). Se pide a Haiku en lotes de hasta 20 palabras (la IA devuelve una lista en el mismo orden, así la respuesta no se corta) y se guarda en el navegador, así que cada palabra se pide una sola vez por dispositivo. Las flashcards piden toda la ronda al empezar; mientras llega sale «/ · · · /», y si falla se reintenta sola a los 2, 8 y 25 s | `modules/pronunciation/`, `ReviewView.tsx`, `AddView.tsx`, `ProfileView.tsx`, `MobileProfileSheet.tsx`. Servidor: acción `pronunciation` en `anthropic-proxy` (`_shared/pronunciation-prompt.ts`) |
| Sonidos de insignias: whoosh | Fuera las melodías: un golpe de aire muy suave que cruza de izquierda a derecha. Bronce y plata, un swish corto; oro y rubí, un whoosh más largo con uno o dos brillos casi en susurro; diamante, ida y vuelta con tres brillos. Picos de unos −18 dB y de 0,2 a 1,4 segundos. Hay 3 packs para escuchar (whoosh, aire, swish); la app usa `whoosh` | `game/badgeSounds.ts` |
| Marca ICA en el camino | El camino de Inicio va sobre el azul ICA (`--ica-brand`, #87def9). I, C y A son fichas azules con borde y letra blancos; al hacerlas se invierten (blanca con la letra azul) y llevan el check azul arriba. Las bloqueadas son de trazo discontinuo. La línea entre fichas es azul en lo hecho y blanca en lo que falta. El cofre y el Reto del día son fichas claras con el dibujo en azul (el cofre azul guarda monedas doradas), para separarlos a simple vista de I, C y A (idea de una administradora); bloqueados, más apagados y con trazo discontinuo. En modo oscuro, el mismo diseño sobre un azul más profundo | `game/IcaPath.tsx`, `game/icons.tsx`, variables `--ica-brand*`, `--ica-road-*` y `--ica-reto*` en `index.css` |
| Logo ICA | El logo de ICADEMY sin «DEMY»: marco redondeado abierto abajo, birrete y «ICA» en Nunito 900. Va en la barra de arriba | `game/IcaLogo.tsx`, `Header.tsx` |
| Rojo y naranja más suaves | Menos brillantes, con algo más de blanco, para que no compitan con el azul ICA: `--ica-fire` (racha), `--ica-a` y `--ica-bad-strong` (botón «No la sabía»). Afecta a toda la app | `index.css` |
| Camino sin recuadro | El camino de Inicio va directamente sobre el fondo de la app (ya no dentro de un recuadro azul); solo las fichas llevan el azul ICA. Colores en la clase `.ica-path-skin` | `game/IcaPath.tsx`, `index.css` |
| Cofre y Reto del día cambian de color al activarse | Bloqueados: ficha clara con el dibujo en azul. Cofre listo para abrir: dorado (placa dorada, cofre de madera, brillo); abierto: blanco con las monedas y el check. Reto del día disponible: morado (color de minijuego, `--ica-reto` #a259f0) con un mando de videojuego (antes salía el icono del modo, p. ej. el enlace de Parejas); hecho: blanco con check. Texto debajo: «Mínimo 5 correctas» (ver más abajo) | `game/IcaPath.tsx` |
| «Estoy aquí» | Si tocas un paso bloqueado (p. ej. Activación sin haber hecho Inmersión), además de temblar, el paso que toca hacer da un solo salto suave y lento (0,9 s) y brilla un poco | `nudgeStep()` en `game/IcaPath.tsx`, animación `ica-nudge` en `index.css` |

| I, C y A en tres azules | Creación, Activación y el resto de pantallas de cada fase dejan el lila y el rosa: Inmersión celeste (#3fc1ec), Creación azul (#3b82f6) y Activación azul oscuro (#1e5fb4). También en la imagen de los trackers | variables `--ica-i*`, `--ica-c*`, `--ica-a*` en `index.css`, `Trackers/TrackerChartPreview.tsx` |
| Letras del logo dibujadas | «ICA» del logo va como dibujo (Nunito 900 convertida a trazo), no como texto: así sale igual desde el primer instante, aunque la letra Nunito aún no haya cargado (antes se veía un momento con otra letra) | `game/icaLogoPath.ts`, `IcaLogo.tsx`, `index.html`, `monthlyRecap.tsx` |
| Avisos del camino | Inmersión: «Empieza aquí»; Creación y Activación: «Sigue aquí»; cofre: «¡Ábrelo!»; Reto del día: «Termina aquí». Un cofre ya abierto hoy se queda abierto (sin candado) aunque luego se borre la frase de la C o la grabación de la A | `game/IcaPath.tsx` |
| Fases hechas en azul con brillo | I, C y A hechas: ficha azul ICA intenso con la letra blanca y un destello que la cruza (como las insignias de rubí y diamante), en ola I → C → A. La que toca sigue en celeste con su aro. El cofre listo para abrir lleva también un aro dorado | `game/IcaPath.tsx` (`DoneShine`, `CHEST_RING`), animación `ica-shine` |
| «Tú» en el ranking más oscuro | Tu puesto y tu fila usan un azul ICA más oscuro (`--ica-me` #0b6f99) en vez del celeste | `index.css`, `game/ranking.tsx`, `LeaderboardView.tsx` |
| Reto, cofre y textos del camino | Reto del día hecho: sigue morado, con el mando blanco y un borde blanco fino (ya no se vuelve blanco). Cofre abierto: fondo dorado claro con borde blanco fino. I, C y A hechas: azul con borde blanco fino y brillo. Solo el paso que toca lleva texto debajo (p. ej. «Graba una nota con tu voz»); los demás, solo el nombre, centrado con la ficha | `game/IcaPath.tsx` (`retoTileStyle`, `chestTileStyle`, `Label`) |
| Logo más fuerte y saludo alegre | El azul del logo (cabecera, pantalla de carga y arranque de la app) pasa de #0b84b5 a #0a72a3, más cerca del azul de las fases hechas, sin llegar a marino. En modo oscuro, #1597cc (el azul de arriba de las fichas hechas), en vez del celeste #87def9. El cofre abierto, un dorado algo más intenso. El saludo va con exclamación: «¡Hola, Clara!» en español y catalán, «Ciao, Clara!» en el resto, «你好，Clara！» en chino y japonés; si el nombre no cabe, «¡Hola!» | `index.css` (`--ica-logo`), `index.html`, `game/welcomeGreeting.ts`, `game/IcaPath.tsx` |
| Camino: nombres debajo y relleno al avanzar | Móvil: el nombre de cada paso va centrado debajo de su ficha (con «SIGUE AQUÍ» y el texto de ayuda si toca). Móvil y ordenador: al volver a Inicio tras hacer un paso, la línea discontinua se pinta hasta el siguiente, que sigue con candado hasta que llega el relleno y entonces da un salto, suena y sale «SIGUE AQUÍ». Una sola vez: se guarda por usuario y día en `localStorage` `ica-path-seen-v1:<userId>`. Si se hacen varios pasos seguidos sin pasar por Inicio, solo se rellena el último tramo. Al abrir el cofre, espera a que se cierre la celebración. Sin animación con «reducir movimiento» | `game/IcaPath.tsx`, `game/pathFill.ts`, `game/CycleCelebration.tsx` (`CYCLE_CELEBRATION_CLOSED_EVENT`), `index.css` (`ica-road-fill`) |
| Insignias que giran con el whoosh | Al abrir una insignia (Insignias, perfil, ranking y perfil de otro icademer), al cambiar de rango y al tocarla, da una vuelta completa como una moneda y acaba de cara. El whoosh suena justo cuando gira más rápido. Tiene canto (grosor), dorso más oscuro, luz que cambia al girar y sombra que se estrecha de canto. Con «reducir movimiento» no gira y solo suena | `game/SpinningMedal.tsx`, `game/MedalDetail.tsx`, `game/ranking.tsx`, `game/sfx.ts` y `game/badgeSounds.ts` (opción `delay`, `badgeWhooshPeak`) |
| Cofre: «Gana de 1 a 5 ICA Coins» | El texto bajo «¡ÁBRELO!» ya no repite «Ábrelo»: ahora dice «Gana de 1 a 5 ICA Coins» | `game/IcaPath.tsx`, `i18n/en/modo-juego-octubre.ts` |
| Camino del móvil sin hueco al final | Debajo del Reto del día solo se guarda sitio para «TERMINA AQUÍ» y su texto cuando salen; si no, el camino acaba justo bajo «RETO DEL DÍA» | `game/IcaPath.tsx` |
| Insignia en grande sin texto debajo | Al tocar la insignia de alguien (ranking, perfiles): la insignia, su nombre y el rango. Fuera la línea de abajo («90 días», «90 % de eficacia»); queda solo para el lector de pantalla | `game/ranking.tsx` (`FeaturedBadgeMini`) |
| Desafíos: modos con el diseño de Juegos ICA | Al retar, Lectura, Escritura, Escucha, Habla, Parejas y Próximamente son tarjetas como las de Juegos ICA (borde, dibujo a color en un cuadrado suave, nombre y una línea). Dibujos nuevos: libro, lápiz, cascos, bocadillo con voz, dos tarjetas unidas y reloj de arena. Lo no disponible lleva candado. La cabecera del paso de reglas usa el mismo dibujo | `components/IcaChallenges/ChallengeModePicker.tsx` (`glyph`, `color`, `ModeGlyphBadge`), `game/icons.tsx`, `views/IcaChallengesView.tsx` |
| «Desafiar» desde un perfil, sin pasos intermedios | Al pulsar «Desafiar a …» el botón se queda cargando (como mucho 4 s) mientras se precargan los datos de Desafíos; la página abre ya con ellos y la ventana «Retar a …» con los modos se abre antes de pintarse (sin «Cargando desafíos…» ni ver la lista primero). La precarga vale 30 s; después de retar o aceptar siempre se piden datos nuevos | `hooks/useIcaChallengesOverview.ts` (`prefetchIcaChallengesOverview`), `game/IcademerProfile.tsx`, `views/IcaChallengesView.tsx` (`useLayoutEffect` de `?retar=`) |
| Desafíos: reglas fijas al retar | Ya no se eligen segundos ni duración: Lectura 5 s por palabra; el resto, los segundos de su modo; siempre 1 día para jugar. Se ven como dos fichas con un reloj («5 s · por palabra») y un calendario («1 día · para jugar»). Rondas: solo «1 ronda de 10 palabras» o «2 rondas de 5» (también en Parejas: 1 ronda con los 2 tableros o 2 de 1 tablero); fuera «5 de 2» y «10 de 1». Cuenta atrás: sin rondas, «60 s en total». Explicación de cada modo con los idiomas de quien reta («Ves la palabra en español y la escribes en francés»); Parejas: «Si empatan, gana quien tarde menos». Fuera los avisos de micrófono, sonido y tableros; el de tildes y teclado va destacado en rojo suave | `views/IcaChallengesView.tsx` (`getModePitch`, `FixedRule`, `READING_SECONDS`, `CHALLENGE_DAYS`), `ChallengeModePicker.tsx` (textos de Escritura) |
| Vocabulario ICA: diamante con 1000 palabras | Rangos: 50, 100, 200, 500 y 1000 (antes 750). Solo está en la app (el servidor no lo calcula). Quien tuviera entre 750 y 999 palabras pasa a rubí | `game/achievements.ts` |
| Sin destello blanco al abrir o recargar | `index.html` pone el fondo de la app y, en oscuro, la clase `dark` en `<html>` antes de cargar nada (la pantalla de carga de React salía clara un instante porque ThemeContext ponía `dark` después) | `index.html` |
| «Tu nivel» sale al momento | El último nivel visto se guarda en la caché rápida (`meta-tracker:<userId>:<idiomas>`) y se enseña mientras llega el nuevo, en la barrita del móvil y en la tarjeta del ordenador. La primera vez, la barrita vacía y quieta en vez del bloque gris parpadeando. Arreglado también que saliera un instante «Sitúa tu nivel real» antes de la primera carga | `services/metaTracker.ts` (`peekMetaTrackerProfile`), `game/useLevelProfile.ts`, `game/LevelStrip.tsx`, `game/LevelCard.tsx`, `hooks/useDashboardICA.ts` |
| Retar: «Cambiar de modo» | En la ventana de un modo, el botón «Volver» pasa a «Cambiar de modo» (con icono): vuelve a los modos sin cerrar la ventana | `views/IcaChallengesView.tsx` |
| Checks del camino a la misma distancia | El check (y el candado) sobresale 8 px de la esquina en todas las fichas, en móvil y ordenador (en I, C y A del ordenador y en las fichas de la derecha del móvil quedaban más separados que en el cofre) | `game/IcaPath.tsx` |
| Tienda: dibujos nuevos | «Intento extra de PreguntICA» (micrófono con «+») dibujado como el desafío extra. «Ampliar el día» se sustituyó el 3 de octubre (ver abajo) | `game/icons.tsx` (`PregunticaExtraGlyph`), `views/FichasView.tsx` |
| ICA Coins: movimientos plegados | Se ven los 4 últimos; el resto con «Ver todos (n)» / «Ver menos» (hasta 40) | `views/FichasView.tsx` |
| Azul de la I y «Ciclo ICA completado» | `--ica-i` pasa de #3fc1ec a #3aaeee (un poco más cerca del azul de la C): límites de hoy, Inmersión, etc. En la celebración del cofre, I, C y A con sus tres azules (como en «Tus límites de hoy») y letra blanca. Debajo, solo «Racha ICA: N días» (fuera «A los 7 días seguidos ganas…») | `index.css`, `game/CycleCelebration.tsx`, `Trackers/TrackerChartPreview.tsx` |
| Saludo «Buenos días» / «Hola» | En móvil, al entrar: «Buenos días» de 5:00 a 12:59 y «Hola» el resto del día, en el idioma objetivo. Entra subiendo desde abajo con un pequeño rebote. Si con el nombre no cabe, se quita el nombre o baja el tamaño de letra (18/16/14). En rumano «Bună dimineața» no cabe y usa «Salut» | `game/welcomeGreeting.ts`, `game/WelcomeBrand.tsx`, test `welcomeGreeting.test.ts` |
| Ranking sin «Ver con gente de ejemplo» | Quitado por completo el modo de ejemplo del ranking (botón, datos y textos). Borrados `game/rankingDemo.ts` y `hooks/useIsSuperAdmin.ts`, que eran nuevos de esta rama | `views/LeaderboardView.tsx`, `i18n/en/base2.ts` |
| Recap: recuadro del ranking | Con los colores del anuncio del Coaching (degradado azul #1d4ed8 → morado #6d28d9 → fucsia #9d174d, con brillo rosa en la esquina) y los números en dorado. Elegido por Luis entre 4 opciones | `game/monthlyRecap.tsx` |
| Cerrar «Ciclo ICA completado» tocando fuera | Tocar la parte oscura de arriba (fuera de la tarjeta) sale de la pantalla. Si el cofre es nuevo, recoge las ICA Coins igual que el botón (no se pierden) | `game/CycleCelebration.tsx` |
| Reto del día: todos los modos y aprobado con 5 | Rota entre los modos de Desafíos: Parejas, Lectura, Escritura, Escucha y ahora también Habla (se salta si el navegador no tiene reconocimiento de voz). Solo cuenta como hecho con 5 aciertos o más (`DAILY_GAME_PASS`): con menos, «¡Casi!», «Mínimo 5 correctas para completarlo» e «Intentarlo otra vez», y el camino no lo marca como hecho. Bajo «TERMINA AQUÍ», una sola línea: «Mínimo 5 correctas». El resultado sigue guardándose solo en el dispositivo | `game/dailyGame.ts`, `views/DailyGameView.tsx`, `game/IcaPath.tsx`, tests `dailyGame.test.ts`, `gameRules.test.ts` |
| Cofre sin sonido | Sustituido el 3 de octubre: ver «Cofre: suena solo la primera vez» | `game/CycleCelebration.tsx`, `game/IcaPath.tsx` |
| Saludo al entrar (móvil) | Al abrir la app en el móvil sale a la izquierda «Ciao, Clara» (el «hola» del idioma que aprende y su nombre) con el logo en el centro; al segundo y medio el logo se desliza a su sitio y el saludo va delante de él a la misma velocidad mientras se desvanece. Si el nombre no cabe, sale solo el «hola» (nunca «…»). Una vez por sesión. Hay «hola» para los 28 idiomas (chino y japonés con su propia coma) | `game/WelcomeBrand.tsx`, `game/welcomeGreeting.ts`, `Header.tsx` |
| Logo al cargar | Mientras carga la app sale el logo ICA en el centro (en `index.html`, así se ve antes de que arranque React, en claro u oscuro según el tema). Las pantallas de carga internas enseñan el mismo logo, del mismo tamaño y en el mismo sitio, así no hay salto al pasar de una a otra | `index.html`, `components/ui/fullscreen-loading.tsx` |
| Ciclo ICA completado y recap del mes | Fuera los colores antiguos de I, C y A. En «Ciclo ICA completado», tres fichas blancas con la letra y el check azules (como en el camino). En el recap del mes, arriba va el logo ICA en blanco y el fondo y los números son de la gama azul | `game/CycleCelebration.tsx`, `game/monthlyRecap.tsx` |
| De Creación a Activación sin perderse | Si hoy ya está hecha la C y la última frase (de hoy) aún no se ha grabado, Creación la enseña arriba con «Activar ahora», y Activación pone en la nota en curso «Tu frase nueva» con el botón «Grabar esta frase», que lleva directo a grabarla. Dentro de la nota maestra: la próxima frase grande con un solo botón «Grabar esta frase»; «Elegir otra frase» y «Frases activadas en esta nota» van plegados (la lista enseña 8 frases y «Ver más frases»), y la nota desafiante va al final | `services/pendingActivation.ts`, `hooks/usePendingActivationPhrase.ts`, `components/PendingActivationCard.tsx`, `PhraseView.tsx`, `MasterNotesView.tsx`, `MasterNoteDetailView.tsx` |
| Desafíos · Pendientes más simple | Filas sencillas: foto, nombre, «quedan 19 h · tipo de reto» y un botón. Los retos recibidos: «Aceptar» y una X para rechazar. Los enviados: «Cancelar». Sin etiquetas de estado | `IcaChallengesView.tsx` |

### 3 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Cofre: suena solo la primera vez | Al abrir el cofre del día por primera vez (cuando da las monedas) suena como antes: el cofre, y una moneda por cada una que vuela al recogerlas. Si ya está abierto y se vuelve a tocar para verlo, no suena nada | `game/CycleCelebration.tsx` (`next.fresh`) |
| Ranking: el 0,1 vuelve a «10 minutos» | Se quita la regla «escucha + nota desafiante». El 0,1 diario vuelve a ser 10 minutos de notas maestras escuchadas, como en production. La migración se queda solo con la tabla de partidas de la nota desafiante (ver «Migraciones nuevas») y el texto del ranking vuelve a decir «0,1 cada día que escuchas 10 minutos de notas maestras» | `supabase/migrations/20261001140000_master_note_challenge_plays.sql`, `views/LeaderboardView.tsx` |
| Ampliar por fase | Fuera «Ampliar el día» (50, las tres fases). Ahora hay una compra por fase, 15 ICA Coins cada una, solo para ese día: Inmersión (20 palabras en vez de 10), Creación (4 frases en vez de 2) y Activación (4 en vez de 2). El aviso de límite de cada pantalla ofrece ampliar esa fase. Una compra antigua de «Ampliar el día» guardada en el navegador sigue valiendo para las tres ese día | `game/rules.ts` (`PHASE_BOOST_COST`, `LIMIT_PHASE`), `game/fichas.ts` (`buyPhaseBoost`, `hasPhaseBoost`, `phaseBoostsToday`), `game/limits.ts`, `game/DailyLimitNotice.tsx`, `AddView`, `PhraseView`, `MasterNotesView`, `MasterNoteActivatePhraseView` |
| Dibujo de cada fase | Ficha de la fase (I, C o A, en su azul) con un rayo dorado. En la tienda y en el desplegable de ICA Coins | `game/icons.tsx` (`PhaseBoostGlyph`) |
| Tienda: precio animado | Al pasar el ratón (o llegar con el teclado) por el precio: se vuelve dorado, sube 2 px, la moneda da una vuelta y lo cruza un brillo. Sin animación con «reducir movimiento» y sin efecto en pantallas táctiles | `index.css` (`.ica-price`, `.ica-price-pill`), `views/FichasView.tsx` (`PriceButton`), `game/GameStatsBar.tsx` |
| Desplegable de ICA Coins al día | Enseña las 5 compras de la tienda con su dibujo (desafío extra, las tres fases y PreguntICA extra), si te alcanza o «Activo hoy», y los nombres largos pasan a dos líneas en vez de cortarse | `game/GameStatsBar.tsx` (`CoinsPanel`) |
| Coaching se despliega al pasar el ratón | En el ordenador, al poner el ratón sobre «Coaching» caen los alumnos (con «por revisar»), «Todos» y «Calendario»; se puede bajar al menú sin que se cierre y se cierra al salir. Clic en un alumno abre su ficha. Con el dedo o el teclado funciona como antes (tocar para abrir) | `components/Header.tsx` (`useHoverOpen`, `CoachQuickAccess`) |
| Test de `useMasterNotePlayback` | Arreglado (ver «Lee esto primero»). Ya pasan los 230 | `tests/unit/modules/hooks/useMasterNotePlayback.test.tsx` |

### Tarde del 3 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Economía de la ICA Coin | Para que la moneda no pierda valor. Investigación y simulación (3 tipos de alumno, 90 días): un alumno regular ya ganaba unas 18 a la semana (una ampliación semanal, que es lo buscado), pero el muy activo ganaba 35 y acumulaba 267 en 90 días, la mitad por desafíos. Cambios: 1) máximo 7 ICA Coins por semana con desafíos ganados (el resto se apunta con 0 y en la pantalla del reto sale «Esta semana ya sumaste 7…»); 2) hucha de 100: por encima el cofre y los desafíos no suman (el cofre se abre igual y lo dice), aviso desde 80. El cofre sigue igual (1–5, media 2). (Se probó también subir el precio de cada ampliación en la semana, 15/20/25, pero Luis prefirió dejarlas a 15.) Con esto el muy activo nunca pasa de 100; el regular y el casual casi no cambian | `game/rules.ts` (`CHALLENGE_WIN_WEEKLY_CAP`, `COIN_WALLET_CAP`), `game/fichas.ts` (`weekStartKey`, `challengeWinCoinsThisWeek`, `walletRoom`, `claimCycleChest` devuelve `{ coins, rolled }`), `FichasView`, `GameStatsBar`, `CycleCelebration`, `IcaChallengePlayView` |
| Racha en peligro | Aviso en Inicio desde las 19:00 si hay racha y el ciclo de hoy no está hecho: reloj naranja con el minutero girando, «Te quedan 4 h 32 min» y «Haz tu ciclo ICA antes de que sea tarde para no perder tu racha de N días». Notificación del servidor a las 19:00 (ver «Funciones») e interruptor «Racha en peligro» en Notificaciones | `game/streakRisk.ts`, `game/StreakRiskBanner.tsx`, `game/icons.tsx` (`StreakClockIcon`), `HomeView`, `ManageNotificationsView`, `services/pushReminderPreferences.ts`, `public/push-clock-192.png` |
| Chat de icademers | Un chat cerrado por idioma objetivo (`/chat-icademers`). 8 mensajes: «¿Alguien se apunta al Club de DinámICA?», «¡Hola!», «¡Yo me apunto!», «¿A las…?» (hora de 15 en 15 min; quien lo lee en otra zona horaria ve también «Para ti: 10:45»), «¡Genial!», «¡Nos vemos allí!», «Hoy no puedo» y «¡Ánimo con la racha ICA!». Arriba, «Icademers de polaco · 23 personas en este chat» (sin lista de miembros). Cada mensaje con nombre e inicial y un color por persona. Máximo 3 seguidos. Se actualiza cada 8 s con la pantalla abierta. Entradas: invitación que sale una sola vez al cerrar la celebración del cofre (si aún no estás dentro) y fila «Chat de icademers» en Perfil, debajo de Notificaciones, con los mensajes nuevos | `views/IcademerChatView.tsx`, `services/icademerChat.ts`, `game/icademerChat.ts`, `game/useIcademerChat.ts`, `game/ChatInvite.tsx`, `game/ChatProfileRow.tsx`, `ProfileView`, `MobileProfileSheet`, rutas en `paths.ts`, `DashboardPages.tsx` y `App.tsx` |
| Chat: avisos, plegar y salir | Al entrar al chat (la primera vez) pregunta «¿Quieres recibir notificaciones de este grupo?» Sí / No; con «Sí» activa los avisos en ese dispositivo. Se cambia en Perfil > Notificaciones, apartado «Chat». La parte de abajo se llama «Enviar mensaje» y se pliega con «Ocultar» / «Mostrar» (se recuerda en el dispositivo). «Salir del chat» pide confirmación: «¿Seguro que quieres salir del chat de Icademers de polaco?» Sí, salir / No, quedarme | `views/IcademerChatView.tsx` (`ChatSheet`), `views/ManageNotificationsView.tsx`, `services/icademerChat.ts`, `supabase/functions/icademer-chat-push`, `public/push-chat-192.png` |
| Chat: cada uno en su hora | Quien manda «¿A las…?» elige la hora en su hora local (lo dice: «Pon la hora de Madrid, la tuya. A cada icademer le llega pasada a su hora local»). Se guarda la hora y su zona. Quien lo lee en otra zona ve la hora ya pasada a la suya, con la original en pequeño: «¿A las 19:30? · En tu hora. Ana propuso las 11:30 de Ciudad de México.» Si cambia el día, lo dice («del día siguiente»). La notificación también llega en la hora de cada uno. En la pantalla de entrada: «Las horas se ajustan solas» | `game/icademerChat.ts` (`timeInViewerZone` con `dayShift`, `zoneCity`), `views/IcademerChatView.tsx` |

Luis comparó cuatro estilos para el camino (pantalla azul, sin recuadro, tarjeta, azul que se funde) y eligió «sin recuadro»; las otras propuestas ya están borradas.

Aplazado por Luis: un chat entre icademers al acabar un desafío (para animar a ir al Club de Dinámica).


## Estado actualizado en esta rama · implementación para producción

Las propuestas de las siguientes subsecciones describen la auditoría original y quedan como referencia histórica. Su implementación está en `20261003120000_ica_coins_server_authority.sql` y los cambios de cliente/Edge Functions de esta rama. ICA Coins usa el saldo/ledger existente de PreguntICA; las cantidades locales no se importan.

| Pieza | Estado en esta rama |
|---|---|
| ICA Coins y movimientos | RPCs servidor para estado, cofre, hitos, ampliaciones y pase; ledger idempotente, lock por usuario y premio de victoria por trigger. El cofre y las victorias respetan el tope selectivo de 100; el saldo total puede superar 100 por ranking/hitos. |
| Cuarto desafío | El pase se cobra en servidor. Creación del reto, competidores y consumo se confirman en una sola transacción. El retador gasta su pase y la invitación reserva el espacio del destinatario. |
| Límites diarios | Triggers cuentan palabras, frases nuevas y primeras grabaciones con timestamps de servidor; las regeneraciones del mismo conjunto y regrabaciones no gastan cuota. Las ampliaciones se leen del ledger. |
| Flashcards y nota desafiante | Revisión valida en servidor las 20 palabras activadas y calcula la métrica sin fecha/deltas arbitrarios. La nota desafiante exige dos notas maestras cerradas y usa la zona/día del perfil. |
| Reacciones e insignia destacada | Persistidas en Supabase; las reacciones se limitan a participantes y dos seguidas. La insignia destacada se valida contra métricas servidor y se devuelve en rankings. |
| Reto del día | Resultado mejor sincronizado por usuario y día local; no da monedas ni puntos. |
| Zona horaria | Hasta cuatro cambios en 24 horas para facilitar viajes; las cuotas existentes se recalculan en la zona nueva. Escrituras directas del perfil quedan bloqueadas. |

La migración se reconstruyó desde cero con `supabase db reset --local`. Antes de habilitar producción, aplicar migraciones, desplegar `ica-challenges-center` y publicar el cliente actualizado.

### Histórico de la auditoría original: vista previa anterior

En development se puede probar tal cual. Para production, cada pieza hay que llevarla al servidor o esconderla. Las ICA Coins son la misma moneda que las «fichas» de PreguntICA que hay hoy en production (`preguntica_token_ledger`, las que da el ranking de cada mes), con otro nombre: arriba se enseña servidor + vista previa, pero PreguntICA solo gasta lo del servidor (Luis veía 60 arriba y 42 al canjear).

| Pieza | Hoy (navegador) | Qué hace falta en el servidor |
|---|---|---|
| ICA Coins nuevas: cofre (1–5), hitos de racha ICA y de flashcards, +1 por desafío ganado (máx. 7 por semana), ampliar una fase (15), pase de desafío extra (15), hucha de 100 | `localStorage` `ica-fichas-preview-v1:<userId>` (`game/fichas.ts`) | Ver «Propuesta: ICA Coins en el servidor» |
| Desafío extra (4.º reto) | El pase se compra en la vista previa (15 monedas del navegador) y la app manda `useExtraSlot: true` a `create-challenge` | El servidor no sabe nada de pases: el límite sigue fijo en `MAX_ACTIVE_CHALLENGES = 3` (`index.ts`, que se lo pasa a `invitations.ts`, `directory.ts` y `profile.ts`) y `useExtraSlot` se ignora. Resultado hoy: con 3 retos en curso, el 4.º lo rechaza el servidor («Ya tienes 3 desafíos activos»). Las monedas no se pierden del todo (el pase queda sin usar en el navegador), pero no hay forma de gastarlo. No basta con subir el límite a 4 si llega `useExtraSlot`, porque cualquiera podría mandarlo sin pagar: el servidor tiene que poder comprobar que hay un pase pagado, y para eso las ICA Coins tienen que estar antes en el servidor (propuesta de abajo). Pasos: 1) `buy_challenge_pass()` cobra 15 en el ledger y crea el pase; 2) tabla `ica_challenge_passes (id, user_id, ledger_entry_id unique, used_challenge_id uuid unique null, used_at)`; 3) en `create-challenge` (y al aceptar, en `invitations.ts`), si `myActive >= 3 && useExtraSlot`, gastar un pase en la misma transacción que el insert y permitir hasta 4; 4) en el cliente, `buyChallengeSlot` y `consumeChallengeSlot` llaman al servidor. Mientras tanto, mejor esconder la oferta en production |
| Límites diarios (10 palabras, 2 frases, 2 activaciones; ×2 en la fase ampliada) | Solo el cliente (`game/limits.ts`). Las frases se cuentan en `localStorage` `ica-phrases-today-v1:<userId>` | Triggers `BEFORE INSERT` en `lexicards`, `phrase_generations` y `phrase_voice_activations` que cuenten por `now()` en la zona del perfil (no por el `created_at` que manda el cliente) y lancen `DAILY_LIMIT_<TIPO>`. Hace falta distinguir regeneraciones (habría que crear una columna, p. ej. `phrase_generations.is_regeneration`) y decidir si regrabar cuenta como activación |
| Reacciones al acabar un desafío | `localStorage` `ica-challenge-reactions-v1` (la clave no lleva usuario) | Tabla `ica_challenge_reactions (id, challenge_id fk, sender_user_id, kind check ('face','phrase'), value check (lista cerrada), created_at)`, RLS de lectura solo para los 2 jugadores, y acciones `send-reaction` (participante, reto `completed`, máximo 2 seguidas) y `list-reactions` en `ica-challenges-center`. Hoy el rival no las recibe |
| Insignia destacada | `localStorage` `ica-featured-badge-v1:<userId>` (`game/featuredBadge.ts`) | `profiles.featured_badge text` con check `^(rachaICA\|rachaFlash\|ranking\|eficacia\|vocab\|desafios):(bronce\|plata\|oro\|rubi\|diamante)$`, RPC `set_my_featured_badge(p_badge)` y devolverla en `get_monthly_streak_leaderboard`, `snapshot_monthly_leaderboard` y `get_monthly_snapshot_leaderboard` (cambia el tipo de retorno: `drop function` antes). El front ya la lee. Los umbrales de las insignias solo están en `game/achievements.ts` |
| Resultado del Reto del día | `localStorage` `ica-daily-game-v1:<userId>` | Opcional: tabla `ica_daily_game_results (user_id, day, kind, correct, total, finished_at, PK (user_id, day))` y RPC `save_daily_game_result(p_kind, p_correct, p_total)` que decida el día y guarde el mejor. No da monedas ni puntos |

### Propuesta: ICA Coins en el servidor

- **Tipos nuevos** en el check de `entry_type`: `cycle_chest`, `streak_milestone`, `flash_milestone`, `challenge_win`, `phase_boost`, `challenge_pass`. Columnas nuevas `reference_day date` y `reference_key text`.
- **Unicidad**: un cofre por usuario y día (`unique (user_id, entry_type, reference_day) where entry_type = 'cycle_chest'`); una ampliación por fase y día (`unique (user_id, entry_type, reference_day, reference_key) where entry_type = 'phase_boost'`, con `reference_key` en `('words','phrases','activations')`); un hito o desafío una sola vez (`unique (user_id, entry_type, reference_key) where entry_type in ('streak_milestone','flash_milestone','challenge_win')`).
- **Hoy del usuario**: helper `ica_local_today(uid) → date` con `profiles.timezone`. Ninguna RPC de premios debe fiarse de un `p_day` que mande el cliente.
- **RPCs** (`SECURITY DEFINER`, `search_path` fijo, mismo `pg_advisory_xact_lock` que el canje):
  - `get_my_ica_coins_state()` → saldo, hoy, monedas del cofre de hoy, fases ampliadas hoy, pases sin usar, hitos ya cobrados.
  - `claim_cycle_chest()` → recalcula el día con `recompute_daily_creation_metrics_for_user_day`, exige `daily_metrics.creation_goal_completed` (la misma regla que el cliente), tira las monedas con las probabilidades de `game/rules.ts` (`CYCLE_CHEST_ODDS`: 1→40 %, 2→30 %, 3→20 %, 4→8 %, 5→2 %) y, si ya existe, devuelve la fila de hoy.
  - `claim_streak_milestones(p_kind)` → la racha la calcula el servidor (como `ica_streak_days` del ranking). Premios en `STREAK_MILESTONES` y `FLASH_STREAK_MILESTONES`.
  - `buy_phase_boost(p_phase)` (15; `p_phase` en `words`, `phrases`, `activations`) y `buy_challenge_pass()` (15).
  - Hucha: las RPC de premio (cofre, victoria) suman `least(premio, 100 - saldo)`; tope de 7 por semana en `challenge_win`.
- **Victoria en desafío**: trigger `AFTER UPDATE` en `ica_challenges` cuando pasa a `completed` con ganador y `finalized_at >= 2026-10-01`, +1 con `reference_key = id`. Tiene que ser trigger porque el ganador también se decide en SQL (caducidad de turnos), no solo en la función.
- **Cliente**: `useFichas` lee `get_my_ica_coins_state`; `claimCycleChest`, `claimReachedMilestones`, `claimReachedFlashMilestones`, `buyPhaseBoost`, `buyChallengeSlot`, `consumeChallengeSlot` llaman a las RPC; se borran las llamadas a `claimChallengeWinCoin` (`IcaChallengesView.tsx`, `IcaChallengePlayView.tsx`); «Movimientos» de `/fichas` lee el ledger (hoy solo enseña los de vista previa). Las entradas locales no se importan: sus cantidades no son de fiar.

### Economía de la ICA Coin

Lo pidió Luis el 3 de octubre: que la moneda no se devalúe (demasiado fácil de ganar y acumular) ni se vuelva imposible. Se simularon 3 alumnos durante 90 días (casual: ciclo 3 días por semana; regular: 5–6 días y ~1 desafío ganado al día; muy activo: todos los días y 2–3 desafíos ganados). Precios en «días de estudio»: una ampliación, unos 5–7 días de un regular; PreguntICA extra, unas 3 semanas.

| Alumno | Antes: monedas por semana | Ahora | Saldo a 90 días comprando 1 ampliación por semana (antes → ahora) |
|---|---|---|---|
| Casual | 6,8 | 7,4 | 14 → 14 |
| Regular | 17,9 | 18,4 | 57 → 63 |
| Muy activo | 34,8 | 25,7 | 267 → 100 (hucha llena) |

Qué medir cuando esté en el servidor (alertas): gastado/creado por semana entre 0,6 y 0,9 (alerta por debajo de 0,5 o por encima de 1,1 tres semanas seguidas); crecimiento del total de monedas por debajo del 12 % semanal; menos del 20 % de activos con la hucha llena; al menos la mitad de los activos compra algo cada 30 días; los desafíos, como mucho el 35 % de las monedas creadas (y vigilar parejas que lleguen al tope 3 semanas seguidas). Fuentes: Machinations (inflación en economías de juego), Department of Play, Adrian Crook (umbrales del 12 % y 40 %), informes económicos de EVE Online y el congelador de racha de Duolingo (200 gemas, máximo 2).

### Reglas que solo comprobaba el cliente antes de esta implementación

| Regla | Cliente | Servidor |
|---|---|---|
| Límites diarios, ampliación por fase, hucha y tope de desafíos | ver arriba | No |
| Desafío extra (4.º) | `IcaChallengesView.tsx` | Fijo en 3 |
| Flashcards desde 20 palabras activadas | `useActivatedWords.ts`, `DashboardPages.tsx` | No (`bump_daily_review_metrics` acepta cualquier `p_day`) |
| Nota desafiante con 2 notas maestras terminadas | `GamesIcaView`, `MasterNotesView`, `NotaDesafianteView` | No: las RPC solo comprueban que la nota es suya y está cerrada |
| Reto del día: 10 palabras y 5 aciertos | `game/dailyGame.ts` | No (no da premio) |
| 20 palabras para entrar en Desafíos | `ChallengesUnlocked` | Sí (`invitations.ts`) |

### «Hoy» antes de pasar las reglas al servidor (nota histórica)

Antes de esta implementación, la hora del dispositivo y el servidor podían diferir. En esta rama, premios, límites, resultados diarios y nota desafiante toman el día desde `profiles.timezone`; editar el reloj del móvil no cambia el día del servidor.

## Riesgos y detalles

- **Funciones `SECURITY DEFINER` y privilegios.** En Supabase, `revoke ... from public` no basta: los privilegios por defecto dan EXECUTE a `anon` y `authenticated` en cada función nueva de `public`. Las funciones de servidor deberían llevar `revoke execute ... from public, anon, authenticated`. La migración de seguridad lo hace con las que dan monedas, las del ranking mensual y los trabajos de Desafíos; conviene repasar el resto con `has_function_privilege('authenticated', ...)` en DEV.
- **Datos en el navegador.** `services/quickCache.ts` guarda en `localStorage` ranking, fotos del mes, analíticas de admin (con nombres), flags y permisos. Desde esta revisión se borra al cerrar sesión (`clearQuickCache` en `AuthContext`).
- **Tamaño.** El bloque principal pasa de 2,54 MB a 3,02 MB (de 797 a 944 KB con gzip). Unos 200 KB son los diccionarios de inglés, que se podrían cargar solo cuando la interfaz va en inglés.
- **Código sin usar.** `peekAdminRole`, `quickAge`, `ACTIVE_CALENDAR_ICADEMY_CATALOG` y `fetchTotalIcademers`/`peekTotalIcademers` ya no se llaman.
- **`LeaderboardView.test.tsx`.** El caso de foto con `ica_test_points: 0` ahora usa 0.7: ya no se prueba el valor cero.
- **`create-challenge`.** La app solo manda `rounds` 1 o 2, `responseSeconds` 5 (Lectura) y `durationSeconds` 86400. Tu validación de `develop` lo acepta (también 5 y 10 rondas); se puede estrechar.
- **Pronunciación.** Se guarda en el navegador (`ica-pronunciation-v1:*`). Más adelante, una columna en `lexicards` evitaría pedirla en cada dispositivo.
- **Clases ocultas del calendario.** Quien tenga avisos de una clase oculta no los ve en la app, pero siguen en el servidor. Para limpiarlos: `update public.users_calendar_icademy set notifications_enabled = false where class_key in ('fr_conv','en_avanzado','it_avanzado','de_basico','de_conv');`
- **Archivos borrados** (no los usa nada): `LeaderboardMenu`, `AppBreadcrumbs`, `useDashboardBreadcrumbs`, `MetaTrackerBar`, `MetaTrackerSection`, `ui/breadcrumb` y `ui/separator`.
- **`.gitignore`.** Ignora `.env.*` (menos `.env.example`), para que copias con claves no se suban nunca.
- **Ayudas de prueba quitadas.** A petición tuya: el simulador del camino, las monedas de prueba (`VITE_ICA_TEST_COINS`), el atajo de pronunciación de `pnpm dev` y la demo local de Desafíos. El modo local de Desafíos que queda es el tuyo.
- **Seguridad.** Si no está hecho, rotar la clave de Anthropic que salió en una captura el 30 de septiembre.

## Qué probar en development

- [ ] Cuenta nueva: login y registro en español; al llegar a 20 palabras salta la celebración de Desafíos.
- [ ] Inicio: I → C → A, abrir el cofre (suena), «Recoger mis ICA Coins» y ver volar las monedas (suena cada una). Tocar fuera de la tarjeta también la cierra. Volver a tocar el cofre ya abierto: se ve, pero no suena. Al volver a Inicio, la línea se rellena hasta el paso siguiente.
- [ ] Reto del día: con menos de 5 aciertos sale «¡Casi!» y el camino no lo marca; con 5 o más, sí. Probar Habla en Chrome.
- [ ] Tienda: la barra de la hucha llega a 100; con la hucha llena el cofre se abre pero no suma y lo dice.
- [ ] Racha en peligro: con racha y sin el ciclo hecho, a partir de las 19:00 sale el aviso con la cuenta atrás en Inicio y llega la notificación «Te quedan 5 horas» (con el móvil suscrito). En Notificaciones se puede quitar.
- [ ] Chat: completar el ciclo, cerrar la celebración del cofre y ver la invitación (una sola vez). Al entrar, la pregunta de avisos; con «Sí», al escribir otra cuenta llega la notificación (como mucho una cada 10 min). Plegar «Enviar mensaje». «Salir del chat» pide confirmación. Con dos cuentas en zonas distintas (p. ej. Madrid y México), «¿A las…?» sale en la hora de cada una. Con dos cuentas del mismo idioma: mandar mensajes, «¿A las…?» con una hora, el 4.º seguido se bloquea, el aviso de mensajes nuevos en Perfil. Con una cuenta de otro idioma no se puede entrar.
- [ ] Límites: la 11.ª palabra del día se bloquea. En la tienda, «Ampliar Inmersión» (15) deja llegar a 20 palabras ese día, y Creación y Activación siguen en 2. Lo mismo con las otras dos fases.
- [ ] PreguntICA con la semana bloqueada y al menos 50 ICA Coins en el servidor: «Jugarla ya» cobra, se puede jugar y la semana sigue bloqueada.
- [ ] Ranking: escuchar 10 minutos de notas maestras suma 0,1 ese día (como hasta ahora). Una nota desafiante terminada se guarda en `master_note_challenge_plays` y no cambia los puntos.
- [ ] Ranking: tocar a alguien, ver su perfil (tras desplegar `public-profile`) y «Desafiar»: abre «Retar a …» con los modos.
- [ ] Desafíos: retar en cada modo (1 o 2 rondas, reglas fijas), aceptar con menos de 20 palabras (mensaje del servidor) y Pendientes con retos recibidos y enviados.
- [ ] Insignias: abrir una de cada rango con el sonido activado (gira y suena).
- [ ] Ordenador: pasar el ratón por un precio de la tienda (dorado, sube, la moneda gira); por las ICA Coins de arriba (las 5 compras con su dibujo); con una cuenta de coacher, por «Coaching» (caen los alumnos; clic en uno abre su ficha).
- [ ] Flashcards: al girar sale la pronunciación (/bocú/); en Perfil, «Oculta» la quita.
- [ ] Traducir y corregir en Inmersión y Creación: la calidad de Haiku es aceptable.
- [ ] Calendario ICADEMY como alumno: no salen las clases ocultas y francés es «Francés». En el admin siguen todas.
- [ ] Estadísticas → recap del mes; ranking con más de 30 personas; la app en inglés (`?lang=en`); modo oscuro; móvil y ordenador.
- [ ] Cerrar sesión y entrar con otra cuenta en el mismo navegador: no queda nada de la anterior.
