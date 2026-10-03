-- Desafíos ICA · nuevos modos y preguntas generadas/corregidas en el servidor
--
-- 1. desafio_preguntas: el servidor guarda aquí las preguntas de cada desafío y la
--    respuesta correcta. Los alumnos NO pueden leer esta tabla (así no se puede
--    ver la solución antes de responder). Solo la usa la función ica-challenges-center.
-- 2. Los alumnos ya no pueden escribir directamente en ica_challenges,
--    ica_challenge_competitors ni desafio_jugadas: todo pasa por la función,
--    que es la que comprueba si una respuesta es correcta y a tiempo.
-- 3. Catálogo de modos, en este orden: Lectura, Escritura (por palabra y cuenta
--    atrás), Escucha, Habla y Parejas. «Completa la frase» queda apagado (Próximamente).
--
-- Para entrar en los retos hacen falta 20 palabras en el Baúl ICA de ese idioma.
-- Lo comprueba la función (MIN_WORDS_TO_JOIN en engine.ts), no hace falta nada en la base de datos.

begin;

-- ---------------------------------------------------------------------------
-- 1. Preguntas del servidor
-- ---------------------------------------------------------------------------

create table if not exists public.desafio_preguntas (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.ica_challenges (id) on delete cascade,
  -- null = pregunta compartida por los dos jugadores (modo "mezcla de baúles")
  usuario_id uuid references auth.users (id) on delete cascade,
  indice smallint not null,
  tipo text not null,
  -- lo que ve el alumno (sin la solución)
  pregunta jsonb not null default '{}'::jsonb,
  -- solución y datos de la palabra ICA (solo servidor)
  respuesta jsonb not null default '{}'::jsonb,
  -- lo que respondió cada jugador, por id de usuario (solo servidor)
  respuestas jsonb not null default '{}'::jsonb,
  creado_at timestamptz not null default now(),
  constraint desafio_preguntas_indice_non_negative check (indice >= 0),
  constraint desafio_preguntas_tipo_check
    check (tipo in ('choice', 'write', 'speak', 'listen', 'cloze', 'pairs'))
);

create unique index if not exists desafio_preguntas_unique_idx
  on public.desafio_preguntas (
    desafio_id,
    coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid),
    indice
  );

create index if not exists desafio_preguntas_desafio_idx
  on public.desafio_preguntas (desafio_id, indice asc);

alter table public.desafio_preguntas enable row level security;
-- Sin políticas: nadie salvo el servidor (service role) puede leer ni escribir.
revoke all on public.desafio_preguntas from anon, authenticated;

comment on table public.desafio_preguntas is
  'Preguntas de Desafíos ICA generadas por el servidor. Contiene la solución: solo accesible con service role.';

-- ---------------------------------------------------------------------------
-- 2. Solo el servidor escribe en los desafíos
-- ---------------------------------------------------------------------------

drop policy if exists "ica_challenges_insert_challenger" on public.ica_challenges;
drop policy if exists "ica_challenges_update_participants" on public.ica_challenges;
drop policy if exists "ica_challenge_competitors_insert_by_challenger" on public.ica_challenge_competitors;
drop policy if exists "ica_challenge_competitors_update_own_row" on public.ica_challenge_competitors;
drop policy if exists "desafio_jugadas_insert_own_rows" on public.desafio_jugadas;
drop policy if exists "desafio_jugadas_update_own_rows" on public.desafio_jugadas;

revoke insert, update, delete on public.ica_challenges from anon, authenticated;
revoke insert, update, delete on public.ica_challenge_competitors from anon, authenticated;
revoke insert, update, delete on public.desafio_jugadas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Catálogo de modos
-- ---------------------------------------------------------------------------
-- config:
--   pitch / tags         -> texto de la tarjeta
--   secondsPerQuestion   -> segundos por palabra (modos por turnos; en Parejas, por tablero de 5)
--   sessionSeconds       -> duración de la partida (Modo Relámpago)
--   maxLevelGap          -> escalones máximos de diferencia (A1, A1+, A2…) para
--                           jugar con la mezcla de baúles
--   needsMicrophone / needsAudio -> avisos en la pantalla

insert into public.desafio_tipos (id, nombre, icono, activo, orden, ambitos, config)
values
  (
    'ica-own-words',
    'Lectura',
    'book-open',
    true,
    10,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Lees la palabra en tu idioma y eliges la correcta entre 4 opciones.',
      'tags', jsonb_build_array('10 palabras', 'Por turnos'),
      'maxLevelGap', 3
    )
  ),
  (
    'ica-writing',
    'Escritura · por palabra',
    'pencil',
    true,
    20,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Ves la palabra en tu idioma y la escribes en tu idioma objetivo. 10 palabras por turnos.',
      'tags', jsonb_build_array('10 palabras', 'Por turnos'),
      'secondsPerQuestion', 7,
      'maxLevelGap', 3
    )
  ),
  (
    'ica-lightning',
    'Escritura · cuenta atrás',
    'zap',
    true,
    30,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Escribe todas las palabras que puedas antes de que acabe la cuenta atrás. Gana quien acierte más.',
      'tags', jsonb_build_array('60 segundos', 'Contrarreloj'),
      'sessionSeconds', 60,
      'maxLevelGap', 3
    )
  ),
  (
    'ica-speak',
    'Habla',
    'mic',
    true,
    50,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Ves la palabra en tu idioma y la dices en voz alta en tu idioma objetivo.',
      'tags', jsonb_build_array('10 palabras', 'Micrófono'),
      'secondsPerQuestion', 10,
      'needsMicrophone', true,
      'maxLevelGap', 3
    )
  ),
  (
    'ica-listen',
    'Escucha',
    'headphones',
    true,
    40,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Escuchas una palabra ICA en tu idioma objetivo y eliges qué significa.',
      'tags', jsonb_build_array('10 palabras', 'Con sonido'),
      'secondsPerQuestion', 8,
      'needsAudio', true,
      'maxLevelGap', 3
    )
  ),
  (
    'ica-pairs',
    'Parejas',
    'link',
    true,
    55,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Une cada palabra ICA con su significado. 2 tableros de 5 parejas; si empatan, gana quien tarde menos.',
      'tags', jsonb_build_array('10 palabras', 'Contrarreloj'),
      'secondsPerQuestion', 40,
      'maxLevelGap', 3
    )
  ),
  (
    'ica-cloze',
    'Completa la frase',
    'text-cursor',
    -- Próximamente: difícil y con poco contexto. El servidor lo sabe jugar si se activa.
    false,
    60,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Una frase de ejemplo con un hueco: elige entre 4 opciones la palabra ICA que falta.',
      'tags', jsonb_build_array('10 frases', 'Por turnos'),
      'secondsPerQuestion', 12,
      'maxLevelGap', 3
    )
  ),
  (
    'ica-streak-battle',
    'Batalla de Rachas',
    'flame',
    false,
    90,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Competencia asincronica por consistencia diaria durante varios dias.',
      'tags', jsonb_build_array('Formato liga', 'Progreso por etapas')
    )
  )
on conflict (id) do update
set
  nombre = excluded.nombre,
  icono = excluded.icono,
  activo = excluded.activo,
  orden = excluded.orden,
  ambitos = excluded.ambitos,
  config = excluded.config;

commit;
