import type { CoachingV2Focus } from '../../services/coaching'

/* Report: what each focus had when the week opened and what was won during it (Luis, 16 Oct). */

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

export type PhaseFlags = [boolean, boolean, boolean, boolean]

function focusPhases(focus: CoachingV2Focus): PhaseFlags {
  if (focus.completedAt) return [true, true, true, true]
  return [focus.phaseExplained, focus.phaseTrained, focus.phaseUnderstoodExplained, focus.phaseUsed]
}

/**
 * How the focos were when the week opened: the snapshot saved when the previous week closed.
 * [] in week 1 (everything is new); null when it is not known (then nothing is shown as gained).
 */
export type FocusBaseline = Array<{ focusTitle: string; phases: PhaseFlags }> | null

export function focusBaselineFromSnapshot(periodNumber: number, snapshot: unknown[] | null | undefined): FocusBaseline {
  if (periodNumber <= 1) return []
  if (!Array.isArray(snapshot)) return null
  return snapshot.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.focusTitle !== 'string') return []
    return [
      {
        focusTitle: row.focusTitle,
        phases: [
          row.phaseExplained === true,
          row.phaseTrained === true,
          row.phaseUnderstoodExplained === true,
          row.phaseUsed === true,
        ] as PhaseFlags,
      },
    ]
  })
}

export type PhaseState = 'before' | 'gained' | 'pending'

export type FocusWeek = {
  focus: CoachingV2Focus
  states: PhaseState[]
  gained: number
  masteredThisWeek: boolean
  /** Opened this week: it was not there when the week started. */
  isNew: boolean
}

/** What each focus had when the week opened and what was won during it. */
export function focusWeek(focus: CoachingV2Focus, baseline: FocusBaseline): FocusWeek {
  const now = focusPhases(focus)
  // A focus carried over from last week keeps its title; a new one starts from nothing.
  const match = baseline?.find((item) => normalize(item.focusTitle) === normalize(focus.focusTitle))
  const before: PhaseFlags = baseline === null ? now : match?.phases || [false, false, false, false]
  const states = now.map((done, index) => (!done ? 'pending' : before[index] ? 'before' : 'gained')) as PhaseState[]
  const gained = states.filter((state) => state === 'gained').length
  return { focus, states, gained, masteredThisWeek: now.every(Boolean) && gained > 0, isNew: baseline !== null && !match }
}

