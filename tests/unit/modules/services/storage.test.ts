import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

import { loadData, saveData, updateWord } from '@/modules/services/storage'

describe('storage service', () => {
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    clear: vi.fn(),
    removeItem: vi.fn(),
  }

  beforeEach(() => {
    mockSupabase.auth.getSession.mockReset()
    mockSupabase.from.mockReset()
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    localStorageMock.clear.mockReset()
    localStorageMock.removeItem.mockReset()

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    })
    window.localStorage.clear()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-3',
          },
        },
      },
    })
  })

  it('does not write daily_metrics snapshot for dashboard-ICA-daily-progress', async () => {
    await saveData('dashboard-ICA-daily-progress', {
      '2026-05-21': { wordsAdded: 9, phraseGenerated: true, reviewCorrect: 10 },
    })

    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('loads daily progress map from daily_metrics rows', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        {
          day: '2026-05-21',
          words_added: 2,
          phrase_generated: true,
          correct_reviews: 3,
        },
      ],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ eq })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'daily_metrics') return { select }
      throw new Error(`Unexpected table: ${table}`)
    })

    const data = await loadData('dashboard-ICA-daily-progress', {})

    expect(data).toEqual({
      '2026-05-21': {
        wordsAdded: 2,
        phraseGenerated: true,
        reviewCorrect: 3,
        voiceActivationsCount: 0,
      },
    })
  })

  it('persists dashboard review session in localStorage', async () => {
    await saveData('dashboard-ICA-review-session', 42)

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'dashboard-ICA-review-session',
      '42',
    )
    expect(mockSupabase.auth.getSession).not.toHaveBeenCalled()
  })

  it('does not send activation fields when updating lexicard', async () => {
    const eqId = vi.fn().mockResolvedValue({ error: null })
    const eqUser = vi.fn().mockReturnValue({ eq: eqId })
    const update = vi.fn().mockReturnValue({ eq: eqUser })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'lexicards') return { update }
      throw new Error(`Unexpected table: ${table}`)
    })

    await updateWord({
      id: 'card-1',
      target: 'hustle',
      native: 'ajetreo',
      importance: 'frequent',
      interval: 2,
      easeFactor: 2.6,
      streak: 1,
      createdAt: Date.now(),
      lastReviewed: Date.now(),
      targetLang: 'Inglés',
      nativeLang: 'Español',
      activationCount: 0,
      firstActivatedAt: null,
      lastActivatedAt: null,
    } as any)

    const patch = update.mock.calls[0]?.[0] || {}
    expect(patch.activation_count).toBeUndefined()
    expect(patch.first_activated_at).toBeUndefined()
    expect(patch.last_activated_at).toBeUndefined()
    expect(typeof patch.last_reviewed_at).toBe('string')
  })
})
