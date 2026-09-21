begin;

update public.desafio_tipos
set
  config = jsonb_set(
    config,
    '{pitch}',
    to_jsonb('Quiz de 10 preguntas con tus propias palabras ICA.'::text),
    true
  )
where id = 'ica-own-words';

commit;
