export type CoachingSessionWeekActivationRow = {
  session_id: string
  week_number: number
  activated_at: string
  ended_at: string | null
}

export type WeekWindow = {
  weekNumber: number
  weekKey: string
  start: Date
  end: Date
  isFinished: boolean
}

export type WeekActivationState = {
  lastActivatedWeek: number
  activatedWeeks: string[]
  currentActiveWeek: number | null
  nextWeekEligible: number | null
  nextWeekBlockedReason: 'missing_objectives' | 'previous_week_not_finished' | null
}

export type WeekActivationDecision = {
  ok: boolean
  reason:
    | 'already_activated'
    | 'missing_objectives'
    | 'previous_week_not_finished'
    | 'week_out_of_range'
    | null
}

function toDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function weekKeyFromNumber(value: number): string {
  const week = Math.min(12, Math.max(1, Number.isFinite(value) ? value : 1))
  return `W${String(week).padStart(2, '0')}`
}

export function hasConfiguredObjectiveForWeek(
  weeklyObjectives: Record<string, unknown>,
  weekNumber: number,
): boolean {
  const key = weekKeyFromNumber(weekNumber)
  const raw = weeklyObjectives[key]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const record = raw as Record<string, unknown>

  const exerciseRecord =
    record.exercise && typeof record.exercise === 'object' && !Array.isArray(record.exercise)
      ? (record.exercise as Record<string, unknown>)
      : null

  const numericFields = [
    toInteger(record.wordsTarget),
    toInteger(record.nmTarget),
    toInteger(record.icaStreakObjectivePct ?? record.icaStreakTargetPct),
    toInteger(
      record.flashcardsStreakObjectivePct ??
        record.flashcardsStreakAchievedPct ??
        record.icaStreakAchievedPct,
    ),
  ]

  return (
    numericFields.some((value) => value !== null) ||
    Boolean(toString(record.reportExerciseUrl)) ||
    Boolean(toString(exerciseRecord?.url))
  )
}

export function buildWeekWindows(
  activations: CoachingSessionWeekActivationRow[],
  nowMs = Date.now(),
): WeekWindow[] {
  const windows: WeekWindow[] = []

  for (const activation of activations) {
    const start = toDate(activation.activated_at)
    if (!start) continue
    const ended = activation.ended_at ? toDate(activation.ended_at) : null
    const end = ended || new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
    const weekNumber = Math.min(12, Math.max(1, activation.week_number || 1))
    windows.push({
      weekNumber,
      weekKey: weekKeyFromNumber(weekNumber),
      start,
      end,
      isFinished: end.getTime() <= nowMs,
    })
  }

  return windows.sort((a, b) => a.weekNumber - b.weekNumber)
}

export function buildWeekActivationState(
  activations: CoachingSessionWeekActivationRow[],
  weeklyObjectives: Record<string, unknown>,
  nowMs = Date.now(),
): WeekActivationState {
  const windows = buildWeekWindows(activations, nowMs)
  const activatedWeeks = windows.map((item) => item.weekKey)
  const lastActivatedWeek = windows[windows.length - 1]?.weekNumber || 0
  const activeWindow = [...windows].reverse().find((item) => !item.isFinished) || null
  const currentActiveWeek = activeWindow ? activeWindow.weekNumber : null

  if (lastActivatedWeek >= 12) {
    return {
      lastActivatedWeek,
      activatedWeeks,
      currentActiveWeek,
      nextWeekEligible: null,
      nextWeekBlockedReason: null,
    }
  }

  const candidate = lastActivatedWeek + 1
  if (!hasConfiguredObjectiveForWeek(weeklyObjectives, candidate)) {
    return {
      lastActivatedWeek,
      activatedWeeks,
      currentActiveWeek,
      nextWeekEligible: null,
      nextWeekBlockedReason: 'missing_objectives',
    }
  }

  if (lastActivatedWeek > 0) {
    const previous = windows.find((item) => item.weekNumber === lastActivatedWeek) || null
    if (!previous || !previous.isFinished) {
      return {
        lastActivatedWeek,
        activatedWeeks,
        currentActiveWeek,
        nextWeekEligible: null,
        nextWeekBlockedReason: 'previous_week_not_finished',
      }
    }
  }

  return {
    lastActivatedWeek,
    activatedWeeks,
    currentActiveWeek,
    nextWeekEligible: candidate,
    nextWeekBlockedReason: null,
  }
}

export function evaluateWeekActivationRequest(input: {
  weekNumber: number
  activations: CoachingSessionWeekActivationRow[]
  weeklyObjectives: Record<string, unknown>
  nowMs?: number
}): WeekActivationDecision {
  const weekNumber = Math.trunc(input.weekNumber)
  if (!Number.isFinite(weekNumber) || weekNumber < 1 || weekNumber > 12) {
    return { ok: false, reason: 'week_out_of_range' }
  }

  const windows = buildWeekWindows(input.activations, input.nowMs)
  const existing = windows.find((window) => window.weekNumber === weekNumber)
  if (existing) return { ok: false, reason: 'already_activated' }

  if (!hasConfiguredObjectiveForWeek(input.weeklyObjectives, weekNumber)) {
    return { ok: false, reason: 'missing_objectives' }
  }

  if (weekNumber > 1) {
    const previous = windows.find((window) => window.weekNumber === weekNumber - 1)
    if (!previous || !previous.isFinished) {
      return { ok: false, reason: 'previous_week_not_finished' }
    }
  }

  return { ok: true, reason: null }
}
