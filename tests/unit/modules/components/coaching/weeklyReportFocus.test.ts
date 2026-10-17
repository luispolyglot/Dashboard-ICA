import { describe, expect, it } from 'vitest'
import { focusBaselineFromSnapshot, focusWeek } from '../../../../../src/modules/components/coaching/weeklyReportFocus'
import type { CoachingV2Focus } from '../../../../../src/modules/services/coaching'

function focus(title: string, phases: [boolean, boolean, boolean, boolean], completedAt: string | null = null): CoachingV2Focus {
  return {
    id: title,
    periodNumber: 3,
    focusTitle: title,
    focusComment: null,
    phaseExplained: phases[0],
    phaseTrained: phases[1],
    phaseUnderstoodExplained: phases[2],
    phaseUsed: phases[3],
    completedAt,
    archivedAt: null,
  } as CoachingV2Focus
}

describe('weekly report · focos de la semana', () => {
  const snapshot = [
    { id: 'old-1', focusTitle: 'Conectores', phaseExplained: true, phaseTrained: true, phaseUnderstoodExplained: false, phaseUsed: false },
    { id: 'old-2', focusTitle: 'Present perfect', phaseExplained: true, phaseTrained: true, phaseUnderstoodExplained: true, phaseUsed: false },
    'basura',
  ]

  it('tells apart what she already had and what she won this week', () => {
    const baseline = focusBaselineFromSnapshot(3, snapshot)
    const week = focusWeek(focus('conectores ', [true, true, true, false]), baseline)
    expect(week.states).toEqual(['before', 'before', 'gained', 'pending'])
    expect(week.gained).toBe(1)
    expect(week.masteredThisWeek).toBe(false)
  })

  it('celebrates a focus mastered this week', () => {
    const baseline = focusBaselineFromSnapshot(3, snapshot)
    const week = focusWeek(focus('Present perfect', [true, true, true, true], '2026-10-15T10:00:00Z'), baseline)
    expect(week.states).toEqual(['before', 'before', 'before', 'gained'])
    expect(week.masteredThisWeek).toBe(true)
  })

  it('a focus opened this week counts entirely as won', () => {
    const week = focusWeek(focus('Phrasal verbs', [true, false, false, false]), focusBaselineFromSnapshot(3, snapshot))
    expect(week.states).toEqual(['gained', 'pending', 'pending', 'pending'])
    expect(week.isNew).toBe(true)
  })

  it('week 1 starts from nothing; without the snapshot nothing is shown as won', () => {
    expect(focusBaselineFromSnapshot(1, null)).toEqual([])
    const unknown = focusBaselineFromSnapshot(4, null)
    expect(unknown).toBeNull()
    const week = focusWeek(focus('Conectores', [true, true, false, false]), unknown)
    expect(week.states).toEqual(['before', 'before', 'pending', 'pending'])
    expect(week.gained).toBe(0)
  })
})
