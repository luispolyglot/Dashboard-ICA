import { supabase } from '@/lib/supabase'

type PendingListeningDeltaEvent = {
  id: string
  userId: string
  day: string
  targetLang: string
  nativeLang: string
  deltaSeconds: number
  createdAt: string
}

const STORAGE_KEY = 'icademy:master-note-listening:pending:v1'
let flushInFlight: Promise<void> | null = null

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeDay(value: unknown): string {
  const text = safeString(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readPendingEvents(): PendingListeningDeltaEvent[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>

        const id = safeString(row.id)
        const userId = safeString(row.userId)
        const day = safeDay(row.day)
        const targetLang = safeString(row.targetLang)
        const nativeLang = safeString(row.nativeLang)
        const deltaSeconds = Math.max(0, Math.floor(Number(row.deltaSeconds) || 0))
        const createdAt = safeString(row.createdAt) || new Date().toISOString()

        if (!id || !userId || !day || !targetLang || !nativeLang || deltaSeconds <= 0) {
          return null
        }

        return {
          id,
          userId,
          day,
          targetLang,
          nativeLang,
          deltaSeconds,
          createdAt,
        }
      })
      .filter((item): item is PendingListeningDeltaEvent => Boolean(item))
  } catch {
    return []
  }
}

function writePendingEvents(events: PendingListeningDeltaEvent[]): void {
  if (typeof window === 'undefined') return
  if (events.length === 0) {
    window.localStorage.removeItem(STORAGE_KEY)
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

function normalizeLanguage(value: string): string {
  return value.trim()
}

export function getUtcDayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function enqueueMasterNoteListeningDelta(input: {
  userId: string
  day: string
  targetLang: string
  nativeLang: string
  deltaSeconds: number
}): void {
  const userId = safeString(input.userId)
  const day = safeDay(input.day)
  const targetLang = normalizeLanguage(safeString(input.targetLang))
  const nativeLang = normalizeLanguage(safeString(input.nativeLang))
  const deltaSeconds = Math.max(0, Math.floor(input.deltaSeconds || 0))

  if (!userId || !day || !targetLang || !nativeLang || deltaSeconds <= 0) return

  const events = readPendingEvents()

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i]
    if (!row) continue

    const sameKey =
      row.userId === userId
      && row.day === day
      && row.targetLang === targetLang
      && row.nativeLang === nativeLang

    if (!sameKey) continue

    row.deltaSeconds += deltaSeconds
    writePendingEvents(events)
    return
  }

  events.push({
    id: createEventId(),
    userId,
    day,
    targetLang,
    nativeLang,
    deltaSeconds,
    createdAt: new Date().toISOString(),
  })
  writePendingEvents(events)
}

export async function flushPendingMasterNoteListeningDeltas(userId: string): Promise<void> {
  const normalizedUserId = safeString(userId)
  if (!normalizedUserId || !supabase) return

  if (flushInFlight) {
    await flushInFlight
    return
  }

  flushInFlight = (async () => {
    let events = readPendingEvents()
    if (events.length === 0) return

    const queue = events.filter((event) => event.userId === normalizedUserId)
    if (queue.length === 0) return

    for (const event of queue) {
      const { error } = await supabase.rpc('bump_master_note_listening_metrics', {
        p_event_id: event.id,
        p_day: event.day,
        p_target_lang: event.targetLang,
        p_native_lang: event.nativeLang,
        p_delta_seconds: event.deltaSeconds,
      })

      if (error) {
        break
      }

      events = events.filter((row) => row.id !== event.id)
      writePendingEvents(events)
    }
  })()

  try {
    await flushInFlight
  } finally {
    flushInFlight = null
  }
}
