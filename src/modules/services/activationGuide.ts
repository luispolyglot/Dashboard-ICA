import type { PhraseChunk } from './challengeChunks'
import { getUiLang } from '@/i18n'

/**
 * ACTIVACIÓN GUIADA (Luis, 9 Oct): while you record, the phrase is shown in parts. Each part is a
 * pair: first you say it in your native language, then in the language you learn. A tap moves on.
 *
 * The parts come from the nota desafiante chunks when they match the phrase. If they do not (old
 * phrase, the split failed, the AI changed a word), the phrase is cut at its commas and full stops,
 * and if even that does not line up, the whole phrase is one single part. So an activation never
 * loses a piece of the phrase halfway through.
 */

export type ActivationPair = { native: string; target: string }

export type ActivationPairsSource = 'chunks' | 'punctuation' | 'whole'

export type ActivationPairs = { pairs: ActivationPair[]; source: ActivationPairsSource }

/** More parts than this and the guide stops helping: the phrase is cut by punctuation instead. */
const MAX_PAIRS = 8

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

function cleanPairs(value: unknown): ActivationPair[] | null {
  if (!Array.isArray(value) || !value.length) return null
  const pairs: ActivationPair[] = []
  for (const item of value) {
    const record = (item ?? {}) as Partial<PhraseChunk>
    const target = typeof record.target === 'string' ? squash(record.target) : ''
    const native = typeof record.native === 'string' ? squash(record.native) : ''
    if (!target || !native) return null
    pairs.push({ target, native })
  }
  return pairs
}

/**
 * Splits after a comma, semicolon, colon or end mark that is followed by a space
 * («Jutro kupię chleb, a potem…» → «Jutro kupię chleb,» + «a potem…»).
 */
export function splitByPunctuation(text: string): string[] {
  const clean = squash(text)
  if (!clean) return []
  return clean
    .split(/(?<=[,;:.!?。！？、，])\s+/u)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
}

export function buildActivationPairs(
  phrase: { target: string; native: string },
  chunks: unknown,
): ActivationPairs {
  const target = squash(phrase.target)
  const native = squash(phrase.native)

  // 1. The nota desafiante chunks, only if together they are exactly the phrase on screen.
  const fromChunks = cleanPairs(chunks)
  if (
    fromChunks &&
    fromChunks.length <= MAX_PAIRS &&
    squash(fromChunks.map((pair) => pair.target).join(' ')) === target
  ) {
    return { pairs: fromChunks, source: 'chunks' }
  }

  // 2. Same number of pieces on both sides when cut at the punctuation.
  const targetParts = splitByPunctuation(target)
  const nativeParts = splitByPunctuation(native)
  if (
    targetParts.length > 1 &&
    targetParts.length <= MAX_PAIRS &&
    targetParts.length === nativeParts.length
  ) {
    return {
      pairs: targetParts.map((part, index) => ({ target: part, native: nativeParts[index] })),
      source: 'punctuation',
    }
  }

  // 3. The whole phrase at once.
  return { pairs: [{ target, native }], source: 'whole' }
}

/** Inside a Spanish sentence a language goes in lower case («en polaco»). */
export function inSentence(name: string): string {
  return getUiLang() === 'es' ? name.toLocaleLowerCase('es') : name
}
