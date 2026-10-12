import { useMemo } from 'react'

export const LEADERBOARD_CUTOFF_DAY = 28
export const MAX_PREGUNTICA_POINTS = 8
const PREGUNTICA_POINTS_PER_WINDOW = 2
const PREGUNTICA_TOTAL_WINDOWS = 4

function clampScoringDay(value: number): number {
  return Math.min(Math.max(Math.floor(value), 1), LEADERBOARD_CUTOFF_DAY)
}

export function getScoringDayCap(
  selectedMonth: string,
  currentMonthStart: string,
  currentDay: number,
): number {
  if (selectedMonth === currentMonthStart) {
    return clampScoringDay(currentDay)
  }
  return LEADERBOARD_CUTOFF_DAY
}

/** Up to October 2026 PreguntICA weeks ran Friday to Thursday (same rule as the server). */
const PREGUNTICA_WEEK_START_DOW = 5

/** From this month on, the weeks are those of the month: 1-7, 8-14, 15-21, 22-28 (Luis, 9 Oct). */
const MONTH_WEEKS_FROM = '2026-11-01'

/**
 * How many PreguntICA weeks can score in this month by day `dayCap`.
 * - From November 2026: the weeks of the month that have begun (day 1, 8, 15, 22), so 4 at most.
 * - Up to October 2026: a week counted in the month whose ranking was open when it was finished,
 *   from day 29 of last month to day 28 of this one (Luis, 8 Oct), so every Friday week touching
 *   that stretch counts.
 * Capped at 4 weeks (8 points), like the server.
 */
export function getPregunticaWindowCount(monthStart: string, scoringDayCap: number): number {
  const safeDayCap = clampScoringDay(scoringDayCap)
  if (monthStart >= MONTH_WEEKS_FROM) {
    return Math.min(Math.ceil(safeDayCap / 7), PREGUNTICA_TOTAL_WINDOWS)
  }
  const [year, month] = monthStart.split('-').map(Number)
  const monthIndex = (month || 1) - 1
  // Day 29 of last month (in a February without day 29 this lands on the 1st of March).
  const from = new Date(year || 1970, monthIndex - 1, 29)
  const to = new Date(year || 1970, monthIndex, safeDayCap)
  let weeks = 1
  for (const day = new Date(from); day < to; ) {
    day.setDate(day.getDate() + 1)
    if (day.getDay() === PREGUNTICA_WEEK_START_DOW) weeks += 1
  }
  return Math.min(weeks, PREGUNTICA_TOTAL_WINDOWS)
}

/**
 * Most PreguntICA points anyone could have by `scoringDayCap` in that month. It depends only on
 * the calendar, never on the student's own points, so every icademer sees the same total
 * (Luis, 6 Oct: some saw 4/4 and others 2/2).
 */
export function getPregunticaMaxPoints(monthStart: string, scoringDayCap: number): number {
  return Math.min(
    getPregunticaWindowCount(monthStart, scoringDayCap) * PREGUNTICA_POINTS_PER_WINDOW,
    MAX_PREGUNTICA_POINTS,
  )
}

type UseLeaderboardScoringWindowInput = {
  selectedMonth: string
  currentMonthStart: string
  nowMs: number
}

export function useLeaderboardScoringWindow({
  selectedMonth,
  currentMonthStart,
  nowMs,
}: UseLeaderboardScoringWindowInput): {
  currentDay: number
  scoringDayCap: number
  pregunticaWindowCount: number
} {
  return useMemo(() => {
    const currentDay = new Date(nowMs).getDate()
    const scoringDayCap = getScoringDayCap(
      selectedMonth,
      currentMonthStart,
      currentDay,
    )
    return {
      currentDay,
      scoringDayCap,
      pregunticaWindowCount: getPregunticaWindowCount(selectedMonth, scoringDayCap),
    }
  }, [currentMonthStart, nowMs, selectedMonth])
}
