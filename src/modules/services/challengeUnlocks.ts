/**
 * NOTA DESAFIANTE — desbloqueo por escucha.
 *
 * Regla (decidida por Luis):
 * - Solo las notas maestras CERRADAS (completas, 3:00 o más) tienen nota desafiante.
 *   Escuchar una nota abierta no cuenta.
 * - El desafío de una nota maestra se desbloquea al escuchar al menos el 80 % de ESA nota.
 * - Se puede desbloquear en varias notas el mismo día.
 * - Una vez desbloqueado, queda abierto el resto del día.
 * - Al cambiar de día (hora local del dispositivo) todas se vuelven a bloquear.
 *
 * Solo cuenta el audio que suena de verdad (los saltos de +10 s no suman).
 *
 * Dónde se guarda:
 * - La verdad está en Supabase (tabla master_note_challenge_unlocks). Se escribe solo con la RPC
 *   bump_master_note_challenge_listening, que comprueba que la nota es del alumno y limita
 *   los segundos (nunca más que la duración de la nota). Así vale entre dispositivos.
 * - localStorage es la caché (para que la barra avance al instante) y la cola de segundos
 *   pendientes de enviar (si no hay conexión, se envían más tarde).
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const CHALLENGE_UNLOCK_RATIO = 0.8

export const CHALLENGE_UNLOCKS_CHANGED_EVENT = 'ica-challenge-unlocks-changed'

export type ChallengeUnlocksChangedDetail = {
  noteId: string
  /** true solo en el momento en que la nota pasa del 80 %. */
  justUnlocked: boolean
}

type CachedUnlocks = {
  day: string
  // segundos escuchados hoy por nota
  listened: Record<string, number>
  // notas ya desbloqueadas hoy (según el servidor o al cruzar el 80 % en este dispositivo)
  unlocked: Record<string, true>
}

// Segundos pendientes de enviar, por "día|nota". No se borra al cambiar de día.
type PendingListening = Record<string, number>

const CACHE_PREFIX = 'ica-challenge-unlocks-v2:'
const PENDING_PREFIX = 'ica-challenge-unlocks-pending-v2:'
const SEND_DELAY_MS = 10_000

function getLocalDayStamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function userKey(userId: string | null | undefined): string {
  return userId || 'anon'
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin espacio o bloqueado: el progreso dura hasta recargar (y el servidor sigue siendo la verdad).
  }
}

function readCache(userId: string | null | undefined): CachedUnlocks {
  const today = getLocalDayStamp()
  const parsed = readJson<CachedUnlocks>(`${CACHE_PREFIX}${userKey(userId)}`)
  if (
    parsed &&
    parsed.day === today &&
    parsed.listened &&
    typeof parsed.listened === 'object'
  ) {
    return { day: today, listened: parsed.listened, unlocked: parsed.unlocked || {} }
  }
  // Día nuevo (o nada guardado): todo bloqueado otra vez.
  return { day: today, listened: {}, unlocked: {} }
}

function writeCache(userId: string | null | undefined, cache: CachedUnlocks): void {
  writeJson(`${CACHE_PREFIX}${userKey(userId)}`, cache)
}

function readPending(userId: string): PendingListening {
  const parsed = readJson<PendingListening>(`${PENDING_PREFIX}${userId}`)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function writePending(userId: string, pending: PendingListening): void {
  if (!Object.keys(pending).length) {
    try {
      window.localStorage.removeItem(`${PENDING_PREFIX}${userId}`)
    } catch {
      // nada
    }
    return
  }
  writeJson(`${PENDING_PREFIX}${userId}`, pending)
}

function notifyChanged(noteId: string, justUnlocked: boolean): void {
  window.dispatchEvent(
    new CustomEvent<ChallengeUnlocksChangedDetail>(CHALLENGE_UNLOCKS_CHANGED_EVENT, {
      detail: { noteId, justUnlocked },
    }),
  )
}

/** Mezcla lo que dice el servidor con la caché (nunca retrocede). */
function mergeServerState(
  userId: string,
  day: string,
  noteId: string,
  listenedSeconds: number,
  unlocked: boolean,
): boolean {
  const cache = readCache(userId)
  if (cache.day !== day) return false
  const before = cache.listened[noteId] || 0
  const wasUnlocked = Boolean(cache.unlocked[noteId])
  cache.listened[noteId] = Math.max(before, listenedSeconds)
  if (unlocked) cache.unlocked[noteId] = true
  writeCache(userId, cache)
  return cache.listened[noteId] !== before || wasUnlocked !== Boolean(cache.unlocked[noteId])
}

export function getChallengeListenedSeconds(
  userId: string | null | undefined,
  noteId: string,
): number {
  return readCache(userId).listened[noteId] || 0
}

export function getChallengeUnlockProgress(
  listenedSeconds: number,
  noteDurationMs: number,
): number {
  const needed = (Math.max(0, noteDurationMs) / 1000) * CHALLENGE_UNLOCK_RATIO
  if (needed <= 0) return 0
  return Math.min(1, listenedSeconds / needed)
}

// ---------------------------------------------------------------------------
// Envío al servidor
// ---------------------------------------------------------------------------

let sendTimer: number | null = null
let sendInFlight: Promise<void> | null = null
let lastUserId: string | null = null

async function sendPendingNow(userId: string): Promise<void> {
  const client = supabase
  if (!client) return
  while (sendInFlight) {
    await sendInFlight
  }

  sendInFlight = (async () => {
    const snapshot = readPending(userId)
    for (const [key, seconds] of Object.entries(snapshot)) {
      const [day, noteId] = key.split('|')
      if (!day || !noteId || !(seconds > 0)) {
        const pending = readPending(userId)
        delete pending[key]
        writePending(userId, pending)
        continue
      }

      const { data, error } = await client.rpc('bump_master_note_challenge_listening', {
        p_note_id: noteId,
        p_day: day,
        p_delta_seconds: seconds,
      })

      if (error) {
        // Nota borrada o día ya no válido: se descarta. Cualquier otro error: se reintenta luego.
        if (/MASTER_NOTE_NOT_FOUND|MASTER_NOTE_NOT_CLOSED|INVALID_DAY/.test(error.message || '')) {
          const pending = readPending(userId)
          delete pending[key]
          writePending(userId, pending)
          continue
        }
        console.error('[nota desafiante] no se pudo guardar la escucha', error)
        return
      }

      // Se resta lo enviado (mientras tanto pudo sumarse más).
      const pending = readPending(userId)
      const left = (pending[key] || 0) - seconds
      if (left > 0.01) pending[key] = left
      else delete pending[key]
      writePending(userId, pending)

      const row = (Array.isArray(data) ? data[0] : data) as
        | { listened_seconds?: number; unlocked?: boolean; just_unlocked?: boolean }
        | null
      if (row) {
        const wasUnlocked = Boolean(readCache(userId).unlocked[noteId])
        const changed = mergeServerState(
          userId,
          day,
          noteId,
          Number(row.listened_seconds) || 0,
          Boolean(row.unlocked),
        )
        const justUnlocked = Boolean(row.unlocked) && !wasUnlocked
        if (changed || justUnlocked) notifyChanged(noteId, justUnlocked)
      }
    }
  })()

  try {
    await sendInFlight
  } finally {
    sendInFlight = null
  }
}

function scheduleSend(userId: string, delayMs = SEND_DELAY_MS): void {
  lastUserId = userId
  if (sendTimer !== null) window.clearTimeout(sendTimer)
  sendTimer = window.setTimeout(() => {
    sendTimer = null
    void sendPendingNow(userId)
  }, delayMs)
}

// Al cerrar o esconder la app se envía lo pendiente.
if (typeof window !== 'undefined') {
  const flushOnLeave = () => {
    if (!lastUserId) return
    if (sendTimer !== null) {
      window.clearTimeout(sendTimer)
      sendTimer = null
    }
    void sendPendingNow(lastUserId)
  }
  window.addEventListener('pagehide', flushOnLeave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnLeave()
  })
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

  const cache = readCache(userId)
  const before = cache.listened[noteId] || 0
  const after = before + seconds
  cache.listened[noteId] = after

  const wasUnlocked =
    Boolean(cache.unlocked[noteId]) || getChallengeUnlockProgress(before, noteDurationMs) >= 1
  const isUnlocked = getChallengeUnlockProgress(after, noteDurationMs) >= 1
  const justUnlocked = !wasUnlocked && isUnlocked
  if (isUnlocked) cache.unlocked[noteId] = true
  writeCache(userId, cache)

  if (userId) {
    const pending = readPending(userId)
    const key = `${cache.day}|${noteId}`
    pending[key] = (pending[key] || 0) + seconds
    writePending(userId, pending)
    // Al desbloquear se envía ya; si no, se agrupa unos segundos para no llamar tanto.
    scheduleSend(userId, justUnlocked ? 0 : SEND_DELAY_MS)
  }

  notifyChanged(noteId, justUnlocked)
  return justUnlocked
}

// ---------------------------------------------------------------------------
// Lectura del servidor (agrupada: la lista de notas hace una sola consulta)
// ---------------------------------------------------------------------------

const syncQueue = new Map<string, Set<string>>()
const syncedNotes = new Set<string>()
let syncTimer: number | null = null

function syncKey(userId: string, day: string, noteId: string): string {
  return `${userId}|${day}|${noteId}`
}

function requestSync(userId: string, noteId: string): void {
  const queue = syncQueue.get(userId) || new Set<string>()
  queue.add(noteId)
  syncQueue.set(userId, queue)
  if (syncTimer !== null) return
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    const batches = Array.from(syncQueue.entries())
    syncQueue.clear()
    for (const [batchUserId, noteIds] of batches) {
      void runSync(batchUserId, Array.from(noteIds))
    }
  }, 0)
}

async function runSync(userId: string, noteIds: string[]): Promise<void> {
  const day = getLocalDayStamp()
  if (!supabase || !noteIds.length) return

  // Primero se envía lo pendiente, para que la lectura ya lo incluya.
  await sendPendingNow(userId).catch(() => {})

  const { data, error } = await supabase
    .from('master_note_challenge_unlocks')
    .select('note_id, listened_seconds, unlocked_at')
    .eq('user_id', userId)
    .eq('day', day)
    .in('note_id', noteIds)

  if (error) {
    console.error('[nota desafiante] no se pudo leer el desbloqueo', error)
  } else {
    for (const row of (data || []) as Array<{
      note_id: string
      listened_seconds: number
      unlocked_at: string | null
    }>) {
      mergeServerState(
        userId,
        day,
        row.note_id,
        Number(row.listened_seconds) || 0,
        Boolean(row.unlocked_at),
      )
    }
  }

  for (const noteId of noteIds) {
    syncedNotes.add(syncKey(userId, day, noteId))
    notifyChanged(noteId, false)
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Estado de desbloqueo de una nota, actualizado en vivo mientras se escucha.
 * `synced` pasa a true cuando ya se ha leído el estado del servidor.
 */
export function useChallengeUnlock(
  userId: string | null | undefined,
  noteId: string | null | undefined,
  noteDurationMs: number,
  enabled = true,
) {
  const read = useCallback(() => {
    if (!noteId) return { listenedSeconds: 0, unlockedFlag: false, synced: false }
    const cache = readCache(userId)
    return {
      listenedSeconds: cache.listened[noteId] || 0,
      unlockedFlag: Boolean(cache.unlocked[noteId]),
      synced: Boolean(userId) && syncedNotes.has(syncKey(userId || '', cache.day, noteId)),
    }
  }, [noteId, userId])
  const [state, setState] = useState(read)

  useEffect(() => {
    setState(read())
    if (enabled && userId && noteId) requestSync(userId, noteId)

    const refresh = () => setState(read())
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ChallengeUnlocksChangedDetail>).detail
      if (!detail || detail.noteId === noteId) refresh()
    }
    const onVisibility = () => {
      // Al volver a la app: se vuelve a leer (otro dispositivo pudo desbloquearla,
      // o ya es otro día y se vuelve a bloquear).
      if (document.visibilityState === 'visible') {
        refresh()
        if (enabled && userId && noteId) requestSync(userId, noteId)
      }
    }
    window.addEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onChanged)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)

    // Aunque la app se quede abierta en pantalla, a las 00:00 (hora del alumno)
    // todas las notas desafiantes se vuelven a bloquear.
    let midnightTimer = 0
    const scheduleMidnight = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      midnightTimer = window.setTimeout(() => {
        refresh()
        scheduleMidnight()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleMidnight()

    return () => {
      window.removeEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onChanged)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(midnightTimer)
    }
  }, [enabled, noteId, read, userId])

  const progress = getChallengeUnlockProgress(state.listenedSeconds, noteDurationMs)
  return {
    listenedSeconds: state.listenedSeconds,
    progress: state.unlockedFlag ? 1 : progress,
    unlocked: state.unlockedFlag || progress >= 1,
    synced: state.synced,
  }
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
