import { describe, expect, it } from 'vitest'
import { badgesToShow, pickTopBadges } from '../../../../src/modules/game/profileBadges'

describe('pickTopBadges', () => {
  it('shows the 3 highest levels, catalog order on a tie', () => {
    const earned = { rachaICA: 2, rachaFlash: 5, ranking: 0, eficacia: 2, vocab: 6, desafios: 1 }
    expect(pickTopBadges(earned)).toEqual([
      { category: 'vocab', tier: 'leyenda1' },
      { category: 'rachaFlash', tier: 'diamante' },
      { category: 'rachaICA', tier: 'plata' },
    ])
  })

  it('returns fewer only when fewer badges are earned', () => {
    const earned = { rachaICA: 1, rachaFlash: 0, ranking: 0, eficacia: 0, vocab: 0, desafios: 0 }
    expect(pickTopBadges(earned)).toEqual([{ category: 'rachaICA', tier: 'bronce' }])
  })

  it('fills up to 3 with lower levels when badges are in only two categories', () => {
    // 6 badges: 4 levels of ICA streak and 2 of vocabulary.
    const earned = { rachaICA: 4, rachaFlash: 0, ranking: 0, eficacia: 0, vocab: 2, desafios: 0 }
    expect(pickTopBadges(earned)).toEqual([
      { category: 'rachaICA', tier: 'rubi' },
      { category: 'vocab', tier: 'plata' },
      { category: 'rachaICA', tier: 'oro' },
    ])
  })
})

describe('badgesToShow', () => {
  const earned = { rachaICA: 4, rachaFlash: 0, ranking: 0, eficacia: 0, vocab: 2, desafios: 0 }

  it('shows the best 3 when nothing was chosen', () => {
    expect(badgesToShow([], earned)).toHaveLength(3)
    expect(badgesToShow(null, earned)).toHaveLength(3)
  })

  it('keeps the chosen ones first and fills the rest without repeating', () => {
    expect(badgesToShow([{ category: 'vocab', tier: 'plata' }], earned)).toEqual([
      { category: 'vocab', tier: 'plata' },
      { category: 'rachaICA', tier: 'rubi' },
      { category: 'rachaICA', tier: 'oro' },
    ])
  })
})
