import { useCallback, useEffect, useState } from 'react'
import { CREATION_WORDS_GOAL } from '../constants'
import { loadData, saveData } from '../services/storage'
import { todayKey } from '../utils'
import type {
  AppConfig,
  CalendarTab,
  DailyProgressMap,
  Lexicard,
} from '../types'

export function useDashboardICA() {
  const [cards, setCards] = useState<Lexicard[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLangModal, setShowLangModal] = useState(false)
  const [completedDays, setCompletedDays] = useState<string[]>([])
  const [creationDays, setCreationDays] = useState<string[]>([])
  const [dailyProgress, setDailyProgress] = useState<DailyProgressMap>({})
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarTab, setCalendarTab] = useState<CalendarTab>('review')
  const [reviewSession, setReviewSession] = useState(0)

  useEffect(() => {
    Promise.all([
      loadData('dashboard-ICA-words', [] as Lexicard[]),
      loadData('dashboard-ICA-config', null as AppConfig | null),
      loadData('dashboard-ICA-completed', [] as string[]),
      loadData('dashboard-ICA-creation-days', [] as string[]),
      loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap),
      loadData('dashboard-ICA-review-session', 0 as number),
    ]).then(([
      loadedCards,
      loadedConfig,
      loadedCompletedDays,
      loadedCreationDays,
      loadedDailyProgress,
      loadedReviewSession,
    ]) => {
      setCards(loadedCards)
      setConfig(loadedConfig)
      setCompletedDays(loadedCompletedDays || [])
      setCreationDays(loadedCreationDays || [])
      setDailyProgress(loadedDailyProgress || {})
      setReviewSession(typeof loadedReviewSession === 'number' ? loadedReviewSession : 0)
      setLoading(false)
    })

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  const checkCreationStreak = async (updatedProgress: DailyProgressMap): Promise<void> => {
    const tk = todayKey()
    const todayProgress = updatedProgress[tk] || { wordsAdded: 0, phraseGenerated: false }
    if (
      todayProgress.wordsAdded >= CREATION_WORDS_GOAL
      && todayProgress.phraseGenerated
      && !creationDays.includes(tk)
    ) {
      const nextDays = [...creationDays, tk]
      setCreationDays(nextDays)
      await saveData('dashboard-ICA-creation-days', nextDays)
    }
  }

  const handleWordAdded = async () => {
    const tk = todayKey()
    const updated = { ...dailyProgress }
    if (!updated[tk]) updated[tk] = { wordsAdded: 0, phraseGenerated: false }
    updated[tk] = { ...updated[tk], wordsAdded: updated[tk].wordsAdded + 1 }
    setDailyProgress(updated)
    await saveData('dashboard-ICA-daily-progress', updated)
    await checkCreationStreak(updated)
    return updated[tk]
  }

  const handlePhraseGenerated = async () => {
    const tk = todayKey()
    const updated = { ...dailyProgress }
    if (!updated[tk]) updated[tk] = { wordsAdded: 0, phraseGenerated: false }
    updated[tk] = { ...updated[tk], phraseGenerated: true }
    setDailyProgress(updated)
    await saveData('dashboard-ICA-daily-progress', updated)
    await checkCreationStreak(updated)
    return updated[tk]
  }

  const handleSetup = async (nextConfig: AppConfig): Promise<void> => {
    setConfig(nextConfig)
    await saveData('dashboard-ICA-config', nextConfig)
  }

  const handleConfigChange = (nextConfig: AppConfig): void => {
    setConfig(nextConfig)
    setCards([])
    void (async () => {
      await saveData('dashboard-ICA-config', nextConfig)
      const scopedCards = await loadData('dashboard-ICA-words', [] as Lexicard[])
      setCards(scopedCards)
    })()
  }

  const openCalendar = (tab: CalendarTab): void => {
    setCalendarTab(tab)
    setShowCalendar(true)
  }

  const startReviewSession = useCallback(async (): Promise<void> => {
    let next = 0
    setReviewSession((prev) => {
      next = prev + 1
      return next
    })
    await saveData('dashboard-ICA-review-session', next)
  }, [])

  return {
    cards,
    setCards,
    config,
    loading,
    showLangModal,
    setShowLangModal,
    completedDays,
    setCompletedDays,
    creationDays,
    dailyProgress,
    showCalendar,
    setShowCalendar,
    calendarTab,
    reviewSession,
    handleWordAdded,
    handlePhraseGenerated,
    handleSetup,
    handleConfigChange,
    openCalendar,
    startReviewSession,
  }
}
