-- PUSH WHEN A CHALLENGE EXPIRES OR A TURN IS LOST (Luis, 6 Oct)
--
-- The pg_cron job run_ica_challenges_expiration_job (every 5 minutes) closes invitations nobody
-- answered, passes the turn when a player runs out of time, closes challenges by timeout and
-- expires old ones. Until now none of that sent a notification, because SQL cannot send web push.
--
-- Now the job marks its transaction (ica.challenge_job = on) and a trigger queues one row per
-- player in ica_challenge_push_outbox. The scheduled functions calendar-push-reminders and
-- streak-push-reminders claim the queue with claim_ica_challenge_push_outbox and send the pushes
-- (supabase/functions/_shared/ica-challenge-job-notices.ts).
-- Changes made by ica-challenges-center (playing, accepting, cancelling) are not queued: that
-- function already sends its own pushes.

begin;

create table if not exists public.ica_challenge_push_outbox (
  id bigserial primary key,
  challenge_id uuid not null references public.ica_challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rival_user_id uuid references auth.users (id) on delete set null,
  kind text not null check (
    kind in ('invite_expired', 'invite_missed', 'challenge_expired', 'turn_lost', 'your_turn', 'finished')
  ),
  outcome text check (outcome in ('won', 'lost', 'draw')),
  timed_out boolean not null default false,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists ica_challenge_push_outbox_pending_idx
  on public.ica_challenge_push_outbox (id)
  where claimed_at is null;

-- Server-only queue: RLS on and no policies.
alter table public.ica_challenge_push_outbox enable row level security;
revoke all on table public.ica_challenge_push_outbox from public, anon, authenticated;
revoke all on sequence public.ica_challenge_push_outbox_id_seq from public, anon, authenticated;

create or replace function public.enqueue_ica_challenge_job_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ica.challenge_job', true), '') <> 'on' then
    return new;
  end if;

  if old.status = 'created' and new.status = 'not_accepted' then
    insert into public.ica_challenge_push_outbox (challenge_id, user_id, rival_user_id, kind)
    values
      (new.id, new.challenger_user_id, new.challenged_user_id, 'invite_expired'),
      (new.id, new.challenged_user_id, new.challenger_user_id, 'invite_missed');

  elsif old.status in ('created', 'in_progress') and new.status = 'expired' then
    insert into public.ica_challenge_push_outbox (challenge_id, user_id, rival_user_id, kind)
    values
      (new.id, new.challenger_user_id, new.challenged_user_id, 'challenge_expired'),
      (new.id, new.challenged_user_id, new.challenger_user_id, 'challenge_expired');

  elsif old.status = 'in_progress' and new.status = 'completed' then
    insert into public.ica_challenge_push_outbox (challenge_id, user_id, rival_user_id, kind, outcome, timed_out)
    select
      new.id,
      player.user_id,
      player.rival_id,
      'finished',
      case
        when new.winner_user_id is null then 'draw'
        when new.winner_user_id = player.user_id then 'won'
        else 'lost'
      end,
      player.user_id is not distinct from old.turn_user_id
    from (
      values
        (new.challenger_user_id, new.challenged_user_id),
        (new.challenged_user_id, new.challenger_user_id)
    ) as player (user_id, rival_id);

  elsif old.status = 'in_progress'
    and new.status = 'in_progress'
    and old.turn_user_id is not null
    and new.turn_user_id is not null
    and new.turn_user_id is distinct from old.turn_user_id then
    insert into public.ica_challenge_push_outbox (challenge_id, user_id, rival_user_id, kind)
    values
      (new.id, old.turn_user_id, new.turn_user_id, 'turn_lost'),
      (new.id, new.turn_user_id, old.turn_user_id, 'your_turn');
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_ica_challenge_job_push() from public, anon, authenticated;

drop trigger if exists ica_challenges_enqueue_job_push on public.ica_challenges;
create trigger ica_challenges_enqueue_job_push
  after update of status, turn_user_id on public.ica_challenges
  for each row
  execute function public.enqueue_ica_challenge_job_push();

-- Same job as before; it only marks its own transaction so the trigger knows who made the change.
create or replace function public.run_ica_challenges_expiration_job()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_updates integer;
  turn_updates integer;
  expiration_updates integer;
begin
  perform set_config('ica.challenge_job', 'on', true);

  invitation_updates := public.expire_ica_challenge_invitations_due();
  turn_updates := public.process_ica_challenge_turn_timeouts();
  expiration_updates := public.expire_ica_challenges_due();

  perform set_config('ica.challenge_job', 'off', true);

  return 'ok:invites=' || invitation_updates::text || ',turns=' || turn_updates::text || ',expired=' || expiration_updates::text;
end;
$$;

revoke execute on function public.run_ica_challenges_expiration_job() from public, anon, authenticated;

-- Hands out pending notices once (safe if two functions run at the same time). Notices older
-- than 12 hours are dropped instead of sent (a «te toca» from yesterday would be wrong), and
-- rows already sent are deleted after 7 days.
create or replace function public.claim_ica_challenge_push_outbox(p_limit integer default 200)
returns setof public.ica_challenge_push_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ica_challenge_push_outbox
  where claimed_at is not null
    and claimed_at < now() - interval '7 days';

  update public.ica_challenge_push_outbox
  set claimed_at = now()
  where claimed_at is null
    and created_at < now() - interval '12 hours';

  return query
  update public.ica_challenge_push_outbox o
  set claimed_at = now()
  where o.id in (
    select pending.id
    from public.ica_challenge_push_outbox pending
    where pending.claimed_at is null
    order by pending.id
    limit greatest(1, least(coalesce(p_limit, 200), 500))
    for update skip locked
  )
  returning o.*;
end;
$$;

revoke all on function public.claim_ica_challenge_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_ica_challenge_push_outbox(integer) to service_role;

commit;
