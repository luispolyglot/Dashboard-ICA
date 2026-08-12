import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadDataMock = vi.fn()
const saveDataMock = vi.fn()
const loadMetaTrackerProfileMock = vi.fn()
const saveMetaTrackerProfileMock = vi.fn()

vi.mock('@/modules/services/storage', () => ({
  loadData: (...args: unknown[]) => loadDataMock(...args),
  saveData: (...args: unknown[]) => saveDataMock(...args),
}))

vi.mock('@/modules/services/metaTracker', () => ({
  loadMetaTrackerProfile: (...args: unknown[]) => loadMetaTrackerProfileMock(...args),
  saveMetaTrackerProfile: (...args: unknown[]) => saveMetaTrackerProfileMock(...args),
}))

vi.mock('@/modules/utils', () => ({
  todayKey: () => '2026-05-21',
}))

import { useDashboardICA } from '@/modules/hooks/useDashboardICA'

describe('useDashboardICA', () => {
  beforeEach(() => {
    loadDataMock.mockReset()
    saveDataMock.mockReset()
    loadMetaTrackerProfileMock.mockReset()
    saveMetaTrackerProfileMock.mockReset()

    loadDataMock.mockImplementation(async (key: string, fallback: unknown) => {
      if (key === 'dashboard-ICA-words') return []
      if (key === 'dashboard-ICA-config') return { nativeLang: 'es', targetLang: 'en' }
      if (key === 'dashboard-ICA-completed') return []
      if (key === 'dashboard-ICA-creation-days') return ['2026-05-20']
      if (key === 'dashboard-ICA-daily-progress') {
        return {
          '2026-05-21': { wordsAdded: 1, phraseGenerated: false, reviewCorrect: 2 },
        }
      }
      if (key === 'dashboard-ICA-review-session') return 3
      return fallback
    })

    loadMetaTrackerProfileMock.mockResolvedValue(null)

    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: vi.fn(),
        onvoiceschanged: null,
      },
      configurable: true,
    })
  })

  it('loads initial state and updates local review counter only', async () => {
    const { result } = renderHook(() => useDashboardICA())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.reviewSession).toBe(3)
    expect(result.current.dailyProgress['2026-05-21']?.reviewCorrect).toBe(2)

    await act(async () => {
      await result.current.handleReviewAnswer(true)
    })

    expect(result.current.dailyProgress['2026-05-21']?.reviewCorrect).toBe(3)
    expect(saveDataMock).not.toHaveBeenCalledWith('dashboard-ICA-daily-progress', expect.anything())
  })

  it('reads daily progress from source after word/phrase events', async () => {
    const { result } = renderHook(() => useDashboardICA())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      const afterWord = await result.current.handleWordAdded()
      expect(afterWord.wordsAdded).toBe(1)
      expect(afterWord.phraseGenerated).toBe(false)
    })

    await act(async () => {
      const afterPhrase = await result.current.handlePhraseGenerated()
      expect(afterPhrase.wordsAdded).toBe(1)
      expect(afterPhrase.phraseGenerated).toBe(false)
    })

    expect(saveDataMock).not.toHaveBeenCalledWith('dashboard-ICA-daily-progress', expect.anything())
    expect(loadDataMock).toHaveBeenCalledWith('dashboard-ICA-creation-days', expect.any(Array))
  })

  it('persists review session counter explicitly', async () => {
    const { result } = renderHook(() => useDashboardICA())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.startReviewSession()
    })

    expect(saveDataMock).toHaveBeenCalledWith('dashboard-ICA-review-session', 4)
  })

  it('rehydrates config after focus when bootstrap returned null', async () => {
    const loadedConfig = { nativeLang: 'es', targetLang: 'en' }
    let allowConfigHydration = false

    loadDataMock.mockImplementation(async (key: string, fallback: unknown) => {
      if (key === 'dashboard-ICA-words') return []
      if (key === 'dashboard-ICA-config') {
        return allowConfigHydration ? loadedConfig : null
      }
      if (key === 'dashboard-ICA-completed') return []
      if (key === 'dashboard-ICA-creation-days') return []
      if (key === 'dashboard-ICA-daily-progress') return {}
      if (key === 'dashboard-ICA-review-session') return 0
      return fallback
    })

    const { result } = renderHook(() => useDashboardICA())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await waitFor(() => {
      expect(result.current.config).toBeNull()
    })

    await act(async () => {
      allowConfigHydration = true
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(result.current.config).toEqual(loadedConfig)
    })
  })

  it('refreshes streak arrays on focus after stale empty bootstrap', async () => {
    let hasFreshStreakData = false

    loadDataMock.mockImplementation(async (key: string, fallback: unknown) => {
      if (key === 'dashboard-ICA-words') return []
      if (key === 'dashboard-ICA-config') return { nativeLang: 'es', targetLang: 'en' }
      if (key === 'dashboard-ICA-completed') {
        return hasFreshStreakData ? ['2026-05-21'] : []
      }
      if (key === 'dashboard-ICA-creation-days') {
        return hasFreshStreakData ? ['2026-05-21'] : []
      }
      if (key === 'dashboard-ICA-daily-progress') return {}
      if (key === 'dashboard-ICA-review-session') return 0
      return fallback
    })

    const { result } = renderHook(() => useDashboardICA())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await waitFor(() => {
      expect(result.current.completedDays).toEqual([])
      expect(result.current.creationDays).toEqual([])
    })

    await act(async () => {
      hasFreshStreakData = true
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(result.current.completedDays).toEqual(['2026-05-21'])
      expect(result.current.creationDays).toEqual(['2026-05-21'])
    })
  })
})
