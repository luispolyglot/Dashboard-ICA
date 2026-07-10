begin;

create or replace function public.create_preguntica_attempt_with_prompt_data(
  p_word_mode text,
  p_question_text text,
  p_ica_words jsonb,
  p_target_lang text,
  p_native_lang text,
  p_level text,
  p_question_id uuid default null,
  p_reference timestamptz default now()
)
returns public.preguntica_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  new_attempt public.preguntica_attempts;
  safe_words jsonb;
begin
  if p_question_text is null or btrim(p_question_text) = '' then
    raise exception 'QUESTION_TEXT_REQUIRED';
  end if;

  safe_words := coalesce(p_ica_words, '[]'::jsonb);
  if jsonb_typeof(safe_words) <> 'array' or jsonb_array_length(safe_words) = 0 then
    raise exception 'ICA_WORDS_REQUIRED';
  end if;

  new_attempt := public.create_preguntica_attempt(p_word_mode, p_reference);

  update public.preguntica_attempts pa
  set
    question_id = p_question_id,
    question_text = btrim(p_question_text),
    ica_words = safe_words,
    target_lang = nullif(btrim(coalesce(p_target_lang, '')), ''),
    native_lang = nullif(btrim(coalesce(p_native_lang, '')), ''),
    level = nullif(btrim(coalesce(p_level, '')), ''),
    updated_at = now()
  where pa.id = new_attempt.id
  returning *
  into new_attempt;

  return new_attempt;
end;
$$;

revoke all on function public.create_preguntica_attempt_with_prompt_data(text, text, jsonb, text, text, text, uuid, timestamptz) from public;
grant execute on function public.create_preguntica_attempt_with_prompt_data(text, text, jsonb, text, text, text, uuid, timestamptz) to authenticated;

commit;
