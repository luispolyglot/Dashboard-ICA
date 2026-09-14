import { describe, expect, it } from 'vitest'
import {
  COACHING_V2_MAX_ACTIVE_FOCUSES,
  applyFocusPhaseToggle,
  buildCarryOverFocusesFromSnapshot,
  buildFocusSnapshot,
  canCreateFocus,
  countActiveFocuses,
  normalizePeriodNumber,
  type CoachingV2FocusState,
} from '../../../../../supabase/functions/coaching-center/v2-focus'

function focus(overrides?: Partial<CoachingV2FocusState>): CoachingV2FocusState {
  return {
    id: 'focus-id',
    periodNumber: 1,
    focusTitle: 'Past Simple',
    focusComment: null,
    phaseExplained: false,
    phaseTrained: false,
    phaseUnderstoodExplained: false,
    phaseUsed: false,
    completedAt: null,
    archivedAt: null,
    ...overrides,
  }
}

describe('coaching v2 focus rules', () => {
  it('enforces max 3 active focuses', () => {
    const rows = [focus(), focus(), focus()]
    expect(countActiveFocuses(rows)).toBe(COACHING_V2_MAX_ACTIVE_FOCUSES)
    expect(canCreateFocus(rows)).toBe(false)
  })

  it('allows adding a new focus when one was completed', () => {
    const rows = [
      focus({
        phaseExplained: true,
        phaseTrained: true,
        phaseUnderstoodExplained: true,
        phaseUsed: true,
        completedAt: '2026-09-03T12:00:00.000Z',
      }),
      focus(),
      focus(),
    ]

    expect(countActiveFocuses(rows)).toBe(2)
    expect(canCreateFocus(rows)).toBe(true)
  })

  it('marks completedAt when last phase is checked', () => {
    const nowIso = '2026-09-03T14:20:00.000Z'
    const row = focus({
      phaseExplained: true,
      phaseTrained: true,
      phaseUnderstoodExplained: true,
    })

    const updated = applyFocusPhaseToggle({
      focus: row,
      phase: 'phaseUsed',
      checked: true,
      nowIso,
    })

    expect(updated.phaseUsed).toBe(true)
    expect(updated.completedAt).toBe(nowIso)
  })

  it('resets completedAt when a completed focus is unchecked', () => {
    const row = focus({
      phaseExplained: true,
      phaseTrained: true,
      phaseUnderstoodExplained: true,
      phaseUsed: true,
      completedAt: '2026-09-03T14:20:00.000Z',
    })

    const updated = applyFocusPhaseToggle({
      focus: row,
      phase: 'phaseUsed',
      checked: false,
      nowIso: '2026-09-03T15:00:00.000Z',
    })

    expect(updated.phaseUsed).toBe(false)
    expect(updated.completedAt).toBeNull()
  })

  it('creates snapshot and carries only incomplete focuses to next period', () => {
    const snapshot = buildFocusSnapshot([
      focus({
        id: 'a',
        focusTitle: 'Past Simple',
        phaseExplained: true,
        phaseTrained: true,
      }),
      focus({
        id: 'b',
        focusTitle: 'Present Perfect',
        phaseExplained: true,
        phaseTrained: true,
        phaseUnderstoodExplained: true,
        phaseUsed: true,
        completedAt: '2026-09-03T14:20:00.000Z',
      }),
      focus({
        id: 'c',
        focusTitle: 'Articles',
        phaseExplained: true,
      }),
    ])

    const carryOver = buildCarryOverFocusesFromSnapshot({ snapshot })

    expect(snapshot).toHaveLength(3)
    expect(carryOver).toHaveLength(2)
    expect(carryOver.map((item) => item.focusTitle)).toEqual([
      'Past Simple',
      'Articles',
    ])
  })

  it('normalizes period number only in range 1..10', () => {
    expect(normalizePeriodNumber('3')).toBe(3)
    expect(normalizePeriodNumber(10)).toBe(10)
    expect(normalizePeriodNumber(0)).toBeNull()
    expect(normalizePeriodNumber(11)).toBeNull()
    expect(normalizePeriodNumber('x')).toBeNull()
  })
})
