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

/** PreguntICA weeks run Friday to Thursday (same rule as the server). */
const PREGUNTICA_WEEK_START_DOW = 5

/**
 * How many PreguntICA weeks touch days 1..dayCap of the month. The week that is still open
 * on day 1 (it started in the previous month) counts too: completing it on that day scores
 * in this month. Capped at 4 weeks (8 points), like the server.
 */
export function getPregunticaWindowCount(monthStart: string, scoringDayCap: number): number {
  const safeDayCap = clampScoringDay(scoringDayCap)
  const [year, month] = monthStart.split('-').map(Number)
  const firstDow = new Date(year || 1970, (month || 1) - 1, 1).getDay()
  let weeks = 1
  for (let day = 2; day <= safeDayCap; day += 1) {
    if ((firstDow + day - 1) % 7 === PREGUNTICA_WEEK_START_DOW) weeks += 1
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
