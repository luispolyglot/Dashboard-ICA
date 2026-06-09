import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSupabase, evaluateAndUnlockAchievementsMock, registerWordActivationsMock } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
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
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockSupabase.auth.getSession.mockReset()
    mockSupabase.from.mockReset()
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

  it('records word add XP event and achievements', async () => {
    const xpInsert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'xp_events') return { insert: xpInsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    await recordWordAddedEvent()

    expect(xpInsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      source: 'word_added',
      points: 5,
      metadata: { day: '2026-05-21' },
    })
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-2')
  })

  it('retries activation registration in phrase flow and returns ids', async () => {
    const phraseSingle = vi.fn().mockResolvedValue({ data: { id: 'phrase-1' }, error: null })
    const phraseSelect = vi.fn().mockReturnValue({ single: phraseSingle })
    const phraseInsert = vi.fn().mockReturnValue({ select: phraseSelect })
    const xpInsert = vi.fn().mockResolvedValue({ error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'phrase_generations') return { insert: phraseInsert }
      if (table === 'xp_events') return { insert: xpInsert }
      throw new Error(`Unexpected table: ${table}`)
    })

    registerWordActivationsMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(8)

    const result = await recordPhraseGeneratedEvent({
      wordIds: ['card-1', 'card-2'],
      words: ['hello', 'world'],
      phrase: 'hello world',
      translation: 'hola mundo',
      targetLang: 'en',
      nativeLang: 'es',
      source: 'generated',
    })

    expect(registerWordActivationsMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ activationWordsTotal: 8, phraseGenerationId: 'phrase-1' })
    expect(xpInsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      source: 'phrase_generated',
      points: 20,
      metadata: {
        day: '2026-05-21',
        word_count: 2,
        activation_words_total: 8,
        phrase_source: 'generated',
      },
    })
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-2')
  })

  it('keeps phrase id available when gamification writes fail', async () => {
    const phraseSingle = vi.fn().mockResolvedValue({ data: { id: 'phrase-2' }, error: null })
    const phraseSelect = vi.fn().mockReturnValue({ single: phraseSingle })
    const phraseInsert = vi.fn().mockReturnValue({ select: phraseSelect })
    const xpInsert = vi.fn().mockResolvedValue({ error: { message: 'forbidden' } })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'phrase_generations') return { insert: phraseInsert }
      if (table === 'xp_events') return { insert: xpInsert }
      if (table === 'goal_completions') return { upsert: vi.fn() }
      throw new Error(`Unexpected table: ${table}`)
    })

    registerWordActivationsMock.mockResolvedValue(3)

    const result = await recordPhraseGeneratedEvent({
      wordIds: ['card-1'],
      words: ['hello'],
      phrase: 'hello there',
      translation: 'hola',
      targetLang: 'en',
      nativeLang: 'es',
      source: 'generated',
    })

    expect(result).toEqual({ activationWordsTotal: 3, phraseGenerationId: 'phrase-2' })
    expect(evaluateAndUnlockAchievementsMock).toHaveBeenCalledWith('user-2')
  })
})
