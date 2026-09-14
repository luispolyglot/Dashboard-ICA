begin;

alter table public.ica_challenges
  add column if not exists result_type text not null default 'pending';

alter table public.ica_challenges
  drop constraint if exists ica_challenges_winner_consistency_check;

alter table public.ica_challenges
  add constraint ica_challenges_result_type_check
  check (
    result_type in (
      'pending',
      'challenger_win',
      'challenged_win',
      'draw',
      'cancelled',
      'expired',
      'not_accepted'
    )
  );

alter table public.ica_challenges
  add constraint ica_challenges_winner_consistency_check
  check (
    (
      result_type = 'challenger_win'
      and winner_user_id = challenger_user_id
    )
    or (
      result_type = 'challenged_win'
      and winner_user_id = challenged_user_id
    )
    or (
      result_type in ('pending', 'draw', 'cancelled', 'expired', 'not_accepted')
      and winner_user_id is null
    )
  );

drop index if exists ica_challenges_active_pair_unique_idx;
create unique index if not exists ica_challenges_active_pair_unique_idx
  on public.ica_challenges (
    least(challenger_user_id, challenged_user_id),
    greatest(challenger_user_id, challenged_user_id)
  )
  where status in ('created', 'in_progress');

create or replace function public.enforce_ica_challenges_active_limits()
returns trigger
language plpgsql
as $$
declare
  challenger_active_count integer;
  challenged_active_count integer;
begin
  if new.status not in ('created', 'in_progress') then
    return new;
  end if;

  if new.challenger_user_id = new.challenged_user_id then
    raise exception 'ICA_CHALLENGE_SELF_NOT_ALLOWED';
  end if;

  select count(*)::integer
  into challenger_active_count
  from public.ica_challenges c
  where (c.challenger_user_id = new.challenger_user_id or c.challenged_user_id = new.challenger_user_id)
    and c.status in ('created', 'in_progress')
    and c.id <> coalesce(new.id, gen_random_uuid());

  if challenger_active_count >= 3 then
    raise exception 'ICA_CHALLENGE_ACTIVE_LIMIT_REACHED';
  end if;

  select count(*)::integer
  into challenged_active_count
  from public.ica_challenges c
  where (c.challenger_user_id = new.challenged_user_id or c.challenged_user_id = new.challenged_user_id)
    and c.status in ('created', 'in_progress')
    and c.id <> coalesce(new.id, gen_random_uuid());

  if challenged_active_count >= 3 then
    raise exception 'ICA_CHALLENGE_OPPONENT_ACTIVE_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

drop trigger if exists ica_challenges_active_limits_trigger on public.ica_challenges;
create trigger ica_challenges_active_limits_trigger
before insert or update of status, challenger_user_id, challenged_user_id
on public.ica_challenges
for each row execute procedure public.enforce_ica_challenges_active_limits();

create or replace function public.expire_ica_challenges_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  update public.ica_challenges c
  set
    status = 'expired',
    result_type = 'expired',
    winner_user_id = null,
    finalized_at = coalesce(c.finalized_at, now()),
    updated_at = now()
  where c.status in ('created', 'in_progress')
    and c.expires_at is not null
    and c.expires_at <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.run_ica_challenges_expiration_job()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  affected := public.expire_ica_challenges_due();
  return 'ok:' || affected::text;
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'ica_challenges_expiration_job'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'ica_challenges_expiration_job',
    '*/5 * * * *',
    $cron$select public.run_ica_challenges_expiration_job();$cron$
  );
end;
$$;

commit;
