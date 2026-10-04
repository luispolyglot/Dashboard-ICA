-- INSIGNIAS: umbrales nuevos y fase LEYENDA (Luis, 3 oct)
--
-- La insignia destacada se valida en el servidor (ica_featured_badge_earned). Tiene que pedir
-- lo mismo que enseña la app (src/modules/game/achievements.ts):
--
--   Racha ICA y Flashcards: 7 · 30 · 60 · 120 · 200 días · Leyenda 365 · 730 · 1000
--   Ranking: top 3 · top 2 · 1.º · 1.º ×2 · 1.º ×3 · Leyenda 1.º ×5 · ×8 · ×12
--   Eficacia: mejor mes 60 · 70 · 90 · 100 % · después meses al 100 % (no hace falta seguidos):
--             3 · Leyenda 6 · 9 · 12
--   Vocabulario: 50 · 100 · 200 · 500 · 1000 · Leyenda 2000 · 3000 · 5000
--   Desafíos ganados: 10 · 20 · 50 · 100 · 200 · Leyenda 365 · 600 · 1000
--
-- Formato de la insignia: «categoría:rango», con rango bronce, plata, oro, rubi, diamante,
-- leyenda1, leyenda2 o leyenda3.

begin;

alter table public.ica_featured_badges
  drop constraint if exists ica_featured_badges_badge_check;
alter table public.ica_featured_badges
  add constraint ica_featured_badges_badge_check
  check (badge ~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios):(bronce|plata|oro|rubi|diamante|leyenda1|leyenda2|leyenda3)$');

create or replace function public.ica_featured_badge_earned(p_user_id uuid, p_badge text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  category text;
  tier text;
  level integer;
  current_value numeric;
  first_count integer;
  second_count integer;
  third_count integer;
  best_efficacy numeric;
  perfect_months integer;
begin
  if p_badge is null
    or p_badge !~ '^(rachaICA|rachaFlash|ranking|eficacia|vocab|desafios):(bronce|plata|oro|rubi|diamante|leyenda1|leyenda2|leyenda3)$' then
    return false;
  end if;
  category := split_part(p_badge, ':', 1);
  tier := split_part(p_badge, ':', 2);
  level := case tier
    when 'bronce' then 1 when 'plata' then 2 when 'oro' then 3 when 'rubi' then 4
    when 'diamante' then 5 when 'leyenda1' then 6 when 'leyenda2' then 7 else 8
  end;

  if category = 'rachaICA' then
    current_value := public.ica_best_streak(p_user_id, 'ica');
    return current_value >= (array[7, 30, 60, 120, 200, 365, 730, 1000])[level];
  elsif category = 'rachaFlash' then
    current_value := public.ica_best_streak(p_user_id, 'flashcards');
    return current_value >= (array[7, 30, 60, 120, 200, 365, 730, 1000])[level];
  elsif category = 'vocab' then
    select count(*)::numeric into current_value from public.lexicards l where l.user_id = p_user_id;
    return current_value >= (array[50, 100, 200, 500, 1000, 2000, 3000, 5000])[level];
  elsif category = 'desafios' then
    select count(*)::numeric into current_value from public.ica_challenges c where c.winner_user_id = p_user_id;
    return current_value >= (array[10, 20, 50, 100, 200, 365, 600, 1000])[level];
  elsif category = 'ranking' then
    select count(*) filter (where ls.rank = 1)::integer,
           count(*) filter (where ls.rank = 2)::integer,
           count(*) filter (where ls.rank = 3)::integer
    into first_count, second_count, third_count
    from public.leaderboard_snapshots ls
    where ls.period = 'monthly'
      and ls.user_id = p_user_id
      and ls.period_end >= ls.period_start + 27;
    return case level
      when 1 then first_count + second_count + third_count >= 1
      when 2 then first_count + second_count >= 1
      else first_count >= (array[0, 0, 1, 2, 3, 5, 8, 12])[level]
    end;
  else
    -- Eficacia de cada mes cerrado (la misma cuenta que closedMonthEfficacy en la app).
    select max(e.efficacy), count(*) filter (where e.efficacy >= 100)::integer
    into best_efficacy, perfect_months
    from (
      select greatest(0, least(100, round(
        coalesce(nullif(ls.payload ->> 'total_points', '')::numeric, ls.score::numeric / 10)
        / (10 + 2.8 + 8 + 14 + case when nullif(ls.payload ->> 'ica_test_points', '') is not null then 1.2 else 0 end)
        * 100
      ))) as efficacy
      from public.leaderboard_snapshots ls
      where ls.period = 'monthly'
        and ls.user_id = p_user_id
        and ls.period_end >= ls.period_start + 27
    ) e;
    if level <= 4 then
      return coalesce(best_efficacy, 0) >= (array[60, 70, 90, 100])[level];
    end if;
    return coalesce(perfect_months, 0) >= (array[0, 0, 0, 0, 3, 6, 9, 12])[level];
  end if;
end;
$$;
revoke all on function public.ica_featured_badge_earned(uuid, text) from public, anon, authenticated;

commit;
