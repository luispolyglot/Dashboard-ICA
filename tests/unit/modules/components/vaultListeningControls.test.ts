import { describe, expect, it } from 'vitest'
import { playbackRateAt, previousWordStart } from '@/modules/components/VaultListeningProvider'
import { layoutTrack } from '@/modules/services/vaultListeningTrack'

// Two words: native 1 s, pause 1.5 s, target 1 s, pause 1.5 s, …
// word 0: native 0–1, target 2.5–3.5 · word 1: native 5–6, target 7.5–8.5
const { segments } = layoutTrack([1, 1, 1, 1], 1.5)

describe('Escuchar mi Baúl: velocidad lenta solo en el idioma que aprendes', () => {
  it('tu idioma suena a velocidad normal', () => {
    expect(playbackRateAt(segments, 0.5, 0.5)).toBe(1)
    expect(playbackRateAt(segments, 5.5, 0.5)).toBe(1)
  })

  it('la pausa antes del idioma que aprendes y esa palabra van lentas', () => {
    expect(playbackRateAt(segments, 1.5, 0.5)).toBe(0.5)
    expect(playbackRateAt(segments, 3, 0.5)).toBe(0.5)
  })

  it('después de la palabra en el idioma que aprendes vuelve a la normal', () => {
    expect(playbackRateAt(segments, 4, 0.5)).toBe(1)
  })
})

describe('Escuchar mi Baúl: volver a la palabra anterior', () => {
  it('mientras suena tu idioma, va a la palabra anterior', () => {
    expect(previousWordStart(segments, 5.5)).toBe(0)
  })

  it('si ya sonó el idioma que aprendes, vuelve al principio de esa misma palabra', () => {
    expect(previousWordStart(segments, 8)).toBe(5)
    expect(previousWordStart(segments, 9)).toBe(5)
  })

  it('en la primera palabra se queda en el principio', () => {
    expect(previousWordStart(segments, 0.3)).toBe(0)
  })
})
