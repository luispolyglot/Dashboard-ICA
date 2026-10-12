import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { pickListeningQueue } from '@/modules/services/vaultListening'
import type { Lexicard } from '@/modules/types'

const card = (id: string, target = `t${id}`, native = `n${id}`): Lexicard => ({
  id,
  target,
  native,
  importance: 'frequent',
  interval: 1,
  easeFactor: 2.5,
  streak: 0,
  lastReviewed: null,
  createdAt: 0,
})

describe('pickListeningQueue (Escuchar mi Baúl ICA)', () => {
  const cards = [card('1'), card('2'), card('3'), card('4')]

  it('keeps the list order and takes as many as chosen', () => {
    expect(pickListeningQueue(cards, { count: 2, onlyUnheard: false, heardIds: new Set() }).map((c) => c.id)).toEqual(['1', '2'])
  })

  it('«Sin escuchar aún» leaves out the words already heard', () => {
    const heard = new Set(['1', '3'])
    expect(pickListeningQueue(cards, { count: 10, onlyUnheard: true, heardIds: heard }).map((c) => c.id)).toEqual(['2', '4'])
  })

  it('skips words without text in one of the two languages', () => {
    expect(pickListeningQueue([card('1', ' '), card('2')], { count: 10, onlyUnheard: false, heardIds: new Set() }).map((c) => c.id)).toEqual(['2'])
  })
})

describe('pickListeningQueue random order', () => {
  it('picks from the whole filter, not only the top of the list', () => {
    const cards = Array.from({ length: 50 }, (_, index) => ({
      id: `c${index}`,
      target: `t${index}`,
      native: `n${index}`,
    })) as unknown as Parameters<typeof pickListeningQueue>[0]
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const picked = pickListeningQueue(cards, { count: 10, onlyUnheard: false, heardIds: new Set(), order: 'random', random })
    expect(picked).toHaveLength(10)
    expect(new Set(picked.map((card) => card.id)).size).toBe(10)
    expect(picked.some((card) => Number(card.id.slice(1)) >= 10)).toBe(true)
  })
})
