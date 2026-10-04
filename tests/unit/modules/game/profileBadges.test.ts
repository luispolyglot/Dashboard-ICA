import { describe, expect, it } from 'vitest'
import { pickTopBadges } from '../../../../src/modules/game/profileBadges'

describe('pickTopBadges', () => {
  it('shows the 3 highest levels, catalog order on a tie', () => {
    const earned = { rachaICA: 2, rachaFlash: 5, ranking: 0, eficacia: 2, vocab: 6, desafios: 1 }
    expect(pickTopBadges(earned)).toEqual([
      { category: 'vocab', tier: 'leyenda1' },
      { category: 'rachaFlash', tier: 'diamante' },
      { category: 'rachaICA', tier: 'plata' },
    ])
  })

  it('returns fewer when fewer categories are earned', () => {
    const earned = { rachaICA: 1, rachaFlash: 0, ranking: 0, eficacia: 0, vocab: 0, desafios: 0 }
    expect(pickTopBadges(earned)).toEqual([{ category: 'rachaICA', tier: 'bronce' }])
  })
})
