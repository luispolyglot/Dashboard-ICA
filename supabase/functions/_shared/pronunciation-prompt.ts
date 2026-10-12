// Prompt de la pronunciación figurada (acción «pronunciation» de anthropic-proxy).
//
// La IA devuelve una lista JSON en el mismo orden que las palabras (["bocú", "merssí"]): así no
// repite las palabras (respuesta más corta, que no se corta) y no depende de que copie bien
// cada palabra con sus tildes. Si aun así contesta con un objeto o se corta, se aprovecha lo
// que haya llegado.

export const PRONUNCIATION_MAX_WORDS = 20

/** Tokens de respuesta: holgado, para que la lista nunca se quede a medias. */
export function pronunciationMaxTokens(wordCount: number): number {
  return 120 + wordCount * 50
}

export function buildPronunciationPrompt(words: string[], targetLang: string, nativeLang: string): { system: string; prompt: string } {
  const isSpanish = nativeLang.trim().toLowerCase() === 'español'
  const style = isSpanish
    ? [
        'Write how each word SOUNDS using SPANISH spelling, so a Spanish speaker who reads your respelling with Spanish rules sounds right.',
        'Never copy the original spelling when Spanish would read it differently: every letter you write is read the Spanish way (j = Spanish jota, ll/y = y, ñ = ñ, h is silent, z is not used for an s sound).',
        'Use "sh" for the sh sound, "ch" for ch, "v" only for a real v sound, "ts" for ts, "ü" only for French u / German ü (say "iu" if unsure).',
        'Write only the sounds that are pronounced (drop silent letters) and devoice final consonants when the language does it.',
        'Mark the stressed syllable with a Spanish written accent only when Spanish rules would need it.',
        'Examples: beaucoup → bocú, merci → mersí, thank you → zenkiú, water → uóter, Schweinsteiger → shváinshtaiguer, ich → ij, buongiorno → buonyorno, postawiłem → postavíuem, sposób → spósup, dziękuję → yenkuye.',
        'No IPA symbols, no hyphens, lowercase.',
      ]
    : [
        `Write how each word sounds using simple ${nativeLang} spelling (a respelling, no IPA), so a ${nativeLang} speaker can read it aloud.`,
        'Put the stressed syllable in CAPITALS (beaucoup → boh-KOO). Use hyphens between syllables.',
      ]
  return {
    system: 'You write short pronunciation respellings for language learners. Reply ONLY with a JSON array of strings. No markdown, no backticks, no comments.',
    prompt: [
      `Language of the words: ${targetLang}.`,
      ...style,
      'If an item is a multi-word expression, respell the whole expression.',
      `Items (${words.length}):`,
      ...words.map((word, index) => `${index + 1}. ${word}`),
      `Reply ONLY with a JSON array of exactly ${words.length} strings: the respelling of each item, in the same order, without slashes.`,
    ].join('\n'),
  }
}

const normalizeKey = (value: string) =>
  value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Lee la respuesta de la IA. Devuelve { palabra: "bocú" } solo con lo que sea texto corto. */
export function parsePronunciationReply(text: string, words: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const accept = (word: string, value: unknown) => {
    if (typeof value !== 'string') return
    const clean = value.trim().replace(/^\/+|\/+$/g, '').trim()
    if (clean && clean.length <= 80) out[word] = clean
  }

  const arrayStart = text.indexOf('[')
  const objectStart = text.indexOf('{')
  const useArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)
  const start = useArray ? arrayStart : objectStart
  if (start < 0) return out
  const end = text.lastIndexOf(useArray ? ']' : '}')

  let parsed: unknown = null
  if (end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      parsed = null
    }
  }

  if (Array.isArray(parsed)) {
    words.forEach((word, index) => accept(word, parsed[index]))
    return out
  }
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    const byKey = new Map(Object.entries(record).map(([key, value]) => [normalizeKey(key), value]))
    const values = Object.values(record)
    words.forEach((word, index) =>
      accept(word, record[word] ?? byKey.get(normalizeKey(word)) ?? (values.length === words.length ? values[index] : undefined)),
    )
    return out
  }

  // Respuesta cortada: se aprovechan las cadenas completas que llegaron, en orden.
  if (useArray) {
    const items = text.slice(start).match(/"(?:[^"\\]|\\.)*"/g) || []
    items.slice(0, words.length).forEach((item, index) => {
      try {
        accept(words[index], JSON.parse(item))
      } catch {
        // Cadena rota: se ignora.
      }
    })
  }
  return out
}
