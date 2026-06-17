import { describe, expect, it } from 'vitest'
import {
  buildIcaTestWordPool,
  ICA_TEST_MAX_WORDS_PER_ITEM,
  ICA_TEST_REQUIRED_WORDS,
} from '@/modules/services/icaTests'
import type { Lexicard } from '@/modules/types'

function toTimestamp(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getTime()
}

function buildCard(id: string, target: string, native: string, isoDate: string): Lexicard {
  return {
    id,
    target,
    native,
    importance: 'frequent',
    interval: 1,
    easeFactor: 2.5,
    streak: 0,
    lastReviewed: null,
    createdAt: toTimestamp(isoDate),
  }
}

function countWords(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

describe('buildIcaTestWordPool', () => {
  it('uses short current/previous month cards first', () => {
    const cards: Lexicard[] = []

    for (let index = 0; index < 60; index += 1) {
      cards.push(
        buildCard(
          `short-current-${index}`,
          `word current ${index}`,
          `palabra actual ${index}`,
          '2026-06-12',
        ),
      )
    }

    for (let index = 0; index < 12; index += 1) {
      cards.push(
        buildCard(
          `long-current-${index}`,
          `this is a very long target ${index}`,
          `esto es una traduccion bastante larga ${index}`,
          '2026-06-12',
        ),
      )
    }

    const wordPool = buildIcaTestWordPool(cards, '2026-06-01')

    expect(wordPool.eligible).toBe(true)
    expect(wordPool.availableWords).toBe(ICA_TEST_REQUIRED_WORDS)
    expect(wordPool.fromCurrentMonth).toBe(60)
    expect(wordPool.fromPreviousMonth).toBe(0)
    expect(wordPool.fromOlderMonths).toBe(0)
    expect(wordPool.overWordLimit).toBe(0)
    expect(
      wordPool.pool.every(
        (card) =>
          countWords(card.target) <= ICA_TEST_MAX_WORDS_PER_ITEM &&
          countWords(card.native) <= ICA_TEST_MAX_WORDS_PER_ITEM,
      ),
    ).toBe(true)
  })

  it('falls back to older short cards before using long cards', () => {
    const cards: Lexicard[] = []

    for (let index = 0; index < 30; index += 1) {
      cards.push(
        buildCard(
          `short-current-${index}`,
          `short current ${index}`,
          `corta actual ${index}`,
          '2026-06-05',
        ),
      )
    }

    for (let index = 0; index < 20; index += 1) {
      cards.push(
        buildCard(
          `short-prev-${index}`,
          `short prev ${index}`,
          `corta previa ${index}`,
          '2026-05-08',
        ),
      )
    }

    for (let index = 0; index < 20; index += 1) {
      cards.push(
        buildCard(
          `short-older-${index}`,
          `short older ${index}`,
          `corta antigua ${index}`,
          '2026-03-10',
        ),
      )
    }

    for (let index = 0; index < 20; index += 1) {
      cards.push(
        buildCard(
          `long-current-${index}`,
          `this is a longer target phrase ${index}`,
          `esta es una traduccion larga ${index}`,
          '2026-06-09',
        ),
      )
    }

    const wordPool = buildIcaTestWordPool(cards, '2026-06-01')

    expect(wordPool.eligible).toBe(true)
    expect(wordPool.availableWords).toBe(ICA_TEST_REQUIRED_WORDS)
    expect(wordPool.fromCurrentMonth).toBe(30)
    expect(wordPool.fromPreviousMonth).toBe(20)
    expect(wordPool.fromOlderMonths).toBe(10)
    expect(wordPool.overWordLimit).toBe(0)
  })

  it('uses long cards only when short cards are not enough', () => {
    const cards: Lexicard[] = []

    for (let index = 0; index < 25; index += 1) {
      cards.push(
        buildCard(
          `short-current-${index}`,
          `short current ${index}`,
          `corta actual ${index}`,
          '2026-06-05',
        ),
      )
    }

    for (let index = 0; index < 20; index += 1) {
      cards.push(
        buildCard(
          `short-prev-${index}`,
          `short prev ${index}`,
          `corta previa ${index}`,
          '2026-05-12',
        ),
      )
    }

    for (let index = 0; index < 5; index += 1) {
      cards.push(
        buildCard(
          `short-older-${index}`,
          `short older ${index}`,
          `corta antigua ${index}`,
          '2026-02-01',
        ),
      )
    }

    for (let index = 0; index < 8; index += 1) {
      cards.push(
        buildCard(
          `long-current-${index}`,
          `this is a long target phrase ${index}`,
          `esto es una frase larga ${index}`,
          '2026-06-18',
        ),
      )
    }

    for (let index = 0; index < 8; index += 1) {
      cards.push(
        buildCard(
          `long-prev-${index}`,
          `this is another long target ${index}`,
          `esta es otra traduccion extensa ${index}`,
          '2026-05-18',
        ),
      )
    }

    const wordPool = buildIcaTestWordPool(cards, '2026-06-01')

    expect(wordPool.eligible).toBe(true)
    expect(wordPool.availableWords).toBe(ICA_TEST_REQUIRED_WORDS)
    expect(wordPool.fromCurrentMonth).toBe(33)
    expect(wordPool.fromPreviousMonth).toBe(22)
    expect(wordPool.fromOlderMonths).toBe(5)
    expect(wordPool.overWordLimit).toBe(10)
  })
})
