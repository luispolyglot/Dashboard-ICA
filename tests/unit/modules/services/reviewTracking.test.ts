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

  it('records correct review and uses atomic RPC delta 1', async () => {
    const lexicardInsert = vi.fn().mockResolvedValue({ error: null })
    const xpInsert = vi.fn().mockResolvedValue({ error: null })
    const goalUpsert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'lexicard_reviews') return { insert: lexicardInsert }
      if (table === 'xp_events') return { insert: xpInsert }
      if (table === 'goal_completions') return { upsert: goalUpsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    mockSupabase.rpc.mockResolvedValue({
      data: {
        correct_reviews: 4,
        review_goal_completed: false,
      },
      error: null,
    })

    await recordReviewEvent({
      previousCard: { id: 'card-1', interval: 1, easeFactor: 2.5, importance: 'frequent' } as any,
      nextCard: { id: 'card-1', interval: 2, easeFactor: 2.6 } as any,
      knew: true,
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('bump_daily_review_metrics', {
      p_day: '2026-05-21',
      p_correct_delta: 1,
      p_xp_delta: 10,
    })
    expect(goalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ progress_value: 4, completed: false, goal_type: 'review_goal' }),
      { onConflict: 'user_id,day,goal_type' },
    )
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-1')
  })

  it('records wrong review and uses atomic RPC delta 0', async () => {
    const lexicardInsert = vi.fn().mockResolvedValue({ error: null })
    const xpInsert = vi.fn().mockResolvedValue({ error: null })
    const goalUpsert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'lexicard_reviews') return { insert: lexicardInsert }
      if (table === 'xp_events') return { insert: xpInsert }
      if (table === 'goal_completions') return { upsert: goalUpsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    mockSupabase.rpc.mockResolvedValue({
      data: {
        correct_reviews: 9,
        review_goal_completed: false,
      },
      error: null,
    })

    await recordReviewEvent({
      previousCard: { id: 'card-2', interval: 1, easeFactor: 2.5, importance: 'rare' } as any,
      nextCard: { id: 'card-2', interval: 1, easeFactor: 2.4 } as any,
      knew: false,
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('bump_daily_review_metrics', {
      p_day: '2026-05-21',
      p_correct_delta: 0,
      p_xp_delta: 2,
    })
    expect(xpInsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'review_incorrect', points: 2 }))
  })
})
