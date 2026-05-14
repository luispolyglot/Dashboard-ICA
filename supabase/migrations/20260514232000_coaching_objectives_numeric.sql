alter table public.coaching_session_weekly_objectives
  alter column words_target type integer using (
    case
      when words_target is null then null
      when trim(words_target::text) ~ '^-?[0-9]+$' then trim(words_target::text)::integer
      else null
    end
  ),
  alter column nm_target type integer using (
    case
      when nm_target is null then null
      when trim(nm_target::text) ~ '^-?[0-9]+$' then trim(nm_target::text)::integer
      else null
    end
  ),
  alter column ica_streak_objective_pct type integer using (
    case
      when ica_streak_objective_pct is null then null
      when trim(ica_streak_objective_pct::text) ~ '^-?[0-9]+$' then trim(ica_streak_objective_pct::text)::integer
      else null
    end
  ),
  alter column flashcards_streak_objective_pct type integer using (
    case
      when flashcards_streak_objective_pct is null then null
      when trim(flashcards_streak_objective_pct::text) ~ '^-?[0-9]+$' then trim(flashcards_streak_objective_pct::text)::integer
      else null
    end
  );

alter table public.coaching_session_weekly_objectives
  add constraint coaching_weekly_objectives_words_non_negative check (words_target is null or words_target >= 0),
  add constraint coaching_weekly_objectives_nm_non_negative check (nm_target is null or nm_target >= 0),
  add constraint coaching_weekly_objectives_ica_pct_range check (ica_streak_objective_pct is null or (ica_streak_objective_pct between 0 and 100)),
  add constraint coaching_weekly_objectives_flashcards_pct_range check (flashcards_streak_objective_pct is null or (flashcards_streak_objective_pct between 0 and 100));
