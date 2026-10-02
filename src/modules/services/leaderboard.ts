import { supabase } from '../../lib/supabase'
import type { LeaderboardEntry } from '../types'
import { peekQuick, quickFetch } from './quickCache'

// El ranking del mes se pide siempre con el mismo tamaño y se recorta: así todas las
// pantallas comparten la misma respuesta (y la última se enseña al momento).
const MONTH_FETCH_SIZE = 250

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function fetchWeeklyLeaderboard(limit = 12): Promise<LeaderboardEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase.rpc('get_weekly_leaderboard', {
    limit_count: limit,
  })

  if (error) {
    throw error
  }

  return (data || []) as LeaderboardEntry[]
}

async function requestMonthlyStreakLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase.rpc('get_monthly_streak_leaderboard', {
    limit_count: limit,
  })

  if (error) {
    throw error
  }

  return (data || []) as LeaderboardEntry[]
}

export async function fetchMonthlyStreakLeaderboard(limit = 12): Promise<LeaderboardEntry[]> {
  const size = Math.max(limit, MONTH_FETCH_SIZE)
  const rows = await quickFetch(
    `leaderboard-month:${currentMonthKey()}:${size}`,
    () => requestMonthlyStreakLeaderboard(size),
    { maxAgeMs: 1500 },
  )
  return rows.slice(0, limit)
}

/** Lo último que se cargó del ranking de este mes (para enseñarlo sin esperar), o undefined. */
export function peekMonthlyStreakLeaderboard(limit = 12): LeaderboardEntry[] | undefined {
  const size = Math.max(limit, MONTH_FETCH_SIZE)
  return peekQuick<LeaderboardEntry[]>(`leaderboard-month:${currentMonthKey()}:${size}`)?.slice(0, limit)
}

async function requestMonthlySnapshotLeaderboard(
  periodStart: string,
  limit: number,
): Promise<LeaderboardEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase.rpc('get_monthly_snapshot_leaderboard', {
    p_period_start: periodStart,
    limit_count: limit,
  })

  if (error) {
    throw error
  }

  return (data || []) as LeaderboardEntry[]
}

/** La foto de un mes cerrado no cambia: se guarda y la próxima vez sale al momento. */
export async function fetchMonthlySnapshotLeaderboard(
  periodStart: string,
  limit = 33,
): Promise<LeaderboardEntry[]> {
  const size = Math.max(limit, 400)
  const rows = await quickFetch(
    `leaderboard-snapshot:${periodStart}:${size}`,
    () => requestMonthlySnapshotLeaderboard(periodStart, size),
    { maxAgeMs: 10 * 60 * 1000 },
  )
  return rows.slice(0, limit)
}

export function peekMonthlySnapshotLeaderboard(periodStart: string, limit = 33): LeaderboardEntry[] | undefined {
  const size = Math.max(limit, 400)
  return peekQuick<LeaderboardEntry[]>(`leaderboard-snapshot:${periodStart}:${size}`)?.slice(0, limit)
}

export async function fetchTotalIcademers(): Promise<number> {
  return quickFetch(
    'total-icademers',
    async () => {
      if (!supabase) return 0
      const { data, error } = await supabase.rpc('get_total_icademers')
      if (error) {
        throw error
      }
      return Number(data || 0)
    },
    { maxAgeMs: 5 * 60 * 1000 },
  )
}

export function peekTotalIcademers(): number | undefined {
  return peekQuick<number>('total-icademers')
}
