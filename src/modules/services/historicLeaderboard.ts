import { supabase } from '@/lib/supabase'

type HistoricMonthRow = {
  period_start: string
  period_end: string
}

type HistoricSnapshotRow = {
  rank: number
  user_id: string
  score: number
  period_start: string
  period_end: string
  payload: Record<string, unknown> | null
}

export type HistoricLeaderboardMonth = {
  periodStart: string
  periodEnd: string
}

export type HistoricLeaderboardEntry = {
  rank: number
  userId: string
  score: number
  periodStart: string
  periodEnd: string
  username: string
  displayName: string
  icaStreakDays: number
  avgPercent: number
  reviewPercent: number
  creationPercent: number
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export async function fetchHistoricLeaderboardMonths(
  limit = 24,
): Promise<HistoricLeaderboardMonth[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('leaderboard_snapshots')
    .select('period_start, period_end')
    .eq('period', 'monthly')
    .eq('rank', 1)
    .order('period_start', { ascending: false })
    .limit(Math.max(limit, 1))

  if (error) throw error

  const rows = (data || []) as HistoricMonthRow[]
  return rows.map((row) => ({
    periodStart: row.period_start,
    periodEnd: row.period_end,
  }))
}

export async function fetchHistoricLeaderboardByMonth(
  periodStart: string,
  limit = 500,
): Promise<HistoricLeaderboardEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('leaderboard_snapshots')
    .select('rank, user_id, score, period_start, period_end, payload')
    .eq('period', 'monthly')
    .eq('period_start', periodStart)
    .order('rank', { ascending: true })
    .limit(Math.max(limit, 1))

  if (error) throw error

  const rows = (data || []) as HistoricSnapshotRow[]
  return rows.map((row) => {
    const payload = row.payload || {}
    const username = toText(payload.username, 'anon')
    const displayName = toText(payload.display_name, username || 'Usuario')

    return {
      rank: toNumber(row.rank, 0),
      userId: row.user_id,
      score: toNumber(row.score, 0),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      username,
      displayName,
      icaStreakDays: toNumber(payload.ica_streak_days, 0),
      avgPercent: toNumber(payload.avg_percent, 0),
      reviewPercent: toNumber(payload.review_percent, 0),
      creationPercent: toNumber(payload.creation_percent, 0),
    }
  })
}
