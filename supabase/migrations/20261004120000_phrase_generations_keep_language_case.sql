-- FRASES DE CREACIÓN EN MINÚSCULAS (Luis, 4 oct)
--
-- record_phrase_generation_event (20261003120000) guardaba el idioma de la frase en minúsculas
-- («polaco|español»), pero el resto de la app busca las frases con el idioma tal cual
-- («Polaco|Español»). Resultado: la frase nueva no salía en el historial y, al activarla en una
-- nota maestra, fallaba con «No se pudo guardar el audio en la nota maestra» (la nota es
-- «Polaco» y la frase «polaco»: parecen idiomas distintos).
--
-- Arreglo: la función guarda el idioma como llega (sin pasarlo a minúsculas; la comprobación de
-- que las palabras son tuyas sigue sin distinguir mayúsculas) y se corrigen las frases ya
-- guardadas en minúsculas, copiando cómo está escrito el idioma en las palabras del alumno.

begin;

create or replace function public.record_phrase_generation_event(
  p_word_ids uuid[],
  p_phrase text,
  p_translation text,
  p_target_lang text,
  p_native_lang text,
  p_source text default 'generated'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  phrase_id uuid := gen_random_uuid();
  source_ids uuid[];
  source_words text[];
  source_v2 jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_source not in ('generated', 'manual') then raise exception 'PHRASE_SOURCE_INVALID'; end if;
  if nullif(trim(coalesce(p_phrase, '')), '') is null then raise exception 'PHRASE_REQUIRED'; end if;
  if nullif(trim(coalesce(p_target_lang, '')), '') is null
    or nullif(trim(coalesce(p_native_lang, '')), '') is null then
    raise exception 'LANG_PAIR_REQUIRED';
  end if;
  if coalesce(array_length(p_word_ids, 1), 0) < 1 or array_length(p_word_ids, 1) > 10 then
    raise exception 'PHRASE_WORD_COUNT_INVALID';
  end if;

  select array_agg(l.id order by input.ordinality),
         array_agg(l.target order by input.ordinality),
         jsonb_agg(jsonb_build_object('lexicard_id', l.id, 'word', l.target) order by input.ordinality)
  into source_ids, source_words, source_v2
  from unnest(p_word_ids) with ordinality as input(id, ordinality)
  join public.lexicards l on l.id = input.id and l.user_id = v_user_id
  where lower(trim(coalesce(l.target_lang, ''))) = lower(trim(p_target_lang))
    and lower(trim(coalesce(l.native_lang, ''))) = lower(trim(p_native_lang));

  if coalesce(array_length(source_ids, 1), 0) <> array_length(p_word_ids, 1) then
    raise exception 'PHRASE_WORDS_NOT_OWNED';
  end if;

  insert into public.phrase_generations (
    id, user_id, source_words, source_words_v2, generated_phrase, translation,
    model, success, target_lang, native_lang
  ) values (
    phrase_id, v_user_id, source_words, source_v2, trim(p_phrase), p_translation,
    case when p_source = 'manual' then 'manual' else 'generated' end,
    true, trim(p_target_lang), trim(p_native_lang)
  );
  return phrase_id;
end;
$$;

revoke all on function public.record_phrase_generation_event(uuid[], text, text, text, text, text) from public, anon;
grant execute on function public.record_phrase_generation_event(uuid[], text, text, text, text, text) to authenticated;

-- Frases ya guardadas en minúsculas: se les pone el idioma como está en las palabras del alumno.
update public.phrase_generations pg
set target_lang = fix.target_lang,
    native_lang = fix.native_lang
from (
  select distinct on (l.user_id, lower(trim(l.target_lang)), lower(trim(l.native_lang)))
    l.user_id, l.target_lang, l.native_lang
  from public.lexicards l
  where l.target_lang is not null and l.native_lang is not null
  order by l.user_id, lower(trim(l.target_lang)), lower(trim(l.native_lang)), l.created_at desc
) fix
where pg.user_id = fix.user_id
  and pg.target_lang = lower(trim(pg.target_lang))
  and pg.native_lang = lower(trim(pg.native_lang))
  and lower(trim(fix.target_lang)) = pg.target_lang
  and lower(trim(fix.native_lang)) = pg.native_lang
  and (fix.target_lang <> pg.target_lang or fix.native_lang <> pg.native_lang);

commit;
