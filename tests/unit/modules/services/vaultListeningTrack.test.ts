import { describe, expect, it } from 'vitest'

import { layoutTrack, segmentAt } from '@/modules/services/vaultListeningTrack'

describe('Escuchar mi Baúl ICA: one track', () => {
  it('puts each clip after the previous one plus the pause', () => {
    const { segments, duration } = layoutTrack([1, 2, 1, 1], 1.5)
    expect(segments.map((s) => [s.word, s.phase, s.start])).toEqual([
      [0, 'native', 0],
      [0, 'target', 2.5],
      [1, 'native', 6],
      [1, 'target', 8.5],
    ])
    expect(duration).toBe(11)
  })

  it('knows which word sounds at each moment (a pause belongs to the clip before)', () => {
    const { segments } = layoutTrack([1, 2, 1, 1], 1.5)
    expect(segmentAt(segments, 0.2)).toMatchObject({ word: 0, phase: 'native' })
    expect(segmentAt(segments, 5)).toMatchObject({ word: 0, phase: 'target' })
    expect(segmentAt(segments, 6.1)).toMatchObject({ word: 1, phase: 'native' })
  })
})
