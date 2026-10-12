import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  getPregunticaMaxPoints,
  getPregunticaWindowCount,
  getScoringDayCap,
  useLeaderboardScoringWindow,
} from '@/modules/hooks/useLeaderboardScoringWindow'

describe('useLeaderboardScoringWindow', () => {
  it('counts every week that can score by day 18', () => {
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
    // The week of 24 Jul (finished on 29-30 Jul it counts in August), the week of 31 Jul and the
    // weeks of 7 and 14 Aug.
    expect(result.current.pregunticaWindowCount).toBe(4)
    expect(getPregunticaMaxPoints('2026-08-01', result.current.scoringDayCap)).toBe(8)
  })

  it('caps current month scoring day at 28 after cutoff', () => {
    const dayCap = getScoringDayCap('2026-08-01', '2026-08-01', 31)

    expect(dayCap).toBe(28)
    expect(getPregunticaWindowCount('2026-08-01', dayCap)).toBe(4)
    expect(getPregunticaMaxPoints('2026-08-01', dayCap)).toBe(8)
  })

  it('keeps historic months fixed at full cutoff even if current day is early', () => {
    const dayCap = getScoringDayCap('2026-07-01', '2026-08-01', 2)

    expect(dayCap).toBe(28)
    expect(getPregunticaWindowCount('2026-07-01', dayCap)).toBe(4)
    expect(getPregunticaMaxPoints('2026-07-01', dayCap)).toBe(8)
  })

  it('gives everyone the same total, whatever they earned', () => {
    // October 2026 starts on a Thursday: the week that began on 25 Sep is still open on the
    // 1st, and a new one opens on Friday the 2nd, so by the 6th there are 2 weeks (4 points).
    expect(getPregunticaWindowCount('2026-10-01', 1)).toBe(1)
    expect(getPregunticaMaxPoints('2026-10-01', 1)).toBe(2)
    expect(getPregunticaMaxPoints('2026-10-01', 6)).toBe(4)
    expect(getPregunticaMaxPoints('2026-10-01', 9)).toBe(6)
    expect(getPregunticaMaxPoints('2026-10-01', 28)).toBe(8)
  })

  it('counts the week finished on days 29-31 of last month', () => {
    // May 2026 starts on a Friday: the week of 24 Apr (open on 29-30 Apr) and the one of 1 May.
    expect(getPregunticaWindowCount('2026-05-01', 7)).toBe(2)
    expect(getPregunticaWindowCount('2026-05-01', 8)).toBe(3)
    expect(getPregunticaMaxPoints('2026-05-01', 28)).toBe(8)
  })

  it('uses the weeks of the month from November 2026 (1-7, 8-14, 15-21, 22-28)', () => {
    expect(getPregunticaWindowCount('2026-11-01', 1)).toBe(1)
    expect(getPregunticaWindowCount('2026-11-01', 7)).toBe(1)
    expect(getPregunticaWindowCount('2026-11-01', 8)).toBe(2)
    expect(getPregunticaWindowCount('2026-11-01', 15)).toBe(3)
    expect(getPregunticaWindowCount('2026-11-01', 22)).toBe(4)
    expect(getPregunticaMaxPoints('2026-11-01', 28)).toBe(8)
    // February 2027 too: 4 weeks by day 28.
    expect(getPregunticaMaxPoints('2027-02-01', 28)).toBe(8)
    expect(getPregunticaWindowCount('2027-03-01', 5)).toBe(1)
  })
})
