import { useEffect, useState } from 'react'
import { CREATION_WORDS_GOAL } from '../constants'
import { loadData, saveData } from '../services/storage'
import { todayKey } from '../utils'
import type {
  AppConfig,
  AppView,
  CalendarTab,
  DailyProgressMap,
  Lexicard,
} from '../types'

export function useDashboardICA() {
  const [view, setView] = useState<AppView>('home')
  const [cards, setCards] = useState<Lexicard[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLangModal, setShowLangModal] = useState(false)
  const [completedDays, setCompletedDays] = useState<string[]>([])
  const [creationDays, setCreationDays] = useState<string[]>([])
  const [dailyProgress, setDailyProgress] = useState<DailyProgressMap>({})
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarTab, setCalendarTab] = useState<CalendarTab>('review')

  useEffect(() => {
    Promise.all([
      loadData('dashboard-ICA-words', [] as Lexicard[]),
      loadData('dashboard-ICA-config', null as AppConfig | null),
      loadData('dashboard-ICA-completed', [] as string[]),
      loadData('dashboard-ICA-creation-days', [] as string[]),
      loadData('dashboard-ICA-daily-progress', {} as DailyProgressMap),
    ]).then(([loadedCards, loadedConfig, loadedCompletedDays, loadedCreationDays, loadedDailyProgress]) => {
      setCards(loadedCards)
      setConfig(loadedConfig)
      setCompletedDays(loadedCompletedDays || [])
      setCreationDays(loadedCreationDays || [])
      setDailyProgress(loadedDailyProgress || {})
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
  }

  const handlePhraseGenerated = async () => {
    const tk = todayKey()
    const updated = { ...dailyProgress }
    if (!updated[tk]) updated[tk] = { wordsAdded: 0, phraseGenerated: false }
    updated[tk] = { ...updated[tk], phraseGenerated: true }
    setDailyProgress(updated)
    await saveData('dashboard-ICA-daily-progress', updated)
    await checkCreationStreak(updated)
  }

  const handleSetup = async (nextConfig: AppConfig): Promise<void> => {
    setConfig(nextConfig)
    await saveData('dashboard-ICA-config', nextConfig)
  }

  const handleConfigChange = (nextConfig: AppConfig): void => {
    setConfig(nextConfig)
    saveData('dashboard-ICA-config', nextConfig)
  }

  const openCalendar = (tab: CalendarTab): void => {
    setCalendarTab(tab)
    setShowCalendar(true)
  }

  return {
    view,
    setView,
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
    handleWordAdded,
    handlePhraseGenerated,
    handleSetup,
    handleConfigChange,
    openCalendar,
  }
}
