import { describe, expect, it } from 'vitest'
import { buildReviewRound, updateCardAfterReview } from '../../../src/modules/utils'
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

  it('una palabra fallada hace menos de 10 minutos no sale en la ronda siguiente', () => {
    const justFailed = card('niezaleznie-od', 'vital', { streak: 0, lastReviewed: Date.now() - 60 * 1000 })
    const others = Array.from({ length: 12 }, (_, i) => card(`rare-${i}`, 'rare', { streak: 2 }))
    const round = buildReviewRound([justFailed, ...others], 'mixed', 10, 5, 13)
    expect(round.map((c) => c.id)).not.toContain('niezaleznie-od')
  })

  it('pasados 10 minutos, la palabra fallada vuelve la primera', () => {
    const failed = card('niezaleznie-od', 'vital', { streak: 0, lastReviewed: Date.now() - 11 * 60 * 1000 })
    const others = Array.from({ length: 12 }, (_, i) => card(`rare-${i}`, 'rare', { streak: 2 }))
    const round = buildReviewRound([failed, ...others], 'mixed', 10, 5, 13)
    expect(round[0].id).toBe('niezaleznie-od')
  })

  it('si no hay ninguna otra palabra, la recién fallada sí sale', () => {
    const justFailed = card('sola', 'vital', { streak: 0, lastReviewed: Date.now() - 60 * 1000 })
    const round = buildReviewRound([justFailed], 'mixed', 10, 5, 1)
    expect(round.map((c) => c.id)).toEqual(['sola'])
  })

  describe('por fechas', () => {
    const now = Date.now()
    const due = (id: string, extra: Partial<Lexicard> = {}) =>
      card(id, 'frequent', { streak: 2, interval: 3, lastReviewed: now - 4 * DAY, ...extra })
    const notDue = (id: string, extra: Partial<Lexicard> = {}) =>
      card(id, 'frequent', { streak: 2, interval: 3, lastReviewed: now - DAY, ...extra })

    it('una palabra acertada hace un momento no vuelve si hay otras que tocan', () => {
      const justKnown = card('recien', 'vital', { streak: 1, interval: 1, lastReviewed: now - 60 * 1000 })
      const others = Array.from({ length: 12 }, (_, i) => due(`due-${i}`))
      const round = buildReviewRound([justKnown, ...others], 'mixed', 10, 3, 13)
      expect(round.map((c) => c.id)).not.toContain('recien')
    })

    it('las que tocan van antes que las que aún no tocan', () => {
      const cards = [notDue('pronto'), ...Array.from({ length: 3 }, (_, i) => due(`due-${i}`))]
      const round = buildReviewRound(cards, 'mixed', 10, 0, 4)
      expect(round.map((c) => c.id)).toEqual(['due-0', 'due-1', 'due-2', 'pronto'])
    })

    it('si no hay bastantes, rellena con las que tocan antes', () => {
      const later = notDue('dentro-de-2-dias', { lastReviewed: now - DAY })
      const sooner = notDue('manana', { lastReviewed: now - 2 * DAY + 60 * 1000 })
      const round = buildReviewRound([later, sooner, due('hoy')], 'mixed', 10, 0, 3)
      expect(round.map((c) => c.id)).toEqual(['hoy', 'manana', 'dentro-de-2-dias'])
    })

    it('una palabra dominada no se retira: vuelve cuando le toca', () => {
      const mastered = card('dominada', 'vital', { streak: 10, interval: 60, lastReviewed: now - 61 * DAY })
      const round = buildReviewRound([mastered, notDue('otra')], 'mixed', 10, 0, 2)
      expect(round[0].id).toBe('dominada')
    })
  })
})

describe('updateCardAfterReview: fechas (Luis, 12 Oct)', () => {
  it('acertando cuando toca: 1, 3, 8, 20, 50… días (×2,5 como mucho)', () => {
    let c = card('dom', 'vital', { lastReviewed: null })
    const intervals: number[] = []
    for (let i = 0; i < 6; i++) {
      // Each answer happens when the word is due.
      if (c.lastReviewed !== null) c = { ...c, lastReviewed: Date.now() - c.interval * DAY - 1000 }
      c = updateCardAfterReview(c, true, 0)
      intervals.push(c.interval)
    }
    expect(intervals).toEqual([1, 3, 8, 20, 50, 125])
    expect(c.easeFactor).toBe(2.5)
  })

  it('si sale antes de tiempo para rellenar la ronda, acertarla no adelanta su fecha', () => {
    const early = card('dom', 'vital', { streak: 1, interval: 1, lastReviewed: Date.now() - 60 * 1000 })
    const after = updateCardAfterReview(early, true, 0)
    expect(after.interval).toBe(1)
    expect(after.streak).toBe(2)
    expect(after.easeFactor).toBe(early.easeFactor)
  })

  it('el intervalo nunca pasa de 365 días', () => {
    const due = card('dom', 'vital', { streak: 8, interval: 300, easeFactor: 2.7, lastReviewed: Date.now() - 301 * DAY })
    expect(updateCardAfterReview(due, true, 0).interval).toBe(365)
  })

  it('fallarla la devuelve a 1 día y baja la facilidad', () => {
    const due = card('dom', 'vital', { streak: 4, interval: 20, lastReviewed: Date.now() - 21 * DAY })
    const after = updateCardAfterReview(due, false, 0)
    expect(after.interval).toBe(1)
    expect(after.streak).toBe(0)
    expect(after.easeFactor).toBeCloseTo(2.3)
  })
})
