import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { fetchMonthlyStreakLeaderboard } from '../services/leaderboard'
import type { LeaderboardEntry } from '../types'

type UseMonthlyLeaderboardResult = {
  rows: LeaderboardEntry[]
  loading: boolean
  error: string | null
}

export function useMonthlyLeaderboard(limit = 200): UseMonthlyLeaderboardResult {
  const { user } = useAuth()
  const [rows, setRows] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchMonthlyStreakLeaderboard(limit)
      .then((data) => {
        if (!active) return
        setRows(data)
        setError(null)
      })
      .catch(() => {
        if (!active) return
        setError('No se pudo cargar el ranking mensual')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [limit])

  const visibleRows = useMemo(() => {
    const topTen = rows.slice(0, 10)
    const currentUserRow = rows.find((row) => row.user_id === user?.id)
    const alreadyTopTen = topTen.some((row) => row.user_id === currentUserRow?.user_id)

    if (!currentUserRow || alreadyTopTen) {
      return topTen
    }

    return [...topTen, currentUserRow]
  }, [rows, user?.id])

  return {
    rows: visibleRows,
    loading,
    error,
  }
}
