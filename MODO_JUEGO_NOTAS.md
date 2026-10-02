# Cambios Dashboard ICA · Modo juego

1 de octubre de 2026 · Luis

Rediseño de toda la app con un modo juego propio del método ICA: camino I → C → A, cofre, ICA Coins, insignias, ranking nuevo y Reto del día. Lleva dentro Desafíos ICA, la interfaz en español e inglés y el coaching rediseñado. Hay 3 migraciones nuevas y 3 funciones que volver a desplegar (más una opcional, ver «Cambios de la tarde del 1 de octubre»). Algunas piezas de las ICA Coins son todavía una vista previa guardada en el navegador: sirven para development, no para production (ver más abajo).

## Rama y estado

| Dato | Valor |
|---|---|
| Rama | `feat/modo-juego`, solo en el PC de Luis. Sin commit ni push hasta que él lo diga |
| Sale de | `origin/feat/desafios-ica-modos` (6085f2b), que ya incluye `develop` en 75f78f8 |
| Cambios | 242 archivos: 72 nuevos, 163 modificados y 7 borrados (+35.377 / −15.297) |
| Incluye | Desafíos ICA completos y tus dos arreglos de develop pasados al diseño nuevo: d75af4d (tarjeta de coaching mientras carga) y 75f78f8 (meses siguientes en el calendario de coaching) |
| Backend | 3 migraciones nuevas. Desplegar `anthropic-proxy`, `lexicard-example-worker` e `ica-challenges-center` |
| Verificado | `tsc -b` y `vite build` sin errores. Tests: 204 de 205 (falla `useMasterNotePlayback`, que también falla en develop). Las 134 migraciones aplicadas en orden sobre un Postgres vacío |

### Orden de integración

1. `feat/desafios-ica-modos` → `develop`, como tenías previsto, con su migración y su función.
2. `feat/modo-juego` → `develop`. Va encima de la anterior; he simulado la unión y no hay conflictos.
3. `mejora/cargas-fluidas` choca en 32 archivos, porque esas pantallas se han rediseñado aquí. Es mejor rehacerla encima de develop cuando entre esta (Luis me lo puede pedir).
4. `fix/detalles-racha-y-tildes` (rama local de Luis, sin subir) ya está cubierta aquí y se puede borrar.

## Para subirlo a development

- [ ] Aplicar las migraciones en este orden:

| Migración | Qué hace |
|---|---|
| `20260928120000_ica_challenges_modes_server_questions.sql` | La de Desafíos (tuya, sin cambios) |
| `20261001120000_preguntica_extra_attempt_coins.sql` | PreguntICA extra por 50 ICA Coins, también con la semana bloqueada. Redefine 4 funciones con las mismas firmas: `redeem_preguntica_tokens_for_week`, `get_my_preguntica_week_status` (`can_start`), `create_preguntica_attempt` y `complete_preguntica_attempt` (el intento pagado ya no cierra la semana) |
| `20261001130000_nota_desafiante_weekly_unlock.sql` | El desbloqueo de la nota desafiante dura toda la semana: `bump_master_note_challenge_listening` acepta `p_day` hasta 7 días atrás (la app manda el lunes) |
| `20261001140000_ranking_point_listen_and_challenge_note.sql` | Tabla `master_note_challenge_plays` y RPC `record_master_note_challenge_play`. El 0,1 diario pasa de «10 min de escucha» a «3 min de escucha + 1 nota desafiante ese día», en `get_monthly_streak_leaderboard` y `snapshot_monthly_leaderboard` |

- [ ] Desplegar las funciones `anthropic-proxy` (Haiku), `lexicard-example-worker` (Haiku) e `ica-challenges-center` (Desafíos; al terminar un reto devuelve también las palabras del rival).
- [ ] Opcional: secret `ANTHROPIC_FAST_MODEL`. Si no se pone, usa `claude-haiku-4-5-20251001`.
- [ ] En Vercel: `VITE_ICA_CHALLENGES_LOCAL` sin definir o en `false`.
- [ ] Activar las flags `ica-challenges` y `nota-desafiante` en el entorno.

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
- **Límites diarios.** 10 palabras, 2 frases y 2 activaciones. «Ampliar el día» (50 ICA Coins) los duplica.
- **ICA Coins (`/fichas`).** Tienda: desafío extra (15), ampliar el día (50) y PreguntICA extra (50), además de cómo se ganan. En admin, «ICA Coins de usuarios» con botones −/+.
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

## Cambios de la tarde del 1 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Aulas que ya no se imparten | Los alumnos ya no ven alemán (básico y conversacional), inglés avanzado, italiano avanzado ni francés conversacional, ni sus sesiones ni sus avisos. Francés queda como una sola clase, «Francés», que usa la clave `fr_basico` (así se conservan sus sesiones y los avisos de quien la tenía). En el admin siguen todas, marcadas «(oculta a los alumnos)» | `retired` en `constants/calendarIcademyCatalog.ts`. `fetchCalendarIcademyEntries()` las quita salvo con `{ includeRetired: true }` (solo el admin) |
| Sonido de las insignias | Al abrir una insignia (perfil, Insignias y ranking) suena según el rango. Rehecho por la noche: ver «Cambios de la noche del 1 de octubre». Respeta el interruptor de sonido del perfil | `playBadgeSound()` en `game/sfx.ts`, `game/badgeSounds.ts` y `game/useBadgeSound.ts` |
| Una sola llama para las rachas | La racha ICA y la de flashcards usan la misma llama (`FlameIcon`): naranja la ICA y azul la de flashcards (tono nuevo `flash`). También en las insignias de racha, en Rachas, en la celebración diaria, en ICA Coins y en Notificaciones | `game/icons.tsx`, `game/medals.ts` y pantallas que la usan |
| Sin el recuadro gris al pasar el ratón | Se quitan los `title` nativos de la app (barra de arriba, ranking, calendario, coaching…). Si el elemento no tenía `aria-label`, el texto pasa a `aria-label`. Se mantienen en iframes y en el admin (gráficas y calendario de coaching) | 29 sitios |
| Desplegables en la barra de arriba (ordenador) | Al pasar el ratón por la racha: la semana (L–D) con los días hechos, salvados o pendientes, el próximo hito y la racha de flashcards. Por las ICA Coins: en qué puedes gastarlas hoy (precio y si te alcanza) y «Ir a la tienda». En el móvil, tocar sigue abriendo su pantalla | `game/HoverPanel.tsx` y `game/GameStatsBar.tsx` |
| Perfil de un icademer en el ranking | Tocar la inicial o el nombre (también en el podio) abre una ventana con su nombre, idioma que aprende, nivel, sus insignias (la más alta de cada categoría) y «Desafiar a …». Si no se puede, «No se puede desafiar a este icademer» con el motivo. «Desafiar» lleva a `/desafios-ica?retar=<id>`, que abre el reto con esa persona (Por idioma si es de tu idioma y nivel; si no, Global). En el podio, los puntos abren el detalle de puntos | `game/IcademerProfile.tsx`, `game/ranking.tsx`, `views/LeaderboardView.tsx`, `views/IcaChallengesView.tsx` |

### Cambios de la noche del 1 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Desplegables con el estilo de la app | Los `<select>` del coaching (filtros de «Tus alumnos», asignar clase, cambiar coacher…) abrían el menú gris del sistema. Ahora usan `AppSelect`, que se escribe igual que un `<select>` (mismas `<option>` y `onChange`) pero abre el menú de ICA | `components/ui/app-select.tsx`, 4 vistas de coaching |
| Flashcards «Solo por aprender» | Fallo confirmado: casi todas las pendientes son nuevas y `buildReviewRound` solo deja 2 nuevas por ronda (y espera 2 días), así que salían 2 tarjetas. Con «Solo por aprender» ya no se aplican esos topes (opción `ignoreNewCardLimits`) | `utils.ts`, `ReviewView.tsx` |
| Botón de sonido en las flashcards | Altavoz arriba a la derecha de la ronda para quitar o poner los sonidos de acierto y fallo (mismo ajuste que en Perfil) | `game/SoundToggleButton.tsx` |
| Sonidos de insignias nuevos | Sustituidos el 2 de octubre por un whoosh suave (ver abajo) | `game/badgeSounds.ts` |

### Cambios del 2 de octubre

| Cambio | Qué hace | Dónde |
|---|---|---|
| Pronunciación transcrita | Debajo de la palabra sale cómo suena, escrito a la manera del idioma del alumno: para un hispanohablante, beaucoup → /bocú/; para el resto, sílabas con la tónica en mayúsculas. Sale en el reverso de las flashcards y en «Últimas añadidas» de Inmersión. Se activa o se quita en Perfil (bloque «Pronunciación», «Visible» / «Oculta»; viene activada). Se pide a Haiku en lotes de hasta 20 palabras (la IA devuelve una lista en el mismo orden, así la respuesta no se corta) y se guarda en el navegador, así que cada palabra se pide una sola vez por dispositivo. Las flashcards piden toda la ronda al empezar; mientras llega sale «/ · · · /», y si falla se reintenta sola a los 2, 8 y 25 s | `modules/pronunciation/`, `ReviewView.tsx`, `AddView.tsx`, `ProfileView.tsx`, `MobileProfileSheet.tsx`. Servidor: acción `pronunciation` en `anthropic-proxy` (`_shared/pronunciation-prompt.ts`) |
| Sonidos de insignias: whoosh | Fuera las melodías: un golpe de aire muy suave que cruza de izquierda a derecha. Bronce y plata, un swish corto; oro y rubí, un whoosh más largo con uno o dos brillos casi en susurro; diamante, ida y vuelta con tres brillos. Picos de unos −18 dB y de 0,2 a 1,4 segundos. Hay 3 packs para escuchar (whoosh, aire, swish); la app usa `whoosh` | `game/badgeSounds.ts` |
| Marca ICA en el camino | El camino de Inicio va sobre el azul ICA (`--ica-brand`, #87def9). I, C y A son fichas azules con borde y letra blancos; al hacerlas se invierten (blanca con la letra azul) y llevan el check azul arriba. Las bloqueadas son de trazo discontinuo. La línea entre fichas es azul en lo hecho y blanca en lo que falta. El cofre y el Reto del día son fichas claras con el dibujo en azul (el cofre azul guarda monedas doradas), para separarlos a simple vista de I, C y A (idea de una administradora); bloqueados, más apagados y con trazo discontinuo. En modo oscuro, el mismo diseño sobre un azul más profundo | `game/IcaPath.tsx`, `game/icons.tsx`, variables `--ica-brand*`, `--ica-road-*` y `--ica-reto*` en `index.css` |
| Logo ICA | El logo de ICADEMY sin «DEMY»: marco redondeado abierto abajo, birrete y «ICA» en Nunito 900. Va en la barra de arriba | `game/IcaLogo.tsx`, `Header.tsx` |
| Rojo y naranja más suaves | Menos brillantes, con algo más de blanco, para que no compitan con el azul ICA: `--ica-fire` (racha), `--ica-a` y `--ica-bad-strong` (botón «No la sabía»). Afecta a toda la app | `index.css` |
| Camino sin recuadro | El camino de Inicio va directamente sobre el fondo de la app (ya no dentro de un recuadro azul); solo las fichas llevan el azul ICA. Colores en la clase `.ica-path-skin` | `game/IcaPath.tsx`, `index.css` |
| Cofre y Reto del día cambian de color al activarse | Bloqueados: ficha clara con el dibujo en azul. Cofre listo para abrir: dorado (placa dorada, cofre de madera, brillo); abierto: blanco con las monedas y el check. Reto del día disponible: morado (color de minijuego, `--ica-reto` #a259f0) con un mando de videojuego (antes salía el icono del modo, p. ej. el enlace de Parejas); hecho: blanco con check. Texto: «Tu minijuego con palabras ICA» | `game/IcaPath.tsx` |
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
| Tienda: dibujos nuevos | «Ampliar el día» (calendario con rayo) y «Intento extra de PreguntICA» (micrófono con «+») dibujados como el desafío extra | `game/icons.tsx` (`DayBoostGlyph`, `PregunticaExtraGlyph`), `views/FichasView.tsx` |
| ICA Coins: movimientos plegados | Se ven los 4 últimos; el resto con «Ver todos (n)» / «Ver menos» (hasta 40) | `views/FichasView.tsx` |
| Azul de la I y «Ciclo ICA completado» | `--ica-i` pasa de #3fc1ec a #3aaeee (un poco más cerca del azul de la C): límites de hoy, Inmersión, etc. En la celebración del cofre, I, C y A con sus tres azules (como en «Tus límites de hoy») y letra blanca. Debajo, solo «Racha ICA: N días» (fuera «A los 7 días seguidos ganas…») | `index.css`, `game/CycleCelebration.tsx`, `Trackers/TrackerChartPreview.tsx` |
| Saludo «Buenos días» / «Hola» | En móvil, al entrar: «Buenos días» de 5:00 a 12:59 y «Hola» el resto del día, en el idioma objetivo. Entra subiendo desde abajo con un pequeño rebote. Si con el nombre no cabe, se quita el nombre o baja el tamaño de letra (18/16/14). En rumano «Bună dimineața» no cabe y usa «Salut» | `game/welcomeGreeting.ts`, `game/WelcomeBrand.tsx`, test `welcomeGreeting.test.ts` |
| Ranking sin «Ver con gente de ejemplo» | Quitado por completo el modo de ejemplo del ranking (botón, datos y textos). Borrados `game/rankingDemo.ts` y `hooks/useIsSuperAdmin.ts` (no se usaban en otro sitio) | `views/LeaderboardView.tsx`, `i18n/en/base2.ts` |
| Recap: recuadro del ranking | Vuelve al tono ciruela que tenía (#472e4b) en vez del verde | `game/monthlyRecap.tsx` |
| Cerrar «Ciclo ICA completado» tocando fuera | Tocar la parte oscura de arriba (fuera de la tarjeta) sale de la pantalla. Si el cofre es nuevo, recoge las ICA Coins igual que el botón (no se pierden) | `game/CycleCelebration.tsx` |
| Reto del día: todos los modos y aprobado con 5 | Rota entre los modos de Desafíos: Parejas, Lectura, Escritura, Escucha y ahora también Habla (se salta si el navegador no tiene reconocimiento de voz). Solo cuenta como hecho con 5 aciertos o más: con menos, «¡Casi!», «Necesitas 5 aciertos para completarlo» e «Intentarlo otra vez»; el camino no lo marca como hecho y muestra «Hoy 3 de 10 · necesitas 5». **Nahuel:** el resultado sigue guardándose solo en el dispositivo | `game/dailyGame.ts`, `views/DailyGameView.tsx`, `game/IcaPath.tsx`, tests `dailyGame.test.ts`, `gameRules.test.ts` |
| Saludo al entrar (móvil) | Al abrir la app en el móvil sale a la izquierda «Ciao, Clara» (el «hola» del idioma que aprende y su nombre) con el logo en el centro; al segundo y medio el logo se desliza a su sitio y el saludo va delante de él a la misma velocidad mientras se desvanece. Si el nombre no cabe, sale solo el «hola» (nunca «…»). Una vez por sesión. Hay «hola» para los 28 idiomas (chino y japonés con su propia coma) | `game/WelcomeBrand.tsx`, `game/welcomeGreeting.ts`, `Header.tsx` |
| Logo al cargar | Mientras carga la app sale el logo ICA en el centro (en `index.html`, así se ve antes de que arranque React, en claro u oscuro según el tema). Las pantallas de carga internas enseñan el mismo logo, del mismo tamaño y en el mismo sitio, así no hay salto al pasar de una a otra | `index.html`, `components/ui/fullscreen-loading.tsx` |
| Ciclo ICA completado y recap del mes | Fuera los colores antiguos de I, C y A. En «Ciclo ICA completado», tres fichas blancas con la letra y el check azules (como en el camino). En el recap del mes, arriba va el logo ICA en blanco y el fondo y los números son de la gama azul | `game/CycleCelebration.tsx`, `game/monthlyRecap.tsx` |
| De Creación a Activación sin perderse | Si hoy ya está hecha la C y la última frase (de hoy) aún no se ha grabado, Creación la enseña arriba con «Activar ahora», y Activación pone en la nota en curso «Tu frase nueva» con el botón «Grabar esta frase», que lleva directo a grabarla. Dentro de la nota maestra: la próxima frase grande con un solo botón «Grabar esta frase»; «Elegir otra frase» y «Frases activadas en esta nota» van plegados (la lista enseña 8 frases y «Ver más frases»), y la nota desafiante va al final | `services/pendingActivation.ts`, `hooks/usePendingActivationPhrase.ts`, `components/PendingActivationCard.tsx`, `PhraseView.tsx`, `MasterNotesView.tsx`, `MasterNoteDetailView.tsx` |
| Desafíos · Pendientes más simple | Filas sencillas: foto, nombre, «quedan 19 h · tipo de reto» y un botón. Los retos recibidos: «Aceptar» y una X para rechazar. Los enviados: «Cancelar». Sin etiquetas de estado | `IcaChallengesView.tsx` |

Luis comparó cuatro estilos para el camino (pantalla azul, sin recuadro, tarjeta, azul que se funde) y eligió «sin recuadro»; las otras propuestas ya están borradas.

Aplazado por Luis: un chat entre icademers al acabar un desafío (para animar a ir al Club de Dinámica).

### Para Nahuel

- [ ] **`ica-challenges-center` (`create-challenge`)**: la app ya solo manda `rounds` 1 o 2, `responseSeconds` 5 (Lectura) y `durationSeconds` 86400. Conviene que el servidor acepte solo esos valores (hoy admite 5 y 10 rondas y otras duraciones).
- [ ] **`ica-challenges-center`**: tiene una acción nueva, `public-profile` (`{ profileUserId }`). Devuelve `profile` (nombre, idioma, nivel), `stats` (mejor racha ICA y de flashcards, palabras y desafíos ganados) y `challenge` (`canChallenge`, `blockedReason`), con las mismas reglas que al crear un desafío Global. Ya estaba en la lista de funciones que desplegar. Hasta que se despliegue, la ventana enseña solo las insignias de ranking y eficacia, y si se puede retar lo saca de `list-available-users`.
- [ ] **Opcional**: volver a desplegar `calendar-icademy-bulk-upsert` para que las clases nuevas de francés se guarden con el nombre «Francés» (`_shared/calendar-icademy-catalog.ts`). En la app ya sale «Francés» igualmente.
- [ ] **Opcional**: quien tenga avisos activados de una clase oculta no los ve en la app, pero siguen contando en el servidor. Si no se programan sesiones de esas clases no llega ningún aviso. Para limpiarlos: `update public.users_calendar_icademy set notifications_enabled = false where class_key in ('fr_conv','en_avanzado','it_avanzado','de_basico','de_conv');`
- [ ] **`anthropic-proxy`**: acción nueva `pronunciation` (`{ words, targetLang, nativeLang }`, máximo 20 palabras; responde `{ result: { palabra: transcripción } }`) con Haiku, `temperature: 0`. Ya estaba en la lista de funciones que desplegar. Hasta que se despliegue, en development y production la pronunciación simplemente no aparece.
- Más adelante se puede guardar la transcripción en una columna de `lexicards` para no pedirla en cada dispositivo.
- Las traducciones al inglés de los textos nuevos están en `src/i18n/en/modo-juego-octubre.ts`.

### Qué probar

- [ ] Calendario ICADEMY como alumno: no salen las clases ocultas y francés sale como «Francés». En el admin siguen todas.
- [ ] Insignias: abrir una de cada rango con el sonido activado.
- [ ] En el ordenador, pasar el ratón por la racha y por las ICA Coins.
- [ ] Ranking: tocar a alguien, ver su perfil y pulsar «Desafiar».
- [ ] Flashcards: al girar una tarjeta sale la pronunciación (/bocú/). En Perfil, «Oculta» la quita. Solo sale cuando `anthropic-proxy` (con la acción `pronunciation`) está desplegada en el entorno.
- [ ] Inicio: el camino sin recuadro, con I, C y A que se invierten al hacerlas (check azul); el cofre se vuelve dorado al poder abrirlo y el Reto del día morado al poder jugarlo. Tocar Activación sin haber hecho Inmersión: Inmersión da un salto suave. Mirarlo también en modo oscuro.
- [ ] En el móvil, abrir la app: «Ciao, [nombre]» y el logo en el centro; al segundo y medio el logo vuelve a la izquierda. Recargar en la misma pestaña: ya no sale.
- [ ] Crear una frase, salir a Inicio y volver a Creación o a Activación: sale «Tienes una frase por activar» / «Tu frase nueva» y el botón lleva a grabarla.
- [ ] Dentro de una nota maestra abierta: «Grabar esta frase», «Elegir otra frase» plegado y la nota desafiante al final.
- [ ] Desafíos → Pendientes con retos recibidos y enviados.
- [ ] Completar el ciclo (celebración con fichas blancas) y abrir el recap del mes (logo ICA arriba).

## Lo que hoy es vista previa (solo en el navegador)

En development se puede probar tal cual. Para production, cada pieza hay que llevarla al servidor u ocultarla.

| Pieza | Dónde se guarda hoy | Qué falta en el servidor |
|---|---|---|
| ICA Coins nuevas: cofre, hitos de racha ICA y de flashcards, +1 por desafío ganado, ampliar el día, desafío extra | `localStorage` `ica-fichas-preview-v1:<userId>` (`game/fichas.ts`) | Movimientos en `preguntica_token_ledger` (con `entry_type` nuevos) y RPCs que comprueben el ciclo, la racha y el saldo, y que no se cobre dos veces. Arriba se ve la suma de servidor + vista previa, pero PreguntICA solo gasta lo del servidor: Luis veía 60 arriba y 42 al canjear |
| Desafío extra (4.º reto) | Se cobra en la vista previa; `create-challenge` recibe `useExtraSlot` | La función sigue limitada a 3 (`MAX_ACTIVE_CHALLENGES`) e ignora `useExtraSlot`, así que con alumnos reales el 4.º reto falla |
| Reacciones al acabar un desafío | `localStorage` `ica-challenge-reactions-v1` | Tabla y acciones `send-reaction` / `list-reactions`. Hoy el rival no las recibe |
| Insignia destacada | `localStorage` (`game/featuredBadge.ts`) | `profiles.featured_badge` (`"categoria:rango"`) devuelto como `featured_badge` en los dos RPC del ranking. El front ya lo lee |
| Límites diarios | Solo en el cliente | Validarlos al insertar (lexicards, frases, chunks), teniendo en cuenta «ampliar el día» |
| Resultado del Reto del día | `localStorage` `ica-daily-game-v1:<userId>` | Opcional |

## A tener en cuenta

- **PreguntICA extra.** Es un intento aparte (`token_unlock`): no cierra la semana ni da puntos de ranking, porque el ranking solo cuenta `weekly`. La PreguntICA gratis de la semana sigue disponible cuando el alumno activa sus palabras.
  - Lo he probado en Postgres con 18 comprobaciones: semana bloqueada, gratis después, extra con la semana ya respondida y saldo.
  - En esta revisión arreglé un fallo: la migración cobraba 50, pero `create_preguntica_attempt` seguía exigiendo la semana desbloqueada, así que el alumno pagaba y no podía jugar.
  - Si un pago se queda sin empezar, la app ofrece «Empezar» en vez de volver a cobrar.
- **Finales de línea.** En el PC de Luis los archivos están en CRLF y el índice en LF. Hay que hacer el commit desde Windows (VS Code, `core.autocrlf=true`); si no, saldrían todas las líneas como cambiadas.
- **Archivos borrados** (ya no los usa nada): `LeaderboardMenu`, `AppBreadcrumbs`, `useDashboardBreadcrumbs`, `MetaTrackerBar`, `MetaTrackerSection`, `ui/breadcrumb` y `ui/separator`.
- **Tamaño.** El bloque principal pasa de 2,54 MB a 3,02 MB (de 797 a 944 KB con gzip). Unos 200 KB son los diccionarios de inglés, que se podrían cargar solo cuando la interfaz va en inglés.
- **`.gitignore`.** Ahora también ignora `.env.*` (menos `.env.example`), para que copias como `.env.luis` (con claves) no se suban nunca. Luis usa desde el 2 de octubre el `.env` de Nahuel (base de datos de desarrollo), sin modos de prueba locales.
- **Ayudas de prueba quitadas (2 oct).** A petición de Nahuel (que la IA no meta código «para probar en local»), se han borrado de la rama: el modo prueba del camino (`game/pathSimulation.ts`, `PathSimulationBanner.tsx`, `?simular-camino`), las 120 ICA Coins de prueba (`VITE_ICA_TEST_COINS`) y el atajo de pronunciación de `pnpm dev` (`scripts/dev-pronunciation.mjs`). `vite.config.ts/.js` y `.env.example` vuelven a estar como en la base. La pronunciación ahora solo usa `anthropic-proxy`.
- **`pnpm-workspace.yaml`.** Lo creó pnpm en el PC de Luis y queda fuera de Git.
- **Modo local de Desafíos.** Con `VITE_ICA_CHALLENGES_LOCAL=true` se juega contra rivales de prueba sin Supabase. En `develop` Nahuel dejó una versión aligerada (`icaChallengesLocalBridge.ts`, `icaChallengesLocalMode.ts`); esta rama aún tiene la versión anterior con 8 icademers virtuales y el recuadro «Modo prueba». Al unir `develop` con esta rama se adopta la versión de Nahuel.
- **Seguridad.** Si no está hecho, hay que rotar la clave de Anthropic que salió en una captura el 30 de septiembre.

## Qué revisar y cómo probarlo

- [ ] Con una cuenta nueva: el login y el registro salen en español, y al llegar a 20 palabras salta la celebración de Desafíos.
- [ ] Hacer I → C → A, abrir el cofre y pulsar «Recoger mis ICA Coins»: las monedas vuelan al contador.
- [ ] PreguntICA con la semana bloqueada y al menos 50 ICA Coins en el servidor: «Jugarla ya» cobra, se puede jugar y la semana sigue bloqueada.
- [ ] Escuchar 3 min de una nota maestra y hacer una nota desafiante: el detalle de puntos del ranking suma 0,1 ese día.
- [ ] Traducir y corregir en Inmersión y Creación: la calidad de Haiku es aceptable.
- [ ] Ranking con más de 30 personas, insignias, y la app en inglés (`?lang=en`).

Cuando Luis dé el OK, hago el commit en `feat/modo-juego` y el push. El PR va contra `develop`, o contra `feat/desafios-ica-modos` si esa aún no está integrada.
