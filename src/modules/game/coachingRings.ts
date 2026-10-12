// COACHING RINGS (Luis, 6 Oct): each week of the coaching has 6 tasks (3 per class). Answering
// the 6 closes that week's ring. A week the coach already closed keeps the ring it reached
// («4/6»). The same count is done on the server for the «Coaching» badge
// (public.coaching_rings_by_session).

import type { CoachingV2ClassSlot } from '../services/coaching'

export const TASKS_PER_WEEK = 6

type RingClass = Pick<
  CoachingV2ClassSlot,
  'periodNumber' | 'classIndex' | 'studentGuidelineResponse1' | 'studentGuidelineResponse2' | 'studentGuidelineResponse3' | 'audioAnswers'
>

/** Whether task 1, 2 or 3 of a class is answered: written answer, or the audio sent. */
export function isTaskAnswered(classRow: RingClass | null | undefined, taskIndex: 1 | 2 | 3): boolean {
  if (!classRow) return false
  const text =
    taskIndex === 1
      ? classRow.studentGuidelineResponse1
      : taskIndex === 2
        ? classRow.studentGuidelineResponse2
        : classRow.studentGuidelineResponse3
  if ((text || '').trim()) return true
  return (classRow.audioAnswers || []).some((answer) => answer.taskIndex === taskIndex)
}

export type WeekRingState = 'locked' | 'active' | 'sealed' | 'closed'

export type WeekRing = {
  period: number
  answered: number
  /** 6 of 6: the ring is complete. */
  complete: boolean
  state: WeekRingState
}

/**
 * One ring per week. `activatedPeriods` and `closedPeriods` come from the board's period
 * activations: a week not activated yet is «locked».
 */
export function buildWeekRings(input: {
  classes: RingClass[]
  durationPeriods: number
  activatedPeriods: Set<number>
  closedPeriods: Set<number>
}): WeekRing[] {
  const total = Math.max(1, Math.min(20, input.durationPeriods || 10))
  return Array.from({ length: total }, (_, index) => {
    const period = index + 1
    const weekClasses = input.classes.filter((row) => row.periodNumber === period && (row.classIndex === 1 || row.classIndex === 2))
    const answered = weekClasses.reduce(
      (sum, row) => sum + ([1, 2, 3] as const).filter((task) => isTaskAnswered(row, task)).length,
      0,
    )
    const capped = Math.min(TASKS_PER_WEEK, answered)
    const complete = capped >= TASKS_PER_WEEK
    const activated = input.activatedPeriods.has(period)
    const state: WeekRingState = !activated
      ? 'locked'
      : complete
        ? 'sealed'
        : input.closedPeriods.has(period)
          ? 'closed'
          : 'active'
    return { period, answered: activated ? capped : 0, complete: activated && complete, state }
  })
}

export function countRings(rings: WeekRing[]): number {
  return rings.filter((ring) => ring.complete).length
}
