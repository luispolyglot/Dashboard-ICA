import { useEffect, useState } from 'react'
import { fetchIcademerChatStatus, type IcademerChatStatus } from '../services/icademerChat'

// Estado del chat de icademers (para el aviso de mensajes nuevos y la invitación).

const INVITE_PREFIX = 'ica-chat-invite-v1:'

function inviteKey(userId: string | null | undefined, targetLang: string): string {
  return `${INVITE_PREFIX}${userId || 'anon'}:${targetLang.trim().toLowerCase()}`
}

/** La invitación al chat solo sale una vez (por usuario e idioma). */
export function hasSeenChatInvite(userId: string | null | undefined, targetLang: string): boolean {
  try {
    return window.localStorage.getItem(inviteKey(userId, targetLang)) === '1'
  } catch {
    return true
  }
}

export function markChatInviteSeen(userId: string | null | undefined, targetLang: string): void {
  try {
    window.localStorage.setItem(inviteKey(userId, targetLang), '1')
  } catch {
    // Sin almacenamiento no se vuelve a guardar, pero tampoco pasa nada.
  }
}

// Varios sitios enseñan el aviso a la vez (barra de arriba, perfil, pestaña): comparten la misma
// petición durante unos segundos para no pedirlo tres veces.
const statusCache = new Map<string, { at: number; promise: Promise<IcademerChatStatus> }>()
function loadStatus(targetLang: string): Promise<IcademerChatStatus> {
  const key = targetLang.trim().toLowerCase()
  const cached = statusCache.get(key)
  if (cached && Date.now() - cached.at < 20000) return cached.promise
  const promise = fetchIcademerChatStatus(targetLang)
  statusCache.set(key, { at: Date.now(), promise })
  promise.catch(() => statusCache.delete(key))
  return promise
}

/** Al entrar en el chat (y leerlo), el aviso de mensajes nuevos se pone al día en todos lados. */
export const ICADEMER_CHAT_READ_EVENT = 'ica:icademer-chat-read'
export function markIcademerChatRead(): void {
  statusCache.clear()
  window.dispatchEvent(new Event(ICADEMER_CHAT_READ_EVENT))
}

/** ¿Estás dentro, cuántos son y cuántos mensajes nuevos tienes? Se actualiza cada minuto. */
export function useIcademerChatStatus(targetLang: string | null | undefined): IcademerChatStatus | null {
  const [status, setStatus] = useState<IcademerChatStatus | null>(null)

  useEffect(() => {
    if (!targetLang) return
    let active = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      loadStatus(targetLang)
        .then((next) => {
          if (active) setStatus(next)
        })
        .catch(() => {
          // Sin chat (p. ej. migración aún no aplicada): no se enseña nada.
        })
    }
    load()
    const id = window.setInterval(load, 60000)
    window.addEventListener(ICADEMER_CHAT_READ_EVENT, load)
    return () => {
      active = false
      window.clearInterval(id)
      window.removeEventListener(ICADEMER_CHAT_READ_EVENT, load)
    }
  }, [targetLang])

  return status
}
