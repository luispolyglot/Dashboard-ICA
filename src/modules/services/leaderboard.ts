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

  const { data, error } = await supabase.rpc('get_monthly_streak_leaderboard', {
    limit_count: limit,
  })

  if (error) {
    throw error
  }

  return (data || []) as LeaderboardEntry[]
}
