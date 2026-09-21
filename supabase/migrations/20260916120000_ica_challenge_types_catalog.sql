begin;

create table if not exists public.desafio_tipos (
  id text primary key,
  nombre text not null,
  icono text not null,
  activo boolean not null default false,
  orden smallint not null default 0,
  ambitos text[] not null default '{global}',
  config jsonb not null default '{}'::jsonb,
  constraint desafio_tipos_id_not_empty check (length(trim(id)) > 0),
  constraint desafio_tipos_nombre_not_empty check (length(trim(nombre)) > 0),
  constraint desafio_tipos_icono_not_empty check (length(trim(icono)) > 0),
  constraint desafio_tipos_ambitos_check check (
    array_length(ambitos, 1) >= 1
    and ambitos <@ array['global', 'language']::text[]
  )
);

create index if not exists desafio_tipos_activo_orden_idx
  on public.desafio_tipos (activo desc, orden asc, nombre asc);

insert into public.desafio_tipos (id, nombre, icono, activo, orden, ambitos, config)
values
  (
    'ica-own-words',
    'Palabras ICA propias',
    'sparkles',
    true,
    10,
    array['global', 'language']::text[],
    jsonb_build_object(
      'pitch', 'Quiz por turnos con tus propias palabras ICA.',
      'tags', jsonb_build_array('Dificultad adaptable', '1 vs 1 asincronico')
    )
  ),
  (
    'ica-lightning',
    'Modo Relampago',
    'zap',
    false,
    20,
    array['global']::text[],
    jsonb_build_object(
      'pitch', 'Duelo corto por velocidad y precision con reglas especiales.',
      'tags', jsonb_build_array('Partidas expres', 'Riesgo/Recompensa')
    )
  ),
  (
    'ica-streak-battle',
    'Batalla de Rachas',
    'flame',
    false,
    30,
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

grant select on public.desafio_tipos to anon, authenticated;

commit;
