update public.users_coaching
set weekly_objectives = (
  select coalesce(
    jsonb_object_agg(
      case
        when top_level.key = 'icaStreakTargetPct'
          then 'icaStreakObjectivePct'
        when top_level.key in ('icaStreakAchievedPct', 'flashcardsStreakAchievedPct')
          then 'flashcardsStreakObjectivePct'
        else top_level.key
      end,
      case
        when jsonb_typeof(top_level.value) = 'object'
          then jsonb_strip_nulls(
            (top_level.value - 'icaStreakTargetPct' - 'icaStreakAchievedPct' - 'flashcardsStreakAchievedPct')
            || jsonb_build_object(
              'icaStreakObjectivePct',
              coalesce(
                top_level.value -> 'icaStreakObjectivePct',
                top_level.value -> 'icaStreakTargetPct'
              )
            )
            || jsonb_build_object(
              'flashcardsStreakObjectivePct',
              coalesce(
                top_level.value -> 'flashcardsStreakObjectivePct',
                top_level.value -> 'flashcardsStreakAchievedPct',
                top_level.value -> 'icaStreakAchievedPct'
              )
            )
          )
        else top_level.value
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(coalesce(public.users_coaching.weekly_objectives, '{}'::jsonb)) as top_level(key, value)
)
where public.users_coaching.weekly_objectives ? 'icaStreakTargetPct'
  or public.users_coaching.weekly_objectives ? 'icaStreakAchievedPct'
  or public.users_coaching.weekly_objectives ? 'flashcardsStreakAchievedPct'
  or exists (
    select 1
    from jsonb_each(coalesce(public.users_coaching.weekly_objectives, '{}'::jsonb)) as top_level(key, value)
    where jsonb_typeof(top_level.value) = 'object'
      and (
        top_level.value ? 'icaStreakTargetPct'
        or top_level.value ? 'icaStreakAchievedPct'
        or top_level.value ? 'flashcardsStreakAchievedPct'
      )
  );
