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
  }
}

export async function joinIcademerChat(targetLang: string): Promise<void> {
  const { error } = await client().rpc('join_icademer_chat', { p_target_lang: chatLangKey(targetLang) })
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
    })),
  }
}

export async function sendIcademerChatMessage(input: {
  targetLang: string
  kind: ChatMessageKind
  timeValue?: string
  timeZone?: string
}): Promise<void> {
  const { error } = await client().rpc('send_icademer_chat_message', {
    p_target_lang: chatLangKey(input.targetLang),
    p_kind: input.kind,
    p_time_value: input.kind === 'hora' ? input.timeValue ?? null : null,
    p_time_zone: input.kind === 'hora' ? input.timeZone ?? null : null,
  })
  if (error) throw chatError(error)
}
