import { LANG_CODES } from './constants'

export type PhraseSegment = {
  value: string
  isToken: boolean
}

function getLocaleFromLanguage(language: string): string {
  const normalized = language.trim()
  if (normalized in LANG_CODES) {
    return LANG_CODES[normalized]
  }

  return 'en-US'
}

function segmentWithIntl(text: string, locale: string): PhraseSegment[] | null {
  const SegmenterCtor = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
      ) => {
        segment: (input: string) => Iterable<{
          segment?: string
          isWordLike?: boolean
        }>
      }
    }
  ).Segmenter

  if (!SegmenterCtor) return null

  try {
    const segmenter = new SegmenterCtor(locale, { granularity: 'word' })
    const parts = Array.from(segmenter.segment(text))
    if (!parts.length) return null

    return parts
      .map((part) => ({
        value: String(part?.segment || ''),
        isToken: part?.isWordLike === true,
      }))
      .filter((part) => part.value.length > 0)
  } catch {
    return null
  }
}

function segmentWithFallback(text: string): PhraseSegment[] {
  const parts =
    text.match(/(\s+|[^\p{L}\p{N}\p{M}\s]+|[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*)/gu) ||
    [text]

  return parts.map((value) => ({
    value,
    isToken: /[\p{L}\p{N}]/u.test(value),
  }))
}

export function segmentPhraseText(text: string, language: string): PhraseSegment[] {
  const normalizedText = text.normalize('NFKC')
  if (!normalizedText.trim()) return []

  const locale = getLocaleFromLanguage(language)
  return segmentWithIntl(normalizedText, locale) || segmentWithFallback(normalizedText)
}

export function sanitizeTokenForLookup(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’]/g, "'")
    .replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
