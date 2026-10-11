import { describe, expect, it } from 'vitest'
import { anthropicCostUsd, transcriptionCostUsd } from '../../../../../supabase/functions/_shared/ai-prices.ts'

describe('anthropicCostUsd', () => {
  it('Sonnet 5.5: 2 $ por millón de entrada y 10 $ de salida', () => {
    expect(anthropicCostUsd('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3, 6)
  })

  it('Sonnet 4, 4.5 y 4.6: 3 $ de entrada y 15 $ de salida', () => {
    for (const model of ['claude-sonnet-4-20250514', 'claude-sonnet-4-5', 'claude-sonnet-4-6']) {
      expect(anthropicCostUsd(model, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(18, 6)
    }
  })

  it('reconoce el modelo aunque lleve fecha al final', () => {
    expect(anthropicCostUsd('claude-haiku-4-5-20251001', { input_tokens: 1_000_000 })).toBeCloseTo(1, 6)
  })

  it('Haiku 5.5 cambia de precio por encima de 100.000 tokens de entrada', () => {
    expect(anthropicCostUsd('claude-haiku-5-5', { input_tokens: 100_000, output_tokens: 0 })).toBeCloseTo(0.01, 6)
    expect(anthropicCostUsd('claude-haiku-5-5', { input_tokens: 100_001, output_tokens: 0 })).toBeCloseTo(0.0500005, 6)
  })

  it('cuenta la caché a su precio', () => {
    expect(
      anthropicCostUsd('claude-sonnet-5-5', { input_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }),
    ).toBeCloseTo(2.6, 6)
  })

  it('un modelo desconocido o sin datos cuesta 0', () => {
    expect(anthropicCostUsd('otro-modelo', { input_tokens: 1000 })).toBe(0)
    expect(anthropicCostUsd('claude-sonnet-5-5', null)).toBe(0)
  })
})

describe('transcriptionCostUsd', () => {
  it('whisper-1: 0,006 $ por minuto', () => {
    expect(transcriptionCostUsd('whisper-1', 90)).toBeCloseTo(0.009, 6)
    expect(transcriptionCostUsd('whisper-1', 0)).toBe(0)
  })
})
