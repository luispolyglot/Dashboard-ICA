import { describe, expect, it } from 'vitest'
import { pickPendingActivationPhrase } from '../../../../src/modules/services/pendingActivation'
import type { PhraseGenerationEntry, PhraseVoiceActivationEntry } from '../../../../src/modules/types'

const NOW = new Date('2026-10-02T12:00:00Z')

function phrase(id: string, createdAt: string, text: string | null = 'Oggi vado al mare'): PhraseGenerationEntry {
  return { id, source_words: [], generated_phrase: text, translation: null, model: null, created_at: createdAt }
}

const activation = { id: 'act' } as PhraseVoiceActivationEntry

describe('pickPendingActivationPhrase', () => {
  it('returns the newest phrase when it has no recording', () => {
    const items = [phrase('new', '2026-10-02T10:00:00Z'), phrase('old', '2026-10-01T10:00:00Z')]
    expect(pickPendingActivationPhrase(items, {}, NOW)?.id).toBe('new')
  })

  it('ignores a phrase from another day (e.g. after deleting today\'s)', () => {
    expect(pickPendingActivationPhrase([phrase('yesterday', '2026-10-01T10:00:00Z')], {}, NOW)).toBeNull()
  })

  it('ignores older phrases when the newest is already recorded', () => {
    const items = [phrase('new', '2026-10-02T10:00:00Z'), phrase('old', '2026-10-01T10:00:00Z')]
    expect(pickPendingActivationPhrase(items, { new: [activation] }, NOW)).toBeNull()
  })

  it('skips empty phrases and empty history', () => {
    expect(pickPendingActivationPhrase([phrase('blank', '2026-10-02T10:00:00Z', '  ')], {}, NOW)).toBeNull()
    expect(pickPendingActivationPhrase([], {}, NOW)).toBeNull()
  })
})
