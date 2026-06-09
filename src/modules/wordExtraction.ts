import { LANG_CODES } from './constants'

const NO_SPACE_LANGUAGE_CODES = new Set(['ja', 'zh', 'th', 'ko'])

export type ExtractWordsResult = {
  tokens: string[]
  usedIntlSegmenter: boolean
  lowConfidence: boolean
}

export function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function getLocaleFromLanguage(language: string): string {
  const normalized = language.trim()
  if (normalized in LANG_CODES) {
    return LANG_CODES[normalized]
  }

  return 'en-US'
}

function getLanguageCode(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() || 'en'
}

function isNoSpaceLanguage(language: string): boolean {
  const locale = getLocaleFromLanguage(language)
  return NO_SPACE_LANGUAGE_CODES.has(getLanguageCode(locale))
}

function cleanToken(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’]/g, "'")
    .replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isValidWordToken(value: string): boolean {
  if (!value) return false
  if (value.length > 50) return false
  if (!/[\p{L}\p{N}]/u.test(value)) return false
  if (/^\d+$/u.test(value)) return false
  return true
}

function segmentWithIntl(text: string, locale: string): string[] | null {
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
    return parts
      .filter((part) => part?.isWordLike !== false)
      .map((part) => String(part?.segment || ''))
  } catch {
    return null
  }
}

function segmentWithFallback(text: string): string[] {
  return (
    text.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Hangul}\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu,
    ) || []
  )
}

export function extractWordsFromText(
  text: string,
  targetLanguage: string,
): ExtractWordsResult {
  const normalizedText = text.normalize('NFKC').trim()
  if (!normalizedText) {
    return {
      tokens: [],
      usedIntlSegmenter: false,
      lowConfidence: false,
    }
  }

  const locale = getLocaleFromLanguage(targetLanguage)
  const fromIntl = segmentWithIntl(normalizedText, locale)
  const rawTokens = fromIntl ?? segmentWithFallback(normalizedText)
  const dedup = new Set<string>()
  const tokens: string[] = []

  for (const rawToken of rawTokens) {
    const token = cleanToken(rawToken)
    if (!isValidWordToken(token)) continue

    const normalizedToken = normalizeComparableText(token)
    if (!normalizedToken || dedup.has(normalizedToken)) continue

    dedup.add(normalizedToken)
    tokens.push(token)
  }

  return {
    tokens,
    usedIntlSegmenter: Boolean(fromIntl),
    lowConfidence: !fromIntl && isNoSpaceLanguage(targetLanguage),
  }
}
