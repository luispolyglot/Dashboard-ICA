import { describe, expect, it } from 'vitest'
import {
  areCoachGuidelinesComplete,
  getVisibleFocusColumns,
} from '@/modules/views/coachingV2Matrix'
import type { CoachingV2Focus } from '@/modules/services/coaching'

function focus(id: string): CoachingV2Focus {
  return {
    id,
    periodNumber: 1,
    focusTitle: `Focus ${id}`,
    focusComment: null,
    phaseExplained: false,
    phaseTrained: false,
    phaseUnderstoodExplained: false,
    phaseUsed: false,
    completedAt: null,
    archivedAt: null,
  }
}

describe('coachingV2Matrix helpers', () => {
  it('shows last 5 focus columns by default when there are more', () => {
    const focuses = ['1', '2', '3', '4', '5', '6', '7'].map(focus)
    const visible = getVisibleFocusColumns(focuses, false, 5)
    expect(visible.map((item) => item.id)).toEqual(['3', '4', '5', '6', '7'])
  })

  it('shows all columns when showAll is true', () => {
    const focuses = ['1', '2', '3', '4', '5', '6'].map(focus)
    const visible = getVisibleFocusColumns(focuses, true, 5)
    expect(visible).toHaveLength(6)
  })

  it('validates coach guidelines completion', () => {
    expect(
      areCoachGuidelinesComplete({
        coachGuideline1: 'a',
        coachGuideline2: 'b',
        coachGuideline3: 'c',
      }),
    ).toBe(true)

    expect(
      areCoachGuidelinesComplete({
        coachGuideline1: 'a',
        coachGuideline2: ' ',
        coachGuideline3: 'c',
      }),
    ).toBe(false)
  })
})
