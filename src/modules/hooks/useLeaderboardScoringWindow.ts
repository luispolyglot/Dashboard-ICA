import { useMemo } from 'react'

export const LEADERBOARD_CUTOFF_DAY = 28
export const MAX_PREGUNTICA_POINTS = 8
const PREGUNTICA_POINTS_PER_WINDOW = 2
const PREGUNTICA_TOTAL_WINDOWS = 4
const PREGUNTICA_WINDOW_LENGTH_DAYS = 7

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

export function getPregunticaWindowCount(scoringDayCap: number): number {
  const safeDayCap = clampScoringDay(scoringDayCap)
  return Math.min(
    Math.ceil(safeDayCap / PREGUNTICA_WINDOW_LENGTH_DAYS),
    PREGUNTICA_TOTAL_WINDOWS,
  )
}

export function getPregunticaMaxPoints(
  scoringDayCap: number,
  currentPoints: number,
): number {
  const windowBasedMax = Math.min(
    getPregunticaWindowCount(scoringDayCap) * PREGUNTICA_POINTS_PER_WINDOW,
    MAX_PREGUNTICA_POINTS,
  )

  return Math.min(MAX_PREGUNTICA_POINTS, Math.max(windowBasedMax, currentPoints))
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
      pregunticaWindowCount: getPregunticaWindowCount(scoringDayCap),
    }
  }, [currentMonthStart, nowMs, selectedMonth])
}
