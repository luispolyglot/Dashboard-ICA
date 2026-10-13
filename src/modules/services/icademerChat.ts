import { supabase } from '@/lib/supabase'
import { t } from '@/i18n'
import type { ChatMessageKind } from '../game/icademerChat'

// Chat de icademers por idioma. Todo pasa por funciones del servidor
// (migración 20261003110000_icademer_language_chat.sql).

export type IcademerChatStatus = {
  isMember: boolean
  canJoin: boolean
  memberCount: number
  unread: number
  /** null: aún no se le ha preguntado (se pregunta al entrar). */
  notificationsEnabled: boolean | null
}

export type IcademerChatMessage = {
  id: string
  kind: ChatMessageKind
  timeValue: string | null
  timeZone: string | null
  createdAt: string
  isMe: boolean
  senderKey: string
  senderName: string
  /** «Proponer día y hora»: the day (sender's calendar, AAAA-MM-DD). */
  dayValue: string | null
  /** «Proponer día y hora»: who is going (whoever proposed it, too). */
  goingCount: number
  goingNames: string[]
  iAmGoing: boolean
}

export type IcademerChat = {
  memberCount: number
  messages: IcademerChatMessage[]
}

/** La clave del chat es el idioma objetivo en minúsculas (como lo guarda el servidor). */
export function chatLangKey(targetLang: string): string {
  return targetLang.trim().toLowerCase()
}

const ERRORS: Record<string, string> = {
  CHAT_WAIT_FOR_OTHERS: 'Espera a que escriba otra persona: como mucho 3 mensajes seguidos.',
  CHAT_TOO_FAST: 'Despacio: espera un momento antes de mandar otro.',
  CHAT_NOT_MEMBER: 'Primero únete al chat.',
  CHAT_NOT_YOUR_LANGUAGE: 'Este chat es para quien aprende este idioma.',
  CHAT_DAY_INVALID: 'Elige un día de hoy en adelante.',
  CHAT_PROPOSAL_NOT_FOUND: 'Esa propuesta ya no está.',
  // The server is older than this message (its migration arrives a few minutes later).
  icademer_chat_messages_kind_check: 'Este mensaje aún no está disponible. Prueba en unos minutos.',
}

function chatError(error: { message?: string } | null): Error {
  const raw = error?.message || ''
  const code = Object.keys(ERRORS).find((key) => raw.includes(key))
  return new Error(code ? t(ERRORS[code]) : t('No se pudo conectar con el chat.'))
}

function client() {
  if (!supabase) throw new Error(t('No se pudo conectar con el chat.'))
  return supabase
}

export async function fetchIcademerChatStatus(targetLang: string): Promise<IcademerChatStatus> {
  const { data, error } = await client().rpc('get_my_icademer_chat_status', { p_target_lang: chatLangKey(targetLang) })
  if (error) throw chatError(error)
  const row = (data || {}) as Record<string, unknown>
  return {
    isMember: row.is_member === true,
    canJoin: row.can_join === true,
    memberCount: Number(row.member_count || 0),
    unread: Number(row.unread || 0),
    notificationsEnabled: typeof row.notifications_enabled === 'boolean' ? row.notifications_enabled : null,
  }
}

export async function joinIcademerChat(targetLang: string): Promise<void> {
  const { error } = await client().rpc('join_icademer_chat', { p_target_lang: chatLangKey(targetLang) })
  if (error) throw chatError(error)
}

/** Sí o no a las notificaciones de este grupo. */
export async function setIcademerChatNotifications(targetLang: string, enabled: boolean): Promise<void> {
  const { error } = await client().rpc('set_icademer_chat_notifications', {
    p_target_lang: chatLangKey(targetLang),
    p_enabled: enabled,
  })
  if (error) throw chatError(error)
}

export async function leaveIcademerChat(targetLang: string): Promise<void> {
  const { error } = await client().rpc('leave_icademer_chat', { p_target_lang: chatLangKey(targetLang) })
  if (error) throw chatError(error)
}

export async function fetchIcademerChat(targetLang: string): Promise<IcademerChat> {
  const { data, error } = await client().rpc('get_icademer_chat', { p_target_lang: chatLangKey(targetLang), p_limit: 80 })
  if (error) throw chatError(error)
  const row = (data || {}) as { member_count?: number; messages?: Array<Record<string, unknown>> }
  return {
    memberCount: Number(row.member_count || 0),
    messages: (row.messages || []).map((message) => ({
      id: String(message.id),
      kind: String(message.kind) as ChatMessageKind,
      timeValue: (message.time_value as string | null) ?? null,
      timeZone: (message.time_zone as string | null) ?? null,
      createdAt: String(message.created_at),
      isMe: message.is_me === true,
      senderKey: String(message.sender_key || ''),
      senderName: String(message.sender_name || 'Icademer'),
      dayValue: typeof message.day_value === 'string' ? message.day_value : null,
      goingCount: Number(message.going_count || 0),
      goingNames: Array.isArray(message.going_names) ? message.going_names.map(String) : [],
      iAmGoing: message.i_am_going === true,
    })),
  }
}

export async function sendIcademerChatMessage(input: {
  targetLang: string
  kind: ChatMessageKind
  timeValue?: string
  timeZone?: string
  /** «Proponer día y hora»: AAAA-MM-DD. */
  dayValue?: string
}): Promise<{ sentAsTimeOnly: boolean }> {
  const withTime = input.kind === 'hora' || input.kind === 'propuesta'
  let sentAsTimeOnly = false
  let { data, error } = await client().rpc('send_icademer_chat_message', {
    p_target_lang: chatLangKey(input.targetLang),
    p_kind: input.kind,
    p_time_value: withTime ? input.timeValue ?? null : null,
    p_time_zone: withTime ? input.timeZone ?? null : null,
    ...(input.kind === 'propuesta' ? { p_day_value: input.dayValue ?? null } : {}),
  })
  // The server does not know «Proponer día y hora» yet (its migration is not applied: the minutes
  // between the new app and the database, or a development database). Instead of «No se pudo
  // conectar», the old «¿A las…?» goes out with the same time (Luis, 13 Oct).
  if (error && input.kind === 'propuesta' && proposalNotSupported(error)) {
    sentAsTimeOnly = true
    ;({ data, error } = await client().rpc('send_icademer_chat_message', {
      p_target_lang: chatLangKey(input.targetLang),
      p_kind: 'hora',
      p_time_value: input.timeValue ?? null,
      p_time_zone: input.timeZone ?? null,
    }))
  }
  if (error) throw chatError(error)
  // Avisa a los demás (función icademer-chat-push). Si falla, el mensaje ya está enviado.
  if (data) {
    void client()
      .functions.invoke('icademer-chat-push', { body: { messageId: String(data) } })
      .catch(() => undefined)
  }
  return { sentAsTimeOnly }
}

/** The server's chat functions are older than «Proponer día y hora». */
function proposalNotSupported(error: { message?: string; code?: string } | null): boolean {
  const text = `${error?.code || ''} ${error?.message || ''}`
  return /PGRST202|Could not find the function|p_day_value|icademer_chat_messages_kind_check|icademer_chat_messages_time_check/i.test(text)
}

/** «Me apunto» (true) or «Ya no voy» (false) to a proposal. */
export async function setIcademerChatRsvp(messageId: string, going: boolean): Promise<{ goingCount: number; iAmGoing: boolean }> {
  const { data, error } = await client().rpc('set_icademer_chat_rsvp', { p_message_id: messageId, p_going: going })
  if (error) throw chatError(error)
  const row = (data || {}) as { going_count?: number; i_am_going?: boolean }
  return { goingCount: Number(row.going_count || 0), iAmGoing: row.i_am_going === true }
}
