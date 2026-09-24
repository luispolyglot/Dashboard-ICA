-- NOTA DESAFIANTE (fase 1): trozos de cada frase para el juego de repaso.
--
-- challenge_chunks : [{ "target": "...", "native": "..." }, ...] o null si no se pudo dividir.
-- challenge_ready  : null = aún sin procesar
--                    true = la frase entra en el desafío
--                    false = queda fuera (trozos no válidos o la frase tiene errores / no tiene sentido)
-- challenge_problem: explicación corta cuando queda fuera por errores.
--
-- Las filas ya existentes se procesan poco a poco desde la app (al preparar el desafío
-- de una nota se dividen las frases que aún no tengan trozos), o con una pasada única.

alter table public.phrase_generations
  add column if not exists challenge_chunks jsonb,
  add column if not exists challenge_ready boolean,
  add column if not exists challenge_problem text;

comment on column public.phrase_generations.challenge_chunks is
  'Nota desafiante: pares {target, native} en orden. Unidos reproducen generated_phrase.';
comment on column public.phrase_generations.challenge_ready is
  'Nota desafiante: null sin procesar, true entra en el desafío, false queda fuera.';
comment on column public.phrase_generations.challenge_problem is
  'Nota desafiante: motivo por el que la frase queda fuera del desafío.';
