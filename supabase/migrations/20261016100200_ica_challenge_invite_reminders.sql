-- DESAFÍOS ICA: AVISO ANTES DE QUE CADUQUE UN RETO (Luis, 16 Oct 2026)
--
-- Un reto sin aceptar caduca a las 12 horas (accept_until). Cuando le quedan 3 horas, quien fue
-- retado recibe un aviso: «Ana te retó a un desafío ICA. Te quedan 3 horas para aceptarlo.».
-- Mismo sistema que el aviso del Club de DinámICA: calendar-push-reminders (cada 10 minutos)
-- reclama los retos que tocan con claim_ica_challenge_invite_reminders() y envía los avisos.
-- Cada reto se avisa una sola vez (invite_reminder_sent_at). No se avisa si el reto se creó con
-- menos de 4 horas de plazo, ni si quedan menos de 10 minutos.

begin;

alter table public.ica_challenges
  add column if not exists invite_reminder_sent_at timestamptz;

create or replace function public.claim_ica_challenge_invite_reminders(p_limit integer default 200)
returns table (
  challenge_id uuid,
  challenged_user_id uuid,
  challenger_user_id uuid,
  accept_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select c.id
    from public.ica_challenges c
    where c.status = 'created'
      and c.invite_reminder_sent_at is null
      and c.challenged_user_id is not null
      and c.accept_until between now() + interval '10 minutes' and now() + interval '3 hours'
      and c.created_at < c.accept_until - interval '4 hours'
    order by c.accept_until
    limit greatest(1, coalesce(p_limit, 200))
    for update skip locked
  ),
  claimed as (
    update public.ica_challenges c
       set invite_reminder_sent_at = now()
      from due
     where c.id = due.id
    returning c.id, c.challenged_user_id, c.challenger_user_id, c.accept_until
  )
  select k.id, k.challenged_user_id, k.challenger_user_id, k.accept_until
  from claimed k;
end;
$$;

revoke all on function public.claim_ica_challenge_invite_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_ica_challenge_invite_reminders(integer) to service_role;

commit;
