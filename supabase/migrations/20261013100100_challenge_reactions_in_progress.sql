-- DESAFÍOS ICA: REACCIONES AL ACABAR TUS RONDAS (Luis, 12 Oct 2026)
--
-- Before, the reactions («¡Bien jugado!», «¡Revancha!», caritas…) could only be sent once the whole
-- challenge was over. With turns, the one who finished first had to wait. Now they can also be sent
-- while the challenge is in progress; the app shows them when you have finished all your rounds.
-- Same function, same checks; only the status check changes.

begin;

create or replace function public.send_ica_challenge_reaction(
  p_sender_user_id uuid,
  p_challenge_id uuid,
  p_kind text,
  p_value text
)
returns public.ica_challenge_reactions
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.ica_challenges%rowtype;
  reaction_row public.ica_challenge_reactions%rowtype;
  recent_senders uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_sender_user_id is null or p_challenge_id is null then raise exception 'REACTION_REQUEST_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ica-challenge-reaction:' || p_challenge_id::text, 0));
  select c.* into challenge_row from public.ica_challenges c where c.id = p_challenge_id for update;
  if not found then raise exception 'ICA_CHALLENGE_NOT_FOUND'; end if;
  -- Luis, 12 Oct: also while the challenge is still going (you finished your rounds and it is the
  -- rival's turn), so you can say «¡Bien jugado!» or ask for revenge. Not for invitations,
  -- declined or expired challenges.
  if challenge_row.status not in ('completed', 'in_progress') then raise exception 'REACTION_CHALLENGE_NOT_COMPLETED'; end if;
  if p_sender_user_id not in (challenge_row.challenger_user_id, challenge_row.challenged_user_id) then
    raise exception 'REACTION_NOT_PARTICIPANT';
  end if;
  if p_kind not in ('face', 'phrase') then raise exception 'REACTION_KIND_INVALID'; end if;
  if not (
    (p_kind = 'face' and p_value in ('feliz', 'risa', 'guino', 'sorpresa', 'gafas', 'lagrima'))
    or (p_kind = 'phrase' and p_value in ('bien-jugado', 'revancha', 'vamos', 'gracias'))
  ) then raise exception 'REACTION_VALUE_INVALID'; end if;

  select array_agg(recent.sender_user_id order by recent.created_at desc, recent.id desc)
  into recent_senders
  from (
    select r.sender_user_id, r.created_at, r.id
    from public.ica_challenge_reactions r
    where r.challenge_id = p_challenge_id
    order by r.created_at desc, r.id desc
    limit 2
  ) recent;
  if coalesce(array_length(recent_senders, 1), 0) = 2
    and recent_senders[1] = p_sender_user_id
    and recent_senders[2] = p_sender_user_id then
    raise exception 'REACTION_STREAK_LIMIT';
  end if;

  insert into public.ica_challenge_reactions (challenge_id, sender_user_id, kind, value, created_at)
  values (p_challenge_id, p_sender_user_id, p_kind, p_value, clock_timestamp())
  returning * into reaction_row;
  return reaction_row;
end;
$$;

revoke all on function public.send_ica_challenge_reaction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.send_ica_challenge_reaction(uuid, uuid, text, text) to service_role;

commit;
