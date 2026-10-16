import { describe, expect, it } from 'vitest'
import { pickActivePool } from '@/modules/views/IcaChallengesView'

const now = new Date(2026, 9, 16, 10, 0)
const day = (offset: number) => {
  const d = new Date(2026, 9, 16 - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('pickActivePool (desafío aleatorio)', () => {
  it('prefers people active in the last 48 h', () => {
    const rows = [{ id: 'a', lastActiveDay: day(0) }, { id: 'b', lastActiveDay: day(1) }, { id: 'c', lastActiveDay: day(3) }]
    expect(pickActivePool(rows, now).map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('then 72 h, then 100 h, then anyone', () => {
    expect(pickActivePool([{ id: 'c', lastActiveDay: day(2) }, { id: 'd', lastActiveDay: day(4) }], now).map((r) => r.id)).toEqual(['c'])
    expect(pickActivePool([{ id: 'd', lastActiveDay: day(4) }, { id: 'e', lastActiveDay: day(9) }], now).map((r) => r.id)).toEqual(['d'])
    expect(pickActivePool([{ id: 'e', lastActiveDay: day(9) }, { id: 'f', lastActiveDay: null }], now).map((r) => r.id)).toEqual(['e', 'f'])
  })
  it('an older server without the day: everyone counts', () => {
    expect(pickActivePool([{ id: 'x' }, { id: 'y', lastActiveDay: day(9) }], now).map((r) => r.id)).toEqual(['x', 'y'])
  })
})
