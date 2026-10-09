import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { t } from '@/i18n'
import { notifyListeningMetricsChanged } from './creationMetricsSync'
import { getLocalListeningDayStamp } from './listeningCalendar'

/** Seconds of listening in a day that give +0.1 points in the monthly ranking (server rule). */
export const LISTENING_GOAL_SECONDS = 600
const GOAL_CELEBRATED_KEY = 'icademy:master-note-listening:goal-celebrated-day'

type PendingListeningDeltaEvent = {
  id: string
  userId: string
  day: string
  targetLang: string
  nativeLang: string
  deltaSeconds: number
  createdAt: string
  occurredAt: string
}

const STORAGE_KEY = 'icademy:master-note-listening:pending:v1'
let flushInFlight: Promise<void> | null = null
// Events being sent right now: new seconds never merge into them (they would be lost when the
// event is removed after the server accepts it).
const inFlightEventIds = new Set<string>()

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeDay(value: unknown): string {
  const text = safeString(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function safeTimestamp(value: unknown): string {
  const text = safeString(value)
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : ''
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
        const legacyDay = safeDay(row.day)
        const targetLang = safeString(row.targetLang)
        const nativeLang = safeString(row.nativeLang)
        const deltaSeconds = Math.max(0, Math.floor(Number(row.deltaSeconds) || 0))
        const createdAt = safeTimestamp(row.createdAt) || new Date().toISOString()
        const occurredAt = safeTimestamp(row.occurredAt) || createdAt
        const day = getLocalListeningDayStamp(new Date(occurredAt)) || legacyDay

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
          occurredAt,
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

export function enqueueMasterNoteListeningDelta(input: {
  userId: string
  day: string
  targetLang: string
  nativeLang: string
  deltaSeconds: number
  occurredAt: string
}): void {
  const userId = safeString(input.userId)
  const day = safeDay(input.day)
  const targetLang = normalizeLanguage(safeString(input.targetLang))
  const nativeLang = normalizeLanguage(safeString(input.nativeLang))
  const deltaSeconds = Math.max(0, Math.floor(input.deltaSeconds || 0))
  const occurredAt = safeTimestamp(input.occurredAt)

  if (!userId || !day || !targetLang || !nativeLang || deltaSeconds <= 0 || !occurredAt) return

  const events = readPendingEvents()

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i]
    if (!row) continue

    const sameKey =
      !inFlightEventIds.has(row.id)
      && row.userId === userId
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
    occurredAt,
  })
  writePendingEvents(events)
}

export async function flushPendingMasterNoteListeningDeltas(userId: string): Promise<void> {
  const normalizedUserId = safeString(userId)
  if (!normalizedUserId || !supabase) return

  while (flushInFlight) await flushInFlight

  const nextFlush = (async () => {
    let flushedCount = 0

    while (true) {
      const queue = readPendingEvents().filter((event) => event.userId === normalizedUserId)
      if (queue.length === 0) break

      let flushedFromQueue = false
      let stoppedOnError = false
      for (const event of queue) {
        inFlightEventIds.add(event.id)
        try {
          const { error } = await supabase.rpc('bump_master_note_listening_metrics', {
            p_event_id: event.id,
            p_day: event.day,
            p_target_lang: event.targetLang,
            p_native_lang: event.nativeLang,
            p_delta_seconds: event.deltaSeconds,
            p_occurred_at: event.occurredAt,
          })

          if (error) {
            stoppedOnError = true
            break
          }

          // Re-read because listening may have enqueued a separate event during this request.
          const remainingEvents = readPendingEvents().filter((row) => row.id !== event.id)
          writePendingEvents(remainingEvents)
          flushedCount += 1
          flushedFromQueue = true
        } finally {
          inFlightEventIds.delete(event.id)
        }
      }

      if (stoppedOnError || !flushedFromQueue) break
    }

    if (flushedCount > 0) {
      notifyListeningMetricsChanged()
      void celebrateListeningGoalIfReached(normalizedUserId).catch(() => undefined)
    }
  })()

  flushInFlight = nextFlush
  try {
    await nextFlush
  } finally {
    if (flushInFlight === nextFlush) flushInFlight = null
  }
}

function readCelebratedDay(): string | null {
  try {
    return window.localStorage.getItem(GOAL_CELEBRATED_KEY)
  } catch {
    return null
  }
}

/**
 * 10 MINUTES OF LISTENING (Luis, 5 Oct): as soon as today's listening reaches 10 minutes (all
 * languages together, like the ranking counts it), a message says that today's +0.1 points are
 * already in the ranking. Once per day and browser.
 */
export async function celebrateListeningGoalIfReached(userId: string): Promise<boolean> {
  if (!supabase || typeof window === 'undefined') return false
  const day = getLocalListeningDayStamp()
  if (readCelebratedDay() === day) return false

  const { data, error } = await supabase
    .from('master_note_listening_daily_metrics')
    .select('listened_seconds')
    .eq('user_id', userId)
    .eq('day', day)
  if (error) return false

  const total = (data ?? []).reduce(
    (sum, row) => sum + (Number((row as { listened_seconds?: number }).listened_seconds) || 0),
    0,
  )
  if (total < LISTENING_GOAL_SECONDS) return false

  try {
    window.localStorage.setItem(GOAL_CELEBRATED_KEY, day)
  } catch {
    // Without storage the message could show again on reload; it is harmless.
  }
  toast.success(t('¡10 minutos de escucha hoy!'), {
    description: t('Ya tienes +0,1 puntos en el ranking de hoy.'),
  })
  return true
}
