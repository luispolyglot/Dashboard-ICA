import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  getPregunticaMaxPoints,
  getPregunticaWindowCount,
  getScoringDayCap,
  useLeaderboardScoringWindow,
} from '@/modules/hooks/useLeaderboardScoringWindow'

describe('useLeaderboardScoringWindow', () => {
  it('uses the third monthly window on day 18 (4/6 behavior)', () => {
    const nowMs = new Date(2026, 7, 18, 12, 0, 0).getTime()
    const { result } = renderHook(() =>
      useLeaderboardScoringWindow({
        selectedMonth: '2026-08-01',
        currentMonthStart: '2026-08-01',
        nowMs,
      }),
    )

    expect(result.current.currentDay).toBe(18)
    expect(result.current.scoringDayCap).toBe(18)
    expect(result.current.pregunticaWindowCount).toBe(3)
    expect(getPregunticaMaxPoints(result.current.scoringDayCap, 4)).toBe(6)
  })

  it('caps current month scoring day at 28 after cutoff', () => {
    const dayCap = getScoringDayCap('2026-08-01', '2026-08-01', 31)

    expect(dayCap).toBe(28)
    expect(getPregunticaWindowCount(dayCap)).toBe(4)
    expect(getPregunticaMaxPoints(dayCap, 7)).toBe(8)
  })

  it('keeps historic months fixed at full cutoff even if current day is early', () => {
    const dayCap = getScoringDayCap('2026-07-01', '2026-08-01', 2)

    expect(dayCap).toBe(28)
    expect(getPregunticaWindowCount(dayCap)).toBe(4)
    expect(getPregunticaMaxPoints(dayCap, 4)).toBe(8)
  })

  it('never lowers max below earned points and never exceeds 8', () => {
    expect(getPregunticaMaxPoints(7, 4)).toBe(4)
    expect(getPregunticaMaxPoints(28, 9)).toBe(8)
  })
})
