import { describe, expect, it } from 'vitest'
import { buildReviewRound } from '../../../src/modules/utils'
import type { ImportanceKey, Lexicard } from '../../../src/modules/types'

const DAY = 24 * 60 * 60 * 1000
const old = Date.now() - 30 * DAY

function card(id: string, importance: ImportanceKey, extra: Partial<Lexicard> = {}): Lexicard {
  return {
    id,
    target: id,
    native: id,
    importance,
    interval: 1,
    easeFactor: 2.5,
    streak: 0,
    lastReviewed: old,
    createdAt: old,
    ...extra,
  }
}

describe('buildReviewRound (modo aleatorio)', () => {
  it('da prioridad a las palabras de más frecuencia', () => {
    const cards: Lexicard[] = [
      ...Array.from({ length: 8 }, (_, i) => card(`rare-${i}`, 'rare')),
      ...Array.from({ length: 8 }, (_, i) => card(`irr-${i}`, 'irrelevant')),
      ...Array.from({ length: 6 }, (_, i) => card(`vital-${i}`, 'vital', { streak: 2 })),
      ...Array.from({ length: 4 }, (_, i) => card(`freq-${i}`, 'frequent')),
    ]
    const round = buildReviewRound(cards, 'mixed', 10, 0, cards.length)
    const highFrequency = round.filter((c) => c.importance === 'vital' || c.importance === 'frequent')
    expect(round).toHaveLength(10)
    expect(highFrequency.length).toBeGreaterThanOrEqual(8)
  })

  it('deja para el final las palabras recién añadidas si hay muchas', () => {
    const fresh = Array.from({ length: 5 }, (_, i) =>
      card(`fresh-${i}`, 'vital', { lastReviewed: null, createdAt: Date.now() }),
    )
    const rest = Array.from({ length: 20 }, (_, i) => card(`old-${i}`, 'frequent'))
    const round = buildReviewRound([...fresh, ...rest], 'mixed', 10, 0, 25)
    expect(round.some((c) => c.id.startsWith('fresh'))).toBe(false)
  })

  it('con pocas palabras sí usa las recién añadidas', () => {
    const fresh = Array.from({ length: 5 }, (_, i) =>
      card(`fresh-${i}`, 'vital', { lastReviewed: null, createdAt: Date.now() }),
    )
    const round = buildReviewRound(fresh, 'mixed', 10, 0, 5)
    expect(round).toHaveLength(5)
  })
})

describe('buildReviewRound: palabras potenciadas (Luis, 8 Oct)', () => {
  it('una palabra potenciada sale la primera, aunque sea nueva y haya muchas', () => {
    const cards: Lexicard[] = [
      ...Array.from({ length: 30 }, (_, i) => card(`vital-${i}`, 'vital')),
      card('boosted', 'vital', { lastReviewed: null, createdAt: Date.now(), boostFlash: 2 }),
    ]
    const round = buildReviewRound(cards, 'mixed', 10, 0, cards.length)
    expect(round[0].id).toBe('boosted')
  })
})
