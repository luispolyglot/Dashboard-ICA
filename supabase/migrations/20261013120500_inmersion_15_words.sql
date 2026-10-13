-- INMERSIÓN: 15 PALABRAS AL DÍA EN VEZ DE 10 (Luis, 13 Oct 2026)
--
-- The daily limit of new words goes from 10 to 15 (30 with «Ampliar», which still doubles it).
-- Only the base number changes in ica_record_daily_limit_usage; the rest of the function is the
-- same as in 20261003120000_ica_coins_server_authority.sql (checked against production on 13 Oct).
-- Phrases (2) and activations (2) do not change. The app shows the same number (rules.ts).

begin;

create or replace function public.ica_record_daily_limit_usage(
  p_user_id uuid,
  p_kind text,
  p_source_id uuid,
  p_is_regeneration boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_day date;
  base_limit integer;
  active_limit integer;
  used_count integer;
  has_boost boolean;
begin
  if p_user_id is null or p_source_id is null then raise exception 'DAILY_LIMIT_USAGE_INVALID'; end if;
  if p_kind not in ('words', 'phrases', 'activations') then raise exception 'DAILY_LIMIT_KIND_INVALID'; end if;
  if p_kind = 'phrases' and coalesce(p_is_regeneration, false) then return; end if;

  local_day := public.ica_local_today(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended('ica-daily-limit:' || p_user_id::text || ':' || p_kind, 0));

  if exists (
    select 1 from public.ica_daily_limit_usage u
    where u.user_id = p_user_id and u.usage_day = local_day
      and u.usage_kind = p_kind and u.source_id = p_source_id
  ) then return; end if;

  if p_kind = 'activations' and exists (
    select 1 from public.ica_daily_limit_usage u
    where u.user_id = p_user_id and u.usage_kind = 'activations' and u.source_id = p_source_id
  ) then return; end if;

  base_limit := case p_kind when 'words' then 15 when 'phrases' then 2 else 2 end;
  select exists (
    select 1 from public.preguntica_token_ledger l
    where l.user_id = p_user_id and l.entry_type = 'phase_boost'
      and l.reference_day = local_day and l.reference_key = p_kind
  ) into has_boost;
  active_limit := base_limit * case when has_boost then 2 else 1 end;

  select count(*)::integer into used_count
  from public.ica_daily_limit_usage u
  where u.user_id = p_user_id and u.usage_day = local_day and u.usage_kind = p_kind;
  if used_count >= active_limit then
    raise exception using message = case p_kind
      when 'words' then 'DAILY_LIMIT_WORDS'
      when 'phrases' then 'DAILY_LIMIT_PHRASES'
      else 'DAILY_LIMIT_ACTIVATIONS'
    end;
  end if;

  insert into public.ica_daily_limit_usage (user_id, usage_day, usage_kind, source_id)
  values (p_user_id, local_day, p_kind, p_source_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.ica_record_daily_limit_usage(uuid, text, uuid, boolean) from public, anon, authenticated;

commit;
