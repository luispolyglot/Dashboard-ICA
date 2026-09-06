export const COACHING_V2_TOTAL_PERIODS = 10
export const COACHING_V2_MAX_ACTIVE_FOCUSES = 3

export type CoachingV2FocusPhaseKey =
  | 'phaseExplained'
  | 'phaseTrained'
  | 'phaseUnderstoodExplained'
  | 'phaseUsed'

export type CoachingV2FocusState = {
  id: string
  periodNumber: number
  focusTitle: string
  focusComment: string | null
  phaseExplained: boolean
  phaseTrained: boolean
  phaseUnderstoodExplained: boolean
  phaseUsed: boolean
  completedAt: string | null
  archivedAt: string | null
}

export type CoachingV2FocusSnapshotItem = {
  id: string
  focusTitle: string
  focusComment: string | null
  phaseExplained: boolean
  phaseTrained: boolean
  phaseUnderstoodExplained: boolean
  phaseUsed: boolean
  completedAt: string | null
}

export function isCompletedFocus(input: {
  phaseExplained: boolean
  phaseTrained: boolean
  phaseUnderstoodExplained: boolean
  phaseUsed: boolean
}): boolean {
  return (
    input.phaseExplained &&
    input.phaseTrained &&
    input.phaseUnderstoodExplained &&
    input.phaseUsed
  )
}

export function countActiveFocuses(focuses: CoachingV2FocusState[]): number {
  return focuses.filter(
    (focus) => !focus.archivedAt && !isCompletedFocus(focus),
  ).length
}

export function canCreateFocus(focuses: CoachingV2FocusState[]): boolean {
  return countActiveFocuses(focuses) < COACHING_V2_MAX_ACTIVE_FOCUSES
}

export function applyFocusPhaseToggle(input: {
  focus: CoachingV2FocusState
  phase: CoachingV2FocusPhaseKey
  checked: boolean
  nowIso: string
}): CoachingV2FocusState {
  const next = {
    ...input.focus,
    [input.phase]: input.checked,
  }

  const completed = isCompletedFocus(next)

  return {
    ...next,
    completedAt: completed ? input.nowIso : null,
  }
}

export function buildFocusSnapshot(
  focuses: CoachingV2FocusState[],
): CoachingV2FocusSnapshotItem[] {
  return focuses
    .filter((focus) => !focus.archivedAt)
    .map((focus) => ({
      id: focus.id,
      focusTitle: focus.focusTitle,
      focusComment: focus.focusComment,
      phaseExplained: focus.phaseExplained,
      phaseTrained: focus.phaseTrained,
      phaseUnderstoodExplained: focus.phaseUnderstoodExplained,
      phaseUsed: focus.phaseUsed,
      completedAt: isCompletedFocus(focus) ? focus.completedAt : null,
    }))
}

export function buildCarryOverFocusesFromSnapshot(input: {
  snapshot: CoachingV2FocusSnapshotItem[]
}): Array<
  Omit<
    CoachingV2FocusState,
    'id' | 'periodNumber' | 'completedAt' | 'archivedAt'
  > & {
    completedAt: string | null
  }
> {
  return input.snapshot
    .filter((item) => !isCompletedFocus(item))
    .slice(0, COACHING_V2_MAX_ACTIVE_FOCUSES)
    .map((item) => ({
      focusTitle: item.focusTitle,
      focusComment: item.focusComment,
      phaseExplained: item.phaseExplained,
      phaseTrained: item.phaseTrained,
      phaseUnderstoodExplained: item.phaseUnderstoodExplained,
      phaseUsed: item.phaseUsed,
      completedAt: null,
    }))
}

export function normalizePeriodNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? Math.trunc(value)
      : typeof value === 'string' && value.trim().length > 0
        ? Math.trunc(Number(value.trim()))
        : NaN

  if (!Number.isFinite(parsed)) return null
  if (parsed < 1 || parsed > COACHING_V2_TOTAL_PERIODS) return null
  return parsed
}
