import { useCallback, useEffect, useState } from 'react'
import { CREATION_WORDS_GOAL } from '../constants'
import {
  loadMetaTrackerProfile,
  saveMetaTrackerProfile,
} from '../services/metaTracker'
import { loadData, saveData } from '../services/storage'
import { todayKey } from '../utils'
import type {
  AppConfig,
  CalendarTab,
  DailyProgressMap,
  Lexicard,
  MetaTrackerProfile,
  MetaTrackerStartLevel,
} from '../types'

function getMetaTrackerScopeKey(config: AppConfig): string {
  return `${config.nativeLang}::${config.targetLang}`
}

export function useDashboardICA() {
  const [cards, setCards] = useState<Lexicard[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLangModal, setShowLangModal] = useState(false)
  const [completedDays, setCompletedDays] = useState<string[]>([])
  const [creationDays, setCreationDays] = useState<string[]>([])
  const [dailyProgress, setDailyProgress] = useState<DailyProgressMap>({})
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarTab, setCalendarTab] = useState<CalendarTab>('creation')
  const [reviewSession, setReviewSession] = useState(0)
  const [metaTrackerByScope, setMetaTrackerByScope] = useState<
    Record<string, MetaTrackerProfile | null | undefined>
  >({})
  const [metaTrackerLoading, setMetaTrackerLoading] = useState(false)
  const [metaTrackerSaving, setMetaTrackerSaving] = useState(false)

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

  useEffect(() => {
    if (!config) {
      setMetaTrackerLoading(false)
      return
    }

    const scopeKey = getMetaTrackerScopeKey(config)
    if (metaTrackerByScope[scopeKey] !== undefined) {
      setMetaTrackerLoading(false)
      return
    }

    let active = true
    setMetaTrackerLoading(true)

    loadMetaTrackerProfile(config.targetLang, config.nativeLang)
      .then((profile) => {
        if (!active) return
        setMetaTrackerByScope((prev) => ({ ...prev, [scopeKey]: profile }))
      })
      .finally(() => {
        if (!active) return
        setMetaTrackerLoading(false)
      })

    return () => {
      active = false
    }
  }, [config, metaTrackerByScope])

  const saveMetaTracker = useCallback(
    async (params: {
      startLevel: MetaTrackerStartLevel
      priorIcaWords: number
    }): Promise<MetaTrackerProfile | null> => {
      if (!config) return null

      const scopeKey = getMetaTrackerScopeKey(config)
      setMetaTrackerSaving(true)
      try {
        const saved = await saveMetaTrackerProfile(config.targetLang, config.nativeLang, {
          startLevel: params.startLevel,
          priorIcaWords: params.priorIcaWords,
          confirmedAt: Date.now(),
        })
        setMetaTrackerByScope((prev) => ({ ...prev, [scopeKey]: saved }))
        return saved
      } finally {
        setMetaTrackerSaving(false)
      }
    },
    [config],
  )

  const setMetaTrackerActivationWordsTotal = useCallback(
    (activationWordsTotal: number): void => {
      if (!config) return
      const scopeKey = getMetaTrackerScopeKey(config)
      setMetaTrackerByScope((prev) => {
        const current = prev[scopeKey]
        if (!current) return prev
        if (current.activationWordsTotal === activationWordsTotal) return prev

        return {
          ...prev,
          [scopeKey]: {
            ...current,
            activationWordsTotal,
          },
        }
      })
    },
    [config],
  )

  const checkCreationStreak = async (updatedProgress: DailyProgressMap): Promise<void> => {
    const tk = todayKey()
    const todayProgress = updatedProgress[tk] || {
      wordsAdded: 0,
      phraseGenerated: false,
      reviewCorrect: 0,
    }
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
    if (!updated[tk]) {
      updated[tk] = { wordsAdded: 0, phraseGenerated: false, reviewCorrect: 0 }
    }
    updated[tk] = { ...updated[tk], wordsAdded: updated[tk].wordsAdded + 1 }
    setDailyProgress(updated)
    await saveData('dashboard-ICA-daily-progress', updated)
    await checkCreationStreak(updated)
    return updated[tk]
  }

  const handlePhraseGenerated = async () => {
    const tk = todayKey()
    const updated = { ...dailyProgress }
    if (!updated[tk]) {
      updated[tk] = { wordsAdded: 0, phraseGenerated: false, reviewCorrect: 0 }
    }
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

  const handleReviewAnswer = async (knew: boolean): Promise<void> => {
    if (!knew) return

    const tk = todayKey()
    const updated = { ...dailyProgress }
    if (!updated[tk]) {
      updated[tk] = { wordsAdded: 0, phraseGenerated: false, reviewCorrect: 0 }
    }

    updated[tk] = {
      ...updated[tk],
      reviewCorrect: updated[tk].reviewCorrect + 1,
    }

    setDailyProgress(updated)
    await saveData('dashboard-ICA-daily-progress', updated)
  }

  const startReviewSession = useCallback(async (): Promise<void> => {
    let next = 0
    setReviewSession((prev) => {
      next = prev + 1
      return next
    })
    await saveData('dashboard-ICA-review-session', next)
  }, [])

  const metaTrackerProfile = config
    ? metaTrackerByScope[getMetaTrackerScopeKey(config)] ?? null
    : null

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
    metaTrackerProfile,
    metaTrackerLoading,
    metaTrackerSaving,
    handleWordAdded,
    handlePhraseGenerated,
    handleReviewAnswer,
    handleSetup,
    handleConfigChange,
    saveMetaTracker,
    setMetaTrackerActivationWordsTotal,
    openCalendar,
    startReviewSession,
  }
}
