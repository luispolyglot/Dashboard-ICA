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
  const durationWeeks = Math.min(12, Math.max(1, session.durationWeeks || 12))
  const fallbackPeriodEnd = activatedAt
    ? new Date(activatedAt.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000)
    : null

  if (windows.length === 0 && (!activatedAt || !fallbackPeriodEnd)) return 0
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
      Boolean(fallbackPeriodEnd) &&
      referenceAt.getTime() >= activatedAt.getTime() &&
      referenceAt.getTime() < fallbackPeriodEnd.getTime()
    )
  }).length
}
