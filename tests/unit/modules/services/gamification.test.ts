import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase, evaluateAndUnlockAchievementsMock, registerWordActivationsMock } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
  evaluateAndUnlockAchievementsMock: vi.fn(),
  registerWordActivationsMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

vi.mock('@/modules/services/achievements', () => ({
  evaluateAndUnlockAchievements: (...args: unknown[]) => evaluateAndUnlockAchievementsMock(...args),
}))

vi.mock('@/modules/services/metaTracker', () => ({
  registerWordActivations: (...args: unknown[]) => registerWordActivationsMock(...args),
}))

vi.mock('@/modules/utils', () => ({
  todayKey: () => '2026-05-21',
}))

import {
  recordPhraseGeneratedEvent,
  recordWordAddedEvent,
} from '@/modules/services/gamification'

describe('gamification service', () => {
  beforeEach(() => {
    mockSupabase.auth.getSession.mockReset()
    mockSupabase.from.mockReset()
    mockSupabase.rpc.mockReset()
    evaluateAndUnlockAchievementsMock.mockReset()
    registerWordActivationsMock.mockReset()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-2',
          },
        },
      },
    })
  })

  it('records word add using atomic creation RPC', async () => {
    const xpInsert = vi.fn().mockResolvedValue({ error: null })
    const goalUpsert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'xp_events') return { insert: xpInsert }
      if (table === 'goal_completions') return { upsert: goalUpsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    mockSupabase.rpc.mockResolvedValue({
      data: {
        words_added: 7,
        creation_goal_completed: true,
        xp_earned: 100,
      },
      error: null,
    })

    await recordWordAddedEvent({ wordsAdded: 7.9, phraseGenerated: true })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('bump_daily_creation_metrics', {
      p_day: '2026-05-21',
      p_words_added: 7,
      p_phrase_generated: true,
      p_xp_delta: 5,
    })
    expect(goalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ progress_value: 7, completed: true, goal_type: 'creation_goal' }),
      { onConflict: 'user_id,day,goal_type' },
    )
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-2')
  })

  it('retries activation registration in phrase flow and returns ids', async () => {
    const phraseSingle = vi.fn().mockResolvedValue({ data: { id: 'phrase-1' }, error: null })
    const phraseSelect = vi.fn().mockReturnValue({ single: phraseSingle })
    const phraseInsert = vi.fn().mockReturnValue({ select: phraseSelect })
    const xpInsert = vi.fn().mockResolvedValue({ error: null })
    const goalUpsert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'phrase_generations') return { insert: phraseInsert }
      if (table === 'xp_events') return { insert: xpInsert }
      if (table === 'goal_completions') return { upsert: goalUpsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    registerWordActivationsMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(8)

    mockSupabase.rpc.mockResolvedValue({
      data: {
        words_added: 5,
        creation_goal_completed: true,
        xp_earned: 220,
      },
      error: null,
    })

    const result = await recordPhraseGeneratedEvent({
      wordIds: ['card-1', 'card-2'],
      words: ['hello', 'world'],
      phrase: 'hello world',
      translation: 'hola mundo',
      wordsAdded: 5,
      targetLang: 'en',
      nativeLang: 'es',
      source: 'generated',
    })

    expect(registerWordActivationsMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ activationWordsTotal: 8, phraseGenerationId: 'phrase-1' })
    expect(mockSupabase.rpc).toHaveBeenCalledWith('bump_daily_creation_metrics', {
      p_day: '2026-05-21',
      p_words_added: 5,
      p_phrase_generated: true,
      p_xp_delta: 20,
    })
    expect(goalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ progress_value: 5, completed: true, goal_type: 'creation_goal' }),
      { onConflict: 'user_id,day,goal_type' },
    )
  })
})
