-- ESCRITURA: 10 SECONDS PER WORD (Luis, 8 Oct)
--
-- Desafíos ICA "Escritura · por palabra" gave 7 seconds per word, too short to type (above all on
-- the phone and with special letters). Now 10, like the daily challenge. Challenges already created
-- keep the time they were created with.

update public.desafio_tipos
   set config = jsonb_set(coalesce(config, '{}'::jsonb), '{secondsPerQuestion}', '10'::jsonb)
 where id = 'ica-writing';
