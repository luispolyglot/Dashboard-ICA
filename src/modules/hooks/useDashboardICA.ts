import { useCallback, useEffect, useState } from 'react'
import {
  loadMetaTrackerProfile,
  saveMetaTrackerProfile,
} from '../services/metaTracker'
import {
  ACTIVATION_METRICS_CHANGED_EVENT,
  CREATION_METRICS_CHANGED_EVENT,
} from '../services/creationMetricsSync'
import {
  loadCreationStreakSaveState,
  saveCreationStreakDay as saveCreationStreakDayRpc,
} from '../services/creationStreakSaves'
import { loadData, saveData } from '../services/storage'
import { recordBootstrapDiagnostic } from '../utils/bootstrapDiagnostics'
import { todayKey } from '../utils'
import type {
  AppConfig,
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
  const [reviewSession, setReviewSession] = useState(0)
  const [savedCreationDays, setSavedCreationDays] = useState<string[]>([])
  const [creationSavesUsedThisMonth, setCreationSavesUsedThisMonth] = useState(0)
  const [creationSavesLimit, setCreationSavesLimit] = useState(3)
  const [metaTrackerByScope, setMetaTrackerByScope] = useState<
    Record<string, MetaTrackerProfile | null | undefined>
  >({})
  const [metaTrackerLoading, setMetaTrackerLoading] = useState(false)
  const [metaTrackerSaving, setMetaTrackerSaving] = useState(false)

  const refreshCreationProgressFromSource = useCallback(async (): Promise<void> => {
    const [sourceDays, sourceDailyProgress, saveState] = await Promise.all([
      loadData('dashboard-ICA-creation-days', [] as string[]),
      loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap),
      loadCreationStreakSaveState(),
    ])

    setCreationDays(sourceDays || [])
    setDailyProgress(sourceDailyProgress || {})
    setSavedCreationDays(saveState.savedDays)
    setCreationSavesUsedThisMonth(saveState.savesUsedThisMonth)
    setCreationSavesLimit(saveState.savesLimit)
  }, [])

  const refreshStreakProgressFromSource = useCallback(async (): Promise<void> => {
    const [sourceCompletedDays, sourceCreationDays, sourceDailyProgress, saveState] = await Promise.all([
      loadData('dashboard-ICA-completed', [] as string[]),
      loadData('dashboard-ICA-creation-days', [] as string[]),
      loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap),
      loadCreationStreakSaveState(),
    ])

    setCompletedDays(sourceCompletedDays || [])
    setCreationDays(sourceCreationDays || [])
    setDailyProgress(sourceDailyProgress || {})
    setSavedCreationDays(saveState.savedDays)
    setCreationSavesUsedThisMonth(saveState.savesUsedThisMonth)
    setCreationSavesLimit(saveState.savesLimit)
  }, [])

  const refreshActivationProgressFromSource = useCallback(async (): Promise<void> => {
    if (!config) return

    const scopeKey = getMetaTrackerScopeKey(config)
    const [scopedCards, profile] = await Promise.all([
      loadData('dashboard-ICA-words', [] as Lexicard[]),
      loadMetaTrackerProfile(config.targetLang, config.nativeLang),
    ])

    setCards(scopedCards || [])
    setMetaTrackerByScope((prev) => ({
      ...prev,
      [scopeKey]: profile,
    }))
  }, [config])

  useEffect(() => {
    Promise.all([
      loadData('dashboard-ICA-words', [] as Lexicard[]),
      loadData('dashboard-ICA-config', null as AppConfig | null),
      loadData('dashboard-ICA-completed', [] as string[]),
      loadData('dashboard-ICA-creation-days', [] as string[]),
      loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap),
      loadData('dashboard-ICA-review-session', 0 as number),
      loadCreationStreakSaveState(),
    ]).then(([
      loadedCards,
      loadedConfig,
      loadedCompletedDays,
      loadedCreationDays,
      loadedDailyProgress,
      loadedReviewSession,
      loadedSaveState,
    ]) => {
      setCards(loadedCards)
      setConfig(loadedConfig)
      setCompletedDays(loadedCompletedDays || [])
      setCreationDays(loadedCreationDays || [])
      setDailyProgress(loadedDailyProgress || {})
      setReviewSession(typeof loadedReviewSession === 'number' ? loadedReviewSession : 0)
      setSavedCreationDays(loadedSaveState.savedDays)
      setCreationSavesUsedThisMonth(loadedSaveState.savesUsedThisMonth)
      setCreationSavesLimit(loadedSaveState.savesLimit)
      recordBootstrapDiagnostic('dashboard.bootstrap_complete', {
        hasConfig: Boolean(loadedConfig),
        cardCount: (loadedCards || []).length,
        completedDaysCount: (loadedCompletedDays || []).length,
        creationDaysCount: (loadedCreationDays || []).length,
      })
      setLoading(false)
    }).catch(() => {
      setCards([])
      setConfig(null)
      setCompletedDays([])
      setCreationDays([])
      setDailyProgress({})
      setReviewSession(0)
      setSavedCreationDays([])
      setCreationSavesUsedThisMonth(0)
      setCreationSavesLimit(3)
      recordBootstrapDiagnostic('dashboard.bootstrap_failed')
      setLoading(false)
    })

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  useEffect(() => {
    if (loading || config) return

    let active = true

    const tryHydrateConfig = async (): Promise<void> => {
      const loadedConfig = await loadData('dashboard-ICA-config', null as AppConfig | null)
      if (!active || !loadedConfig) return
      setConfig(loadedConfig)
      recordBootstrapDiagnostic('dashboard.config_rehydrated')
    }

    void tryHydrateConfig()

    const onFocus = () => {
      void tryHydrateConfig()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tryHydrateConfig()
      }
    }

    const onOnline = () => {
      void tryHydrateConfig()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [config, loading])

  useEffect(() => {
    if (loading) return

    let active = true

    const tryRefreshStreaks = async (): Promise<void> => {
      const [sourceCompletedDays, sourceCreationDays, sourceDailyProgress, saveState] = await Promise.all([
        loadData('dashboard-ICA-completed', [] as string[]),
        loadData('dashboard-ICA-creation-days', [] as string[]),
        loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap),
        loadCreationStreakSaveState(),
      ])

      if (!active) return

      setCompletedDays(sourceCompletedDays || [])
      setCreationDays(sourceCreationDays || [])
      setDailyProgress(sourceDailyProgress || {})
      setSavedCreationDays(saveState.savedDays)
      setCreationSavesUsedThisMonth(saveState.savesUsedThisMonth)
      setCreationSavesLimit(saveState.savesLimit)
      recordBootstrapDiagnostic('dashboard.streaks_revalidated', {
        completedDaysCount: (sourceCompletedDays || []).length,
        creationDaysCount: (sourceCreationDays || []).length,
      })
    }

    if (completedDays.length === 0 && creationDays.length === 0) {
      void tryRefreshStreaks()
    }

    const onFocus = () => {
      void tryRefreshStreaks()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tryRefreshStreaks()
      }
    }

    const onOnline = () => {
      void tryRefreshStreaks()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [completedDays.length, creationDays.length, loading])

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

  const refreshCreationDaysFromSource = useCallback(async (): Promise<void> => {
    await refreshCreationProgressFromSource()
    await refreshStreakProgressFromSource()
  }, [refreshCreationProgressFromSource, refreshStreakProgressFromSource])

  useEffect(() => {
    const syncFromTruthSource = () => {
      void refreshStreakProgressFromSource()
    }

    window.addEventListener(CREATION_METRICS_CHANGED_EVENT, syncFromTruthSource)
    return () => {
      window.removeEventListener(CREATION_METRICS_CHANGED_EVENT, syncFromTruthSource)
    }
  }, [refreshStreakProgressFromSource])

  const saveCreationStreakDay = useCallback(async (day?: string): Promise<{ savedDay: string }> => {
    const saved = await saveCreationStreakDayRpc(day)
    await refreshStreakProgressFromSource()
    return { savedDay: saved.savedDay }
  }, [refreshStreakProgressFromSource])

  useEffect(() => {
    const syncActivationFromTruthSource = () => {
      void refreshActivationProgressFromSource()
    }

    window.addEventListener(ACTIVATION_METRICS_CHANGED_EVENT, syncActivationFromTruthSource)
    return () => {
      window.removeEventListener(ACTIVATION_METRICS_CHANGED_EVENT, syncActivationFromTruthSource)
    }
  }, [refreshActivationProgressFromSource])

  const handleWordAdded = async () => {
    await refreshCreationProgressFromSource()
    const tk = todayKey()
    return (await loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap))[tk] || {
      wordsAdded: 0,
      phraseGenerated: false,
      reviewCorrect: 0,
      voiceActivationsCount: 0,
    }
  }

  const handlePhraseGenerated = async () => {
    await refreshCreationProgressFromSource()
    const tk = todayKey()
    return (await loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap))[tk] || {
      wordsAdded: 0,
      phraseGenerated: false,
      reviewCorrect: 0,
      voiceActivationsCount: 0,
    }
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

  const handleReviewAnswer = async (knew: boolean): Promise<void> => {
    if (!knew) return

    const tk = todayKey()
    const updated = { ...dailyProgress }
    if (!updated[tk]) {
      updated[tk] = {
        wordsAdded: 0,
        phraseGenerated: false,
        reviewCorrect: 0,
        voiceActivationsCount: 0,
      }
    }

    updated[tk] = {
      ...updated[tk],
      reviewCorrect: updated[tk].reviewCorrect + 1,
    }

    setDailyProgress(updated)
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
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    dailyProgress,
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
    startReviewSession,
    refreshCreationDaysFromSource,
    saveCreationStreakDay,
  }
}
