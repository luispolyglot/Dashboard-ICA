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

import { loadData, saveData } from '@/modules/services/storage'

describe('storage service', () => {
  beforeEach(() => {
    mockSupabase.auth.getSession.mockReset()
    mockSupabase.from.mockReset()
    localStorage.clear()

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
      },
    })
  })

  it('persists dashboard review session in localStorage', async () => {
    await saveData('dashboard-ICA-review-session', 42)

    expect(localStorage.getItem('dashboard-ICA-review-session')).toBe('42')
    expect(mockSupabase.auth.getSession).not.toHaveBeenCalled()
  })
})
