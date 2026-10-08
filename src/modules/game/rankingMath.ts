import { getPregunticaMaxPoints } from '../hooks/useLeaderboardScoringWindow'
import type { LeaderboardEntry } from '../types'

// Cuentas del ranking del mes (sin React), para el ranking, las insignias y el resumen del mes.

const MAX_MONTHLY_POINTS = 10
const MAX_LISTENING_POINTS_PER_DAY = 0.1
const MAX_INSTAGRAM_POINTS_PER_DAY = 0.5
const MAX_ICA_TEST_POINTS = 1.2
const CLOSED_MONTH_DAYS = 28

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

export function rowName(row: LeaderboardEntry): string {
  return row.display_name || row.username || 'Usuario'
}

/** Puntos totales del mes (igual que el ranking). */
export function rowTotalPoints(row: LeaderboardEntry, includeIcaTest = true): number {
  const fromApi = num(row.total_points)
  if (fromApi > 0) return fromApi
  const monthly = Math.round(num(row.avg_percent)) * 0.1
  return (
    monthly +
    num(row.listening_points) +
    num(row.preguntica_points) +
    num(row.instagram_points) +
    (includeIcaTest ? num(row.ica_test_points) : 0)
  )
}

/**
 * Eficacia del mes: puntos conseguidos entre los puntos máximos posibles hasta ese día
 * (la "eficacia aplicada" del detalle de puntuación). `dayCap` = días que cuentan (máx. 28).
 */
export function monthEfficacy(row: LeaderboardEntry, dayCap: number): number {
  const days = Math.max(1, Math.min(CLOSED_MONTH_DAYS, Math.floor(dayCap)))
  const listeningDays = Math.max(
    1,
    Math.min(
      CLOSED_MONTH_DAYS,
      Math.max(
        Math.floor(num(row.listening_day_cap ?? days)),
        Math.ceil(num(row.listening_points) * 10),
      ),
    ),
  )
  const hasIcaTest = row.ica_test_points !== null && row.ica_test_points !== undefined
  const preguntica = num(row.preguntica_points)
  const max =
    MAX_MONTHLY_POINTS +
    listeningDays * MAX_LISTENING_POINTS_PER_DAY +
    getPregunticaMaxPoints(days, preguntica) +
    days * MAX_INSTAGRAM_POINTS_PER_DAY +
    (hasIcaTest ? MAX_ICA_TEST_POINTS : 0)
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((rowTotalPoints(row, hasIcaTest) / max) * 100)))
}

/** Eficacia de un mes CERRADO (28 días). */
export function closedMonthEfficacy(row: LeaderboardEntry): number {
  return monthEfficacy(row, CLOSED_MONTH_DAYS)
}
