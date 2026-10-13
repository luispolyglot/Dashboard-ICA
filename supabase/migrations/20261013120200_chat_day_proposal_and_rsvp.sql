-- CHAT DE ICADEMERS: «MAÑANA» Y «PROPONER DÍA Y HORA» CON «ME APUNTO» (Luis, 13 Oct 2026)
--
-- Like an event in a WhatsApp group: someone proposes a day and a time for the Club de DinámICA,
-- everyone sees it in their own local time, can tap «Me apunto» and sees how many (and who) are
-- going, with a button to enter the Club de DinámICA. Many icademers do not know where the club is.
--
--  - New message kinds: 'manana' («Mañana») and 'propuesta' (day + time, in the sender's time zone).
--    The old «¿A las…?» ('hora') stays valid for old messages and for the app that is still open.
--  - day_value: the proposed day (sender's calendar), from today to 14 days ahead.
--  - icademer_chat_rsvps: who is going to each proposal. Written only with set_icademer_chat_rsvp.
--  - get_icademer_chat also returns day_value and, for proposals, going_count, going_names and
--    i_am_going.
-- send_icademer_chat_message gets a new last argument (p_day_value, default null): the old app's
-- calls still work.

begin;

alter table public.icademer_chat_messages
  add column if not exists day_value date;

alter table public.icademer_chat_messages
  drop constraint if exists icademer_chat_messages_kind_check,
  drop constraint if exists icademer_chat_messages_time_check,
  drop constraint if exists icademer_chat_messages_day_check;

alter table public.icademer_chat_messages
  add constraint icademer_chat_messages_kind_check check (
    kind in ('hola', 'club', 'me_apunto', 'no_puedo', 'hora', 'genial', 'nos_vemos', 'animo', 'manana', 'propuesta')
  ),
  add constraint icademer_chat_messages_time_check check (
    (kind in ('hora', 'propuesta') and time_value ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$')
    or (kind not in ('hora', 'propuesta') and time_value is null)
  ),
  add constraint icademer_chat_messages_day_check check (
    (kind = 'propuesta' and day_value is not null)
    or (kind <> 'propuesta' and day_value is null)
  );

create table if not exists public.icademer_chat_rsvps (
  message_id uuid not null references public.icademer_chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists icademer_chat_rsvps_user_idx on public.icademer_chat_rsvps (user_id);

-- Read through get_icademer_chat and written through set_icademer_chat_rsvp only.
alter table public.icademer_chat_rsvps enable row level security;
revoke all on public.icademer_chat_rsvps from anon, authenticated;

-- First name and the initial of the surname (never the email), as in the messages.
create or replace function public.icademer_chat_short_name(p_display_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      trim(
        split_part(trim(coalesce(p_display_name, '')), ' ', 1) || ' ' ||
        coalesce(nullif(left(split_part(trim(coalesce(p_display_name, '')), ' ', 2), 1), '') || '.', '')
      ),
      ''
    ),
    'Icademer'
  );
$$;

revoke all on function public.icademer_chat_short_name(text) from public, anon, authenticated;

-- Últimos mensajes (los más nuevos al final) y marca el chat como leído.
create or replace function public.get_icademer_chat(p_target_lang text, p_limit integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lang text := lower(trim(coalesce(p_target_lang, '')));
  v_messages jsonb;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.icademer_chat_members where user_id = v_user_id and target_lang = v_lang
  ) then
    raise exception 'CHAT_NOT_MEMBER';
  end if;

  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz), '[]'::jsonb)
  into v_messages
  from (
    select jsonb_build_object(
      'id', m.id,
      'kind', m.kind,
      'time_value', m.time_value,
      'time_zone', m.time_zone,
      'day_value', m.day_value,
      'created_at', m.created_at,
      'is_me', m.user_id = v_user_id,
      'sender_key', md5(m.user_id::text || v_lang),
      'sender_name', public.icademer_chat_short_name(p.display_name),
      'going_count', case when m.kind = 'propuesta' then (
        select count(*) from public.icademer_chat_rsvps r where r.message_id = m.id
      ) end,
      'i_am_going', case when m.kind = 'propuesta' then exists (
        select 1 from public.icademer_chat_rsvps r where r.message_id = m.id and r.user_id = v_user_id
      ) end,
      'going_names', case when m.kind = 'propuesta' then (
        select coalesce(jsonb_agg(public.icademer_chat_short_name(rp.display_name) order by r.created_at), '[]'::jsonb)
        from (
          select r2.user_id, r2.created_at from public.icademer_chat_rsvps r2
          where r2.message_id = m.id
          order by r2.created_at
          limit 8
        ) r
        left join public.profiles rp on rp.id = r.user_id
      ) end
    ) as item
    from public.icademer_chat_messages m
    left join public.profiles p on p.id = m.user_id
    where m.target_lang = v_lang
    order by m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 60), 200))
  ) recent;

  select count(*) into v_count from public.icademer_chat_members where target_lang = v_lang;

  update public.icademer_chat_members
  set last_read_at = now()
  where user_id = v_user_id and target_lang = v_lang;

  return jsonb_build_object('member_count', v_count, 'messages', v_messages);
end;
$$;

drop function if exists public.send_icademer_chat_message(text, text, text, text);

create or replace function public.send_icademer_chat_message(
  p_target_lang text,
  p_kind text,
  p_time_value text default null,
  p_time_zone text default null,
  p_day_value date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lang text := lower(trim(coalesce(p_target_lang, '')));
  v_last_three uuid[];
  v_last_own timestamptz;
  v_with_time boolean := p_kind in ('hora', 'propuesta');
  v_zone text;
  v_today date;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.icademer_chat_members where user_id = v_user_id and target_lang = v_lang
  ) then
    raise exception 'CHAT_NOT_MEMBER';
  end if;

  -- The proposed day: from today to 14 days ahead in the sender's calendar.
  v_zone := coalesce(
    public.ica_valid_timezone(left(nullif(trim(coalesce(p_time_zone, '')), ''), 64)),
    public.ica_valid_timezone((select p.timezone from public.profiles p where p.id = v_user_id)),
    'UTC'
  );
  if p_kind = 'propuesta' then
    v_today := (now() at time zone v_zone)::date;
    if p_day_value is null or p_day_value < v_today or p_day_value > v_today + 14 then
      raise exception 'CHAT_DAY_INVALID';
    end if;
  end if;

  -- Un envío a la vez por chat, para que la regla de los 3 seguidos no se salte.
  perform pg_advisory_xact_lock(hashtext('icademer_chat:' || v_lang));

  select array_agg(user_id) into v_last_three
  from (
    select user_id from public.icademer_chat_messages
    where target_lang = v_lang
    order by created_at desc
    limit 3
  ) last_messages;

  if coalesce(array_length(v_last_three, 1), 0) = 3
    and v_last_three[1] = v_user_id
    and v_last_three[2] = v_user_id
    and v_last_three[3] = v_user_id then
    raise exception 'CHAT_WAIT_FOR_OTHERS';
  end if;

  select max(created_at) into v_last_own
  from public.icademer_chat_messages
  where target_lang = v_lang and user_id = v_user_id;
  if v_last_own is not null and v_last_own > now() - interval '3 seconds' then
    raise exception 'CHAT_TOO_FAST';
  end if;

  insert into public.icademer_chat_messages (target_lang, user_id, kind, time_value, time_zone, day_value)
  values (
    v_lang,
    v_user_id,
    p_kind,
    case when v_with_time then p_time_value else null end,
    -- A proposal keeps the zone its day was checked with (a valid one), so everyone converts it right.
    case
      when p_kind = 'propuesta' then v_zone
      when v_with_time then left(nullif(trim(coalesce(p_time_zone, '')), ''), 64)
      else null
    end,
    case when p_kind = 'propuesta' then p_day_value else null end
  )
  returning id into v_id;

  -- Whoever proposes is going.
  if p_kind = 'propuesta' then
    insert into public.icademer_chat_rsvps (message_id, user_id) values (v_id, v_user_id)
    on conflict do nothing;
  end if;

  update public.icademer_chat_members
  set last_read_at = now()
  where user_id = v_user_id and target_lang = v_lang;

  return v_id;
end;
$$;

-- «Me apunto» (p_going true) or «Ya no voy» (false) to a proposal of a chat you are in.
create or replace function public.set_icademer_chat_rsvp(p_message_id uuid, p_going boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.icademer_chat_messages%rowtype;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_message from public.icademer_chat_messages where id = p_message_id;
  if not found or v_message.kind <> 'propuesta' then
    raise exception 'CHAT_PROPOSAL_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.icademer_chat_members where user_id = v_user_id and target_lang = v_message.target_lang
  ) then
    raise exception 'CHAT_NOT_MEMBER';
  end if;

  if coalesce(p_going, false) then
    insert into public.icademer_chat_rsvps (message_id, user_id) values (p_message_id, v_user_id)
    on conflict do nothing;
  else
    delete from public.icademer_chat_rsvps where message_id = p_message_id and user_id = v_user_id;
  end if;

  select count(*) into v_count from public.icademer_chat_rsvps where message_id = p_message_id;
  return jsonb_build_object('going_count', v_count, 'i_am_going', coalesce(p_going, false));
end;
$$;

revoke all on function public.get_icademer_chat(text, integer) from public, anon;
revoke all on function public.send_icademer_chat_message(text, text, text, text, date) from public, anon;
revoke all on function public.set_icademer_chat_rsvp(uuid, boolean) from public, anon;
grant execute on function public.get_icademer_chat(text, integer) to authenticated;
grant execute on function public.send_icademer_chat_message(text, text, text, text, date) to authenticated;
grant execute on function public.set_icademer_chat_rsvp(uuid, boolean) to authenticated;

commit;
