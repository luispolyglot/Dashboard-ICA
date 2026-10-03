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

/** ¿Estás dentro, cuántos son y cuántos mensajes nuevos tienes? Se actualiza cada minuto. */
export function useIcademerChatStatus(targetLang: string | null | undefined): IcademerChatStatus | null {
  const [status, setStatus] = useState<IcademerChatStatus | null>(null)

  useEffect(() => {
    if (!targetLang) return
    let active = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      fetchIcademerChatStatus(targetLang)
        .then((next) => {
          if (active) setStatus(next)
        })
        .catch(() => {
          // Sin chat (p. ej. migración aún no aplicada): no se enseña nada.
        })
    }
    load()
    const id = window.setInterval(load, 60000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [targetLang])

  return status
}
