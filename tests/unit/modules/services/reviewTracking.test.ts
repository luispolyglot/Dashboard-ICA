import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase, evaluateAndUnlockAchievementsMock } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
  evaluateAndUnlockAchievementsMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

vi.mock('@/modules/services/achievements', () => ({
  evaluateAndUnlockAchievements: (...args: unknown[]) => evaluateAndUnlockAchievementsMock(...args),
}))

vi.mock('@/modules/utils', () => ({
  todayKey: () => '2026-05-21',
}))

import { recordReviewEvent } from '@/modules/services/reviewTracking'

describe('reviewTracking service', () => {
  beforeEach(() => {
    mockSupabase.auth.getSession.mockReset()
    mockSupabase.from.mockReset()
    mockSupabase.rpc.mockReset()
    evaluateAndUnlockAchievementsMock.mockReset()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-1',
          },
        },
      },
    })
  })

  it('registra una respuesta correcta mediante el evento servidor autoritativo', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null })

    await recordReviewEvent({
      previousCard: { id: 'card-1', interval: 1, easeFactor: 2.5, importance: 'frequent' } as any,
      nextCard: { id: 'card-1', interval: 2, easeFactor: 2.6 } as any,
      knew: true,
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('record_review_event', {
      p_lexicard_id: 'card-1',
      p_knew: true,
      p_response_time_ms: null,
    })
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-1')
  })

  it('registra una respuesta incorrecta sin enviar días ni deltas del cliente', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null })

    await recordReviewEvent({
      previousCard: { id: 'card-2', interval: 1, easeFactor: 2.5, importance: 'rare' } as any,
      nextCard: { id: 'card-2', interval: 1, easeFactor: 2.4 } as any,
      knew: false,
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('record_review_event', {
      p_lexicard_id: 'card-2',
      p_knew: false,
      p_response_time_ms: null,
    })
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-1')
  })
})
