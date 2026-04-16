import { pinyin } from 'pinyin-pro'
import { transliterate } from 'transliteration'

type KuroshiroLike = {
  init: (analyzer: unknown) => Promise<void>
  convert: (
    input: string,
    options?: {
      to?: 'hiragana' | 'katakana' | 'romaji'
      mode?: 'normal' | 'spaced' | 'okurigana' | 'furigana'
      romajiSystem?: 'nippon' | 'passport' | 'hepburn'
    },
  ) => Promise<string>
}

const ROMANIZED_LANGUAGES = new Set([
  'Chino',
  'Japonés',
  'Coreano',
  'Tailandés',
  'Hindi',
  'Vietnamita',
])

let kuroshiroInstance: KuroshiroLike | null = null
let kuroshiroInitPromise: Promise<KuroshiroLike | null> | null = null

async function initKuroshiroWithDict(
  Kuroshiro: new () => KuroshiroLike,
  KuromojiAnalyzer: new (options?: { dictPath?: string }) => unknown,
  dictPath: string,
): Promise<KuroshiroLike | null> {
  try {
    const kuroshiro = new Kuroshiro()
    await kuroshiro.init(new KuromojiAnalyzer({ dictPath }))
    return kuroshiro
  } catch {
    return null
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function shouldRomanize(language: string): boolean {
  return ROMANIZED_LANGUAGES.has(language)
}

async function getKuroshiro(): Promise<KuroshiroLike | null> {
  if (kuroshiroInstance) return kuroshiroInstance
  if (kuroshiroInitPromise) return kuroshiroInitPromise

  kuroshiroInitPromise = (async () => {
    try {
      const [{ default: Kuroshiro }, { default: KuromojiAnalyzer }] = await Promise.all([
        import('kuroshiro'),
        import('kuroshiro-analyzer-kuromoji'),
      ])

      const fromCdn = await initKuroshiroWithDict(
        Kuroshiro as unknown as new () => KuroshiroLike,
        KuromojiAnalyzer as unknown as new (options?: { dictPath?: string }) => unknown,
        'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/',
      )
      if (fromCdn) {
        kuroshiroInstance = fromCdn
        return fromCdn
      }

      return null
    } catch {
      return null
    }
  })()

  return kuroshiroInitPromise
}

export async function getRomanization(text: string, language: string): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed || !shouldRomanize(language)) {
    return null
  }

  let candidate = ''

  if (language === 'Chino') {
    candidate = pinyin(trimmed, { toneType: 'symbol', v: true, type: 'array' }).join(' ')
  } else if (language === 'Japonés') {
    const kuroshiro = await getKuroshiro()
    if (!kuroshiro) return null
    candidate = await kuroshiro.convert(trimmed, {
      to: 'romaji',
      mode: 'spaced',
      romajiSystem: 'hepburn',
    })
  } else {
    candidate = transliterate(trimmed)
  }

  const romanized = normalize(candidate)
  if (!romanized || romanized === normalize(trimmed)) {
    return null
  }

  return candidate
}
