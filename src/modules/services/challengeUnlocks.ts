/**
 * NOTA DESAFIANTE — desbloqueo por escucha.
 *
 * Regla (decidida por Luis):
 * - El desafío de una nota maestra se desbloquea al escuchar al menos el 80 % de ESA nota.
 * - Se puede desbloquear en varias notas el mismo día.
 * - Una vez desbloqueado, queda abierto el resto del día.
 * - Al cambiar de día (hora local del dispositivo) todas se vuelven a bloquear.
 *
 * Solo cuenta el audio que suena de verdad (los saltos de +10 s no suman).
 * Se guarda en este dispositivo (localStorage). Si más adelante se quiere que
 * valga entre dispositivos, habría que guardarlo en Supabase.
 */
import { useCallback, useEffect, useState } from 'react'

export const CHALLENGE_UNLOCK_RATIO = 0.8

export const CHALLENGE_UNLOCKS_CHANGED_EVENT = 'ica-challenge-unlocks-changed'

export type ChallengeUnlocksChangedDetail = {
  noteId: string
  /** true solo en el momento en que la nota pasa del 80 %. */
  justUnlocked: boolean
}

type StoredUnlocks = {
  day: string
  // segundos escuchados hoy por nota
  listened: Record<string, number>
}

const STORAGE_PREFIX = 'ica-challenge-unlocks-v1:'

function getLocalDayStamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function storageKey(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${userId || 'anon'}`
}

function readStore(userId: string | null | undefined): StoredUnlocks {
  const today = getLocalDayStamp()
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    const parsed = raw ? (JSON.parse(raw) as StoredUnlocks) : null
    if (parsed && parsed.day === today && parsed.listened && typeof parsed.listened === 'object') {
      return parsed
    }
  } catch {
    // Sin almacenamiento: se empieza de cero.
  }
  // Día nuevo (o nada guardado): todo bloqueado otra vez.
  return { day: today, listened: {} }
}

function writeStore(userId: string | null | undefined, store: StoredUnlocks): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(store))
  } catch {
    // Sin espacio o bloqueado: el progreso dura hasta recargar.
  }
}

export function getChallengeListenedSeconds(
  userId: string | null | undefined,
  noteId: string,
): number {
  return readStore(userId).listened[noteId] || 0
}

export function getChallengeUnlockProgress(
  listenedSeconds: number,
  noteDurationMs: number,
): number {
  const needed = (Math.max(0, noteDurationMs) / 1000) * CHALLENGE_UNLOCK_RATIO
  if (needed <= 0) return 0
  return Math.min(1, listenedSeconds / needed)
}

/** Suma segundos escuchados de una nota. Devuelve true si con esto se acaba de desbloquear. */
export function addChallengeListening(params: {
  userId: string | null | undefined
  noteId: string
  noteDurationMs: number
  seconds: number
}): boolean {
  const { userId, noteId, noteDurationMs, seconds } = params
  if (!noteId || !(seconds > 0)) return false

  const store = readStore(userId)
  const before = store.listened[noteId] || 0
  const after = before + seconds
  store.listened[noteId] = after
  writeStore(userId, store)

  const wasUnlocked = getChallengeUnlockProgress(before, noteDurationMs) >= 1
  const isUnlocked = getChallengeUnlockProgress(after, noteDurationMs) >= 1
  const justUnlocked = !wasUnlocked && isUnlocked

  window.dispatchEvent(
    new CustomEvent<ChallengeUnlocksChangedDetail>(CHALLENGE_UNLOCKS_CHANGED_EVENT, {
      detail: { noteId, justUnlocked },
    }),
  )
  return justUnlocked
}

/** Estado de desbloqueo de una nota, actualizado en vivo mientras se escucha. */
export function useChallengeUnlock(
  userId: string | null | undefined,
  noteId: string | null | undefined,
  noteDurationMs: number,
) {
  const read = useCallback(
    () => (noteId ? getChallengeListenedSeconds(userId, noteId) : 0),
    [noteId, userId],
  )
  const [listenedSeconds, setListenedSeconds] = useState(read)

  useEffect(() => {
    setListenedSeconds(read())
    const refresh = () => setListenedSeconds(read())
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ChallengeUnlocksChangedDetail>).detail
      if (!detail || detail.noteId === noteId) refresh()
    }
    const onVisibility = () => {
      // Al volver a la app después de medianoche, se vuelve a bloquear.
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onChanged)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onChanged)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [noteId, read])

  const progress = getChallengeUnlockProgress(listenedSeconds, noteDurationMs)
  return { listenedSeconds, progress, unlocked: progress >= 1 }
}

/** Avisa cuando cualquier nota se acaba de desbloquear (para mostrar un aviso). */
export function useOnChallengeUnlocked(callback: (noteId: string) => void): void {
  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ChallengeUnlocksChangedDetail>).detail
      if (detail?.justUnlocked) callback(detail.noteId)
    }
    window.addEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onChanged)
  }, [callback])
}
