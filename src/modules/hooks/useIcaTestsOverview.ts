import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IcaTestRecord, Lexicard } from '../types'
import {
  buildIcaTestWordPool,
  getCurrentIcaTestMonthDate,
  getIcaTestMonthCode,
  isIcaTestLaunchDay,
  isIcaTestWindowOpen,
  isIcaTestsFeatureAvailable,
  listIcaTests,
  type IcaTestWordPoolResult,
} from '../services/icaTests'

type UseIcaTestsOverviewParams = {
  targetLang?: string
  nativeLang?: string
  cards: Lexicard[]
}

type UseIcaTestsOverviewResult = {
  tests: IcaTestRecord[]
  isLoading: boolean
  error: string | null
  currentMonthDate: string
  currentMonthCode: string
  hasCurrentMonthTest: boolean
  currentMonthTest: IcaTestRecord | null
  wordPool: IcaTestWordPoolResult
  featureAvailable: boolean
  windowOpen: boolean
  launchDay: boolean
  canTakeCurrentMonth: boolean
  canHighlightCurrentMonth: boolean
  refresh: () => Promise<void>
}

const EMPTY_WORD_POOL: IcaTestWordPoolResult = {
  pool: [],
  requiredWords: 60,
  availableWords: 0,
  fromCurrentMonth: 0,
  fromPreviousMonth: 0,
  fromOlderMonths: 0,
  overWordLimit: 0,
  eligible: false,
}

export function useIcaTestsOverview({
  targetLang,
  nativeLang,
  cards,
}: UseIcaTestsOverviewParams): UseIcaTestsOverviewResult {
  const [tests, setTests] = useState<IcaTestRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])
  const currentMonthDate = useMemo(() => getCurrentIcaTestMonthDate(now), [now])
  const currentMonthCode = useMemo(
    () => getIcaTestMonthCode(currentMonthDate),
    [currentMonthDate],
  )
  const featureAvailable = useMemo(() => isIcaTestsFeatureAvailable(now), [now])
  const windowOpen = useMemo(() => isIcaTestWindowOpen(now), [now])
  const launchDay = useMemo(() => isIcaTestLaunchDay(now), [now])

  const refresh = useCallback(async () => {
    if (!targetLang || !nativeLang) {
      setTests([])
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const data = await listIcaTests(targetLang, nativeLang)
      setTests(data)
    } catch {
      setError('No pudimos cargar los Tests ICA.')
    } finally {
      setIsLoading(false)
    }
  }, [nativeLang, targetLang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const currentMonthTest = useMemo(
    () => tests.find((test) => test.testMonth === currentMonthDate) ?? null,
    [currentMonthDate, tests],
  )

  const wordPool = useMemo(() => {
    if (!targetLang || !nativeLang) return EMPTY_WORD_POOL
    return buildIcaTestWordPool(cards, currentMonthDate)
  }, [cards, currentMonthDate, nativeLang, targetLang])

  const hasCurrentMonthTest = Boolean(currentMonthTest)
  const canTakeCurrentMonth =
    featureAvailable && windowOpen && !hasCurrentMonthTest && wordPool.eligible
  const canHighlightCurrentMonth =
    featureAvailable && windowOpen && !hasCurrentMonthTest

  return {
    tests,
    isLoading,
    error,
    currentMonthDate,
    currentMonthCode,
    hasCurrentMonthTest,
    currentMonthTest,
    wordPool,
    featureAvailable,
    windowOpen,
    launchDay,
    canTakeCurrentMonth,
    canHighlightCurrentMonth,
    refresh,
  }
}
