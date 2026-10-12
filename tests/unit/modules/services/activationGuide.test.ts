import { describe, expect, it } from 'vitest'
import { buildActivationPairs, splitByPunctuation } from '@/modules/services/activationGuide'

const phrase = {
  target: 'Jutro kupię chleb w piekarni, a potem spotkam się z przyjaciółmi.',
  native: 'Mañana voy a comprar pan en la panadería, y después quedaré con mis amigos.',
}

const chunks = [
  { target: 'Jutro kupię chleb', native: 'Mañana voy a comprar pan' },
  { target: 'w piekarni,', native: 'en la panadería,' },
  { target: 'a potem spotkam się', native: 'y después quedaré' },
  { target: 'z przyjaciółmi.', native: 'con mis amigos.' },
]

describe('buildActivationPairs', () => {
  it('uses the nota desafiante chunks when they are exactly the phrase', () => {
    const result = buildActivationPairs(phrase, chunks)
    expect(result.source).toBe('chunks')
    expect(result.pairs).toHaveLength(4)
    expect(result.pairs[0]).toEqual({ target: 'Jutro kupię chleb', native: 'Mañana voy a comprar pan' })
  })

  it('ignores chunks that leave a word out (never loses a piece mid-activation)', () => {
    const result = buildActivationPairs(phrase, chunks.slice(0, 3))
    expect(result.source).toBe('punctuation')
    expect(result.pairs.map((pair) => pair.target).join(' ')).toBe(phrase.target)
  })

  it('ignores chunks with a changed word or an empty side', () => {
    const changed = chunks.map((chunk, index) => (index === 0 ? { ...chunk, target: 'Jutro kupie chleb' } : chunk))
    expect(buildActivationPairs(phrase, changed).source).toBe('punctuation')
    const empty = chunks.map((chunk, index) => (index === 1 ? { ...chunk, native: ' ' } : chunk))
    expect(buildActivationPairs(phrase, empty).source).toBe('punctuation')
    expect(buildActivationPairs(phrase, 'nonsense').source).toBe('punctuation')
  })

  it('cuts at the punctuation when both sides have the same number of pieces', () => {
    const result = buildActivationPairs(phrase, null)
    expect(result.pairs).toEqual([
      { target: 'Jutro kupię chleb w piekarni,', native: 'Mañana voy a comprar pan en la panadería,' },
      { target: 'a potem spotkam się z przyjaciółmi.', native: 'y después quedaré con mis amigos.' },
    ])
  })

  it('falls back to the whole phrase when the pieces do not line up', () => {
    const result = buildActivationPairs(
      { target: 'Lubię kawę, herbatę i sok.', native: 'Me gusta el café, el té, y el zumo.' },
      null,
    )
    expect(result.source).toBe('whole')
    expect(result.pairs).toEqual([{ target: 'Lubię kawę, herbatę i sok.', native: 'Me gusta el café, el té, y el zumo.' }])
  })

  it('keeps a phrase without punctuation as one part', () => {
    expect(buildActivationPairs({ target: 'Dzień dobry', native: 'Buenos días' }, null).pairs).toHaveLength(1)
  })
})

describe('splitByPunctuation', () => {
  it('splits after punctuation followed by a space and drops empty pieces', () => {
    expect(splitByPunctuation('¿Vienes? Sí, claro.')).toEqual(['¿Vienes?', 'Sí,', 'claro.'])
    expect(splitByPunctuation('3,5 euros')).toEqual(['3,5 euros'])
    expect(splitByPunctuation('  ')).toEqual([])
  })
})
