-- CHAT DE ICADEMERS POR IDIOMA (Luis, 3 oct)
--
-- Un grupo por idioma objetivo (p. ej. todos los que aprenden polaco). Es un chat CERRADO:
-- solo se puede mandar uno de los mensajes de la lista (kind) y, en «hora», una hora en
-- cuartos (18:45). Así no hace falta moderar ni gestionar denuncias. Sirve para ponerle nombre
-- a la gente y animarla a ir al Club de DinámICA.
--
-- Reglas (todas en el servidor):
--  - Solo entra quien aprende ese idioma (user_settings.target_lang o palabras de ese idioma).
--  - Nadie ve la lista de miembros: solo cuántos son. Cada mensaje enseña el nombre y la
--    inicial del apellido de quien lo manda.
--  - Como mucho 3 mensajes seguidos: el 4.º espera a que escriba otra persona.
--  - Un mensaje cada 3 segundos como mucho.
-- Las tablas solo se leen; todo se escribe con las funciones de abajo.

begin;

create table if not exists public.icademer_chat_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_lang text not null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (user_id, target_lang)
);

create index if not exists icademer_chat_members_lang_idx
  on public.icademer_chat_members (target_lang);

create table if not exists public.icademer_chat_messages (
  id uuid primary key default gen_random_uuid(),
  target_lang text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  time_value text,
  time_zone text,
  created_at timestamptz not null default now(),
  constraint icademer_chat_messages_kind_check check (
    kind in ('hola', 'club', 'me_apunto', 'no_puedo', 'hora', 'genial', 'nos_vemos', 'animo')
  ),
  constraint icademer_chat_messages_time_check check (
    (kind = 'hora' and time_value ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$')
    or (kind <> 'hora' and time_value is null)
  )
);

create index if not exists icademer_chat_messages_lang_created_idx
  on public.icademer_chat_messages (target_lang, created_at desc);

alter table public.icademer_chat_members enable row level security;
alter table public.icademer_chat_messages enable row level security;

drop policy if exists "icademer_chat_members_select_own" on public.icademer_chat_members;
create policy "icademer_chat_members_select_own"
on public.icademer_chat_members
for select
using (auth.uid() = user_id);

-- Los mensajes se leen con get_icademer_chat (que pone el nombre); sin lectura directa.
revoke all on public.icademer_chat_members from anon;
revoke insert, update, delete on public.icademer_chat_members from authenticated;
revoke all on public.icademer_chat_messages from anon, authenticated;

-- ¿Este usuario aprende este idioma?
create or replace function public.icademer_chat_can_join(p_user_id uuid, p_target_lang text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_settings us
    where us.user_id = p_user_id and lower(us.target_lang) = lower(p_target_lang)
  ) or exists (
    select 1 from public.lexicards l
    where l.user_id = p_user_id and lower(l.target_lang) = lower(p_target_lang)
  );
$$;

revoke all on function public.icademer_chat_can_join(uuid, text) from public, anon, authenticated;

-- Estado del chat de un idioma: si estás dentro, cuántos son y cuántos mensajes nuevos tienes.
create or replace function public.get_my_icademer_chat_status(p_target_lang text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lang text := lower(trim(coalesce(p_target_lang, '')));
  v_member public.icademer_chat_members%rowtype;
  v_count integer;
  v_unread integer := 0;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select count(*) into v_count from public.icademer_chat_members where target_lang = v_lang;
  select * into v_member from public.icademer_chat_members where user_id = v_user_id and target_lang = v_lang;

  if found then
    select count(*) into v_unread
    from public.icademer_chat_messages m
    where m.target_lang = v_lang
      and m.created_at > v_member.last_read_at
      and m.user_id <> v_user_id;
  end if;

  return jsonb_build_object(
    'is_member', v_member.user_id is not null,
    'can_join', public.icademer_chat_can_join(v_user_id, v_lang),
    'member_count', v_count,
    'unread', v_unread
  );
end;
$$;

create or replace function public.join_icademer_chat(p_target_lang text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lang text := lower(trim(coalesce(p_target_lang, '')));
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.icademer_chat_can_join(v_user_id, v_lang) then
    raise exception 'CHAT_NOT_YOUR_LANGUAGE';
  end if;

  insert into public.icademer_chat_members (user_id, target_lang)
  values (v_user_id, v_lang)
  on conflict (user_id, target_lang) do nothing;
end;
$$;

create or replace function public.leave_icademer_chat(p_target_lang text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from public.icademer_chat_members
  where user_id = auth.uid() and target_lang = lower(trim(coalesce(p_target_lang, '')));
end;
$$;

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
      'created_at', m.created_at,
      'is_me', m.user_id = v_user_id,
      'sender_key', md5(m.user_id::text || v_lang),
      -- Nombre y la inicial del apellido (nunca el correo).
      'sender_name', coalesce(
        nullif(
          trim(
            split_part(trim(coalesce(p.display_name, '')), ' ', 1) || ' ' ||
            coalesce(nullif(left(split_part(trim(coalesce(p.display_name, '')), ' ', 2), 1), '') || '.', '')
          ),
          ''
        ),
        'Icademer'
      )
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

create or replace function public.send_icademer_chat_message(
  p_target_lang text,
  p_kind text,
  p_time_value text default null,
  p_time_zone text default null
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

  insert into public.icademer_chat_messages (target_lang, user_id, kind, time_value, time_zone)
  values (
    v_lang,
    v_user_id,
    p_kind,
    case when p_kind = 'hora' then p_time_value else null end,
    case when p_kind = 'hora' then left(nullif(trim(coalesce(p_time_zone, '')), ''), 64) else null end
  )
  returning id into v_id;

  update public.icademer_chat_members
  set last_read_at = now()
  where user_id = v_user_id and target_lang = v_lang;

  return v_id;
end;
$$;

revoke all on function public.get_my_icademer_chat_status(text) from public, anon;
revoke all on function public.join_icademer_chat(text) from public, anon;
revoke all on function public.leave_icademer_chat(text) from public, anon;
revoke all on function public.get_icademer_chat(text, integer) from public, anon;
revoke all on function public.send_icademer_chat_message(text, text, text, text) from public, anon;
grant execute on function public.get_my_icademer_chat_status(text) to authenticated;
grant execute on function public.join_icademer_chat(text) to authenticated;
grant execute on function public.leave_icademer_chat(text) to authenticated;
grant execute on function public.get_icademer_chat(text, integer) to authenticated;
grant execute on function public.send_icademer_chat_message(text, text, text, text) to authenticated;

commit;
