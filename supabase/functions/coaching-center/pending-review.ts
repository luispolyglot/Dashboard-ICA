export type PendingReviewSession = {
  userId: string
  targetLang: string
  activatedAt: string | null
  durationWeeks: number
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
  const activatedAt = toDate(session.activatedAt)
  if (!activatedAt) return 0

  const durationWeeks = Math.min(12, Math.max(1, session.durationWeeks || 12))
  const periodEnd = new Date(
    activatedAt.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000,
  )
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

    return (
      referenceAt.getTime() >= activatedAt.getTime() &&
      referenceAt.getTime() < periodEnd.getTime()
    )
  }).length
}
