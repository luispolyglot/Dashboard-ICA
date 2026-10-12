export type PendingReviewSession = {
  userId: string
  targetLang: string
  activatedAt: string | null
  durationWeeks: number
  activatedWeekWindows?: Array<{ startAt: string; endAt: string }>
}

export type PendingReviewNote = {
  userId: string
  targetLang: string
  closedAt: string | null
  updatedAt: string | null
  feedbackLoomUrl: string | null
  feedbackNotes: string | null
}

function toDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeText(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeLang(value: string): string {
  return value.trim().toLowerCase()
}

export function countPendingMasterNotesForSession(
  session: PendingReviewSession,
  notes: PendingReviewNote[],
): number {
  const windows = (session.activatedWeekWindows || [])
    .map((item) => ({
      startAt: toDate(item.startAt),
      endAt: toDate(item.endAt),
    }))
    .filter(
      (item): item is { startAt: Date; endAt: Date } =>
        Boolean(item.startAt) && Boolean(item.endAt),
    )

  const activatedAt = toDate(session.activatedAt)
  const fallbackPeriodEnd = new Date()

  if (windows.length === 0 && !activatedAt) return 0
  const targetLang = normalizeLang(session.targetLang)

  return notes.filter((note) => {
    if (note.userId !== session.userId) return false
    if (normalizeLang(note.targetLang) !== targetLang) return false

    const hasFeedback = Boolean(
      normalizeText(note.feedbackLoomUrl) || normalizeText(note.feedbackNotes),
    )
    if (hasFeedback) return false

    const referenceAt = toDate(note.closedAt || note.updatedAt)
    if (!referenceAt) return false

    if (windows.length > 0) {
      return windows.some(
        (window) =>
          referenceAt.getTime() >= window.startAt.getTime() &&
          referenceAt.getTime() < window.endAt.getTime(),
      )
    }

    return (
      Boolean(activatedAt) &&
      referenceAt.getTime() >= activatedAt.getTime() &&
      referenceAt.getTime() < fallbackPeriodEnd.getTime()
    )
  }).length
}

export type PendingTaskAudioRow = {
  sessionId: string
  periodNumber: number
  feedbackAt: string | null
}

/**
 * Homework audios still waiting for the coach's feedback (Luis, 9 Oct: the coach must see at a
 * glance that a student sent the audio of a task). Per session: how many and in which weeks.
 */
export function countPendingTaskAudioBySession(
  rows: PendingTaskAudioRow[],
): Map<string, { count: number; periods: number[] }> {
  const bySession = new Map<string, { count: number; periods: number[] }>()
  for (const row of rows) {
    if (!row.sessionId || normalizeText(row.feedbackAt)) continue
    const current = bySession.get(row.sessionId) || { count: 0, periods: [] }
    current.count += 1
    if (Number.isFinite(row.periodNumber) && !current.periods.includes(row.periodNumber)) {
      current.periods.push(row.periodNumber)
    }
    bySession.set(row.sessionId, current)
  }
  for (const value of bySession.values()) value.periods.sort((a, b) => a - b)
  return bySession
}
