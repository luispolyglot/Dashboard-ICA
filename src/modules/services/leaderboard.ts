import { supabase } from '../../lib/supabase'
import type { LeaderboardEntry } from '../types'

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

export async function fetchMonthlyStreakLeaderboard(limit = 12): Promise<LeaderboardEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase.rpc('get_monthly_streak_leaderboard_clean', {
    limit_count: limit,
  })

  if (error) {
    throw error
  }

  return (data || []) as LeaderboardEntry[]
}

export async function fetchMonthlySnapshotLeaderboard(
  periodStart: string,
  limit = 33,
): Promise<LeaderboardEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase.rpc('get_monthly_snapshot_leaderboard_clean', {
    p_period_start: periodStart,
    limit_count: limit,
  })

  if (error) {
    throw error
  }

  return (data || []) as LeaderboardEntry[]
}

export async function fetchTotalIcademers(): Promise<number> {
  if (!supabase) return 0

  const { data, error } = await supabase.rpc('get_total_icademers_clean')

  if (error) {
    throw error
  }

  return Number(data || 0)
}
