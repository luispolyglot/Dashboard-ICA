import { useCallback, useEffect, useState } from 'react'
import {
  fetchMonthlyReviewStatus,
  listMonthlyReviews,
  type MonthlyReviewResult,
  type MonthlyReviewStatus,
} from '../services/monthlyReview'

export type PastMonthlyReview = MonthlyReviewResult & { month: string; targetLang: string }

/**
 * Repaso del mes: what the server says about this month (window, words, result) and the student's
 * past Repasos. If the server cannot answer (for example the migration is not there yet), the status
 * stays null and the screens simply do not show the Repaso.
 */
export function useMonthlyReviewStatus({
  targetLang,
  nativeLang,
  enabled = true,
  withHistory = true,
}: {
  targetLang: string
  nativeLang: string
  /** False: ask nothing (for example outside the days of the Repaso). */
  enabled?: boolean
  withHistory?: boolean
}) {
  const [status, setStatus] = useState<MonthlyReviewStatus | null>(null)
  const [history, setHistory] = useState<PastMonthlyReview[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled || !targetLang || !nativeLang) {
      setStatus(null)
      setIsLoading(false)
      return
    }
    let active = true
    setIsLoading(true)
    void Promise.allSettled([
      fetchMonthlyReviewStatus(targetLang, nativeLang),
      withHistory ? listMonthlyReviews() : Promise.resolve([] as PastMonthlyReview[]),
    ]).then(([statusResult, historyResult]) => {
      if (!active) return
      setStatus(statusResult.status === 'fulfilled' ? statusResult.value : null)
      setHistory(historyResult.status === 'fulfilled' ? historyResult.value : [])
      setIsLoading(false)
    })
    return () => {
      active = false
    }
  }, [targetLang, nativeLang, enabled, withHistory, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  return { status, history, isLoading, reload }
}
