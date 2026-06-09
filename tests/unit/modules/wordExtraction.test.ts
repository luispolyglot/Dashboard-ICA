import { describe, expect, it } from 'vitest'
import {
  extractWordsFromText,
  normalizeComparableText,
} from '@/modules/wordExtraction'

describe('wordExtraction utilities', () => {
  it('normalizes words for duplicate checks', () => {
    expect(normalizeComparableText('  Café  ')).toBe('café')
    expect(normalizeComparableText('ＮＥＷ')).toBe('new')
  })

  it('extracts words and removes punctuation duplicates', () => {
    const result = extractWordsFromText(
      'Hola, hola! Esto es una prueba rápida.',
      'Español',
    )

    expect(result.tokens).toEqual(['Hola', 'Esto', 'es', 'una', 'prueba', 'rápida'])
    expect(result.lowConfidence).toBe(false)
  })

  it('uses fallback segmentation and marks low confidence for Thai', () => {
    const originalSegmenter = (Intl as Intl & { Segmenter?: unknown }).Segmenter

    try {
      ;(Intl as Intl & { Segmenter?: unknown }).Segmenter = undefined

      const result = extractWordsFromText('ฉันกินข้าวที่บ้านทุกวัน', 'Tailandés')

      expect(result.tokens.length).toBeGreaterThan(0)
      expect(result.lowConfidence).toBe(true)
    } finally {
      ;(Intl as Intl & { Segmenter?: unknown }).Segmenter = originalSegmenter
    }
  })
})
