/**
 * DESAFÍOS ICA — motor del juego (sin base de datos ni red: solo lógica).
 *
 * Aquí se decide:
 *  - qué palabras ICA sirven para cada modo y cómo se eligen (también la mezcla 5 + 5
 *    de los dos baúles),
 *  - cómo se construye cada pregunta (lo que ve el alumno y la solución, por separado),
 *  - cómo se corrige cada respuesta (escrita, hablada, elegida o unida en Parejas),
 *  - el mínimo de palabras en el baúl para entrar en los retos,
 *  - el nivel real de cada alumno (el de la barra de progreso) y la distancia entre dos niveles,
 *  - las reglas de tiempo, rondas y turnos.
 *
 * Lo usa la función ica-challenges-center y lo prueban los tests de
 * tests/unit/supabase/functions/ica-challenges-center.
 */
import {
  DEFAULT_LEVEL_FAMILY,
  LANG_TO_FAMILY,
  LEVEL_KEYS,
  LEVEL_THRESHOLDS_BY_FAMILY,
  type LevelKey,
} from '../../../src/shared/ica-leveling.ts'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type QuestionKind = 'choice' | 'write' | 'speak' | 'listen' | 'cloze' | 'pairs'
export type ChallengeFormat = 'turns' | 'lightning'
export type WordSource = 'own' | 'mixed'

export type EngineCard = {
  id: string
  ownerUserId: string
  target: string
  native: string
  examplePhrase: string | null
  exampleTranslation: string | null
  /** Potenciada (Luis, 8 Oct): goes into the game before the others. */
  boosted?: boolean
}

/** Lo que ve el alumno. Nunca lleva la solución. */
export type PublicQuestion =
  | { kind: 'choice'; prompt: string; options: string[] }
  | { kind: 'listen'; audioText: string; options: string[] }
  | { kind: 'write'; prompt: string; hint: string }
  | { kind: 'speak'; prompt: string }
  | { kind: 'cloze'; before: string; after: string; options: string[] }
  /** Parejas: un tablero de 5 palabras (izquierda) y sus significados desordenados (derecha). */
  | { kind: 'pairs'; words: string[]; options: string[] }

/** Solo servidor. */
export type SecretAnswer = {
  cardId: string
  ownerUserId: string
  target: string
  native: string
  correctOptionIndex: number | null
  accepted: string[]
  phrase: string | null
  phraseTranslation: string | null
}

export type GeneratedQuestion = {
  kind: QuestionKind
  question: PublicQuestion
  answer: SecretAnswer
}

export type PlayerResponse = {
  optionIndex?: number | null
  text?: string | null
  transcripts?: string[] | null
}

export type Rng = () => number

// ---------------------------------------------------------------------------
// Reglas generales
// ---------------------------------------------------------------------------

export const TURN_QUESTIONS_TOTAL = 10
export const ALLOWED_ROUNDS = [1, 2, 5, 10] as const
export const LIGHTNING_POOL_SIZE = 40
/** Mínimo de palabras distintas para poder jugar (4 = 1 correcta + 3 opciones). */
export const MIN_UNIQUE_WORDS = 4
/** Palabras que hay que tener en el Baúl ICA (de ese idioma) para entrar en los retos. */
export const MIN_WORDS_TO_JOIN = 20
/** Parejas: palabras por tablero. */
export const PAIRS_PER_BOARD = 5
export const DEFAULT_MAX_LEVEL_GAP = 3

/** Tiempo que el alumno ve si ha acertado antes de pasar a la siguiente palabra. */
export const FEEDBACK_ALLOWANCE_MS = 1800
/** Margen para la conexión (móvil lento). */
export const NETWORK_GRACE_MS = 2500
/** Margen al final del Modo Relámpago. */
export const LIGHTNING_GRACE_MS = 1500

type ModeDefaults = {
  kind: QuestionKind
  format: ChallengeFormat
  secondsPerQuestion: number
  sessionSeconds: number | null
}

/** Modos que ya se pueden jugar. La clave es el id de desafio_tipos. */
export const MODE_DEFAULTS: Record<string, ModeDefaults> = {
  'ica-own-words': { kind: 'choice', format: 'turns', secondsPerQuestion: 5, sessionSeconds: null },
  // 10 s per word (Luis, 8 Oct: 7 s was too short to type, above all on the phone).
  'ica-writing': { kind: 'write', format: 'turns', secondsPerQuestion: 10, sessionSeconds: null },
  'ica-lightning': { kind: 'write', format: 'lightning', secondsPerQuestion: 0, sessionSeconds: 60 },
  'ica-speak': { kind: 'speak', format: 'turns', secondsPerQuestion: 10, sessionSeconds: null },
  'ica-listen': { kind: 'listen', format: 'turns', secondsPerQuestion: 8, sessionSeconds: null },
  'ica-cloze': { kind: 'cloze', format: 'turns', secondsPerQuestion: 12, sessionSeconds: null },
  // En Parejas, los segundos son por tablero (5 parejas).
  'ica-pairs': { kind: 'pairs', format: 'turns', secondsPerQuestion: 40, sessionSeconds: null },
}

export function isPlayableTypeId(typeId: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODE_DEFAULTS, typeId)
}

/** Palabras distintas que necesita cada modo para montar una partida. */
export function minWordsForKind(kind: QuestionKind): number {
  return kind === 'pairs' ? PAIRS_PER_BOARD : MIN_UNIQUE_WORDS
}

/** Cuántas palabras le faltan a alguien para entrar en los retos (0 = ya puede). */
export function wordsMissingToJoin(wordCount: number): number {
  const safe = Number.isFinite(wordCount) ? Math.max(0, Math.floor(wordCount)) : 0
  return Math.max(0, MIN_WORDS_TO_JOIN - safe)
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// ---------------------------------------------------------------------------
// Texto: limpiar y comparar
// ---------------------------------------------------------------------------

const APOSTROPHES = /[’‘´`ʼ]/g
const EDGE_PUNCTUATION = /^[\s.,;:!?¡¿"«»“”„()[\]{}…–—-]+|[\s.,;:!?¡¿"«»“”„()[\]{}…–—-]+$/g

// Letras que no se "separan" de su tilde con NFD.
const SPECIAL_LETTERS: Record<string, string> = {
  ł: 'l',
  ß: 'ss',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  đ: 'd',
  ð: 'd',
  ı: 'i',
  þ: 'th',
}

/**
 * Para lo ESCRITO: minúsculas, espacios y puntuación de los bordes fuera.
 * Las tildes y letras especiales SE RESPETAN (el alumno usa el teclado del idioma).
 */
export function normalizeTyped(value: string): string {
  return value
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    // Capitals never count (Luis, 8 Oct): the Turkish «İ» lowercases to «i» + a dot sign.
    .replace(/i\u0307/g, 'i')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_PUNCTUATION, '')
    .trim()
}

/** Para lo HABLADO y para comparar palabras entre sí: sin tildes ni signos. */
export function normalizeLoose(value: string): string {
  const folded = normalizeTyped(value)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[łßøæœđðıþ]/g, (letter) => SPECIAL_LETTERS[letter] || letter)
  return folded
    .replace(/['\-‐]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Palabras de una opción tal como la ve el alumno: "der Hund" = 2, "samochód / auto" = 2,
 * "l'homme" = 1. Sirve para que las 4 opciones tengan la misma forma.
 */
export function optionWordCount(label: string): number {
  return label
    .trim()
    .split(/\s+/)
    .filter((token) => /\p{L}/u.test(token)).length
}

/**
 * ¿Puede ir esta opción junto a la respuesta sin delatarla? (como en el test mensual ICA)
 * - Respuesta de una palabra -> todas las opciones de una palabra.
 * - Respuesta de varias -> opciones de varias palabras, con una de diferencia como mucho
 *   (3 palabras -> opciones de 2 a 4).
 */
export function isSimilarOptionShape(answerWords: number, candidateWords: number): boolean {
  if (answerWords <= 1) return candidateWords === 1
  return candidateWords >= 2 && Math.abs(candidateWords - answerWords) <= 1
}

// ---------------------------------------------------------------------------
// Artículos y formas aceptadas
// ---------------------------------------------------------------------------

const ARTICLES_BY_LANGUAGE: Record<string, string[]> = {
  Alemán: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'],
  Francés: ['le', 'la', 'les', "l'", 'un', 'une', 'des', 'du'],
  Italiano: ['il', 'lo', 'la', "l'", 'i', 'gli', 'le', 'un', 'uno', 'una', "un'"],
  Inglés: ['the', 'a', 'an', 'to'],
  Portugués: ['o', 'a', 'os', 'as', 'um', 'uma'],
  Español: ['el', 'la', 'los', 'las', 'un', 'una'],
  Catalán: ['el', 'la', 'els', 'les', "l'", 'un', 'una'],
  Holandés: ['de', 'het', 'een'],
  Sueco: ['en', 'ett'],
  Noruego: ['en', 'ei', 'et'],
  Danés: ['en', 'et'],
}

/** "der Hund" -> "Hund", "l'homme" -> "homme". Si no hay artículo, null. */
export function stripLeadingArticle(value: string, language: string): string | null {
  const articles = ARTICLES_BY_LANGUAGE[language] || []
  if (articles.length === 0) return null
  const clean = value.replace(APOSTROPHES, "'").trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length >= 2 && articles.includes(normalizeTyped(words[0]))) {
    return words.slice(1).join(' ')
  }
  const lower = clean.toLowerCase()
  for (const article of articles) {
    if (!article.endsWith("'")) continue
    if (lower.startsWith(article) && clean.length > article.length) {
      return clean.slice(article.length).trim()
    }
  }
  return null
}

function splitAlternatives(target: string): string[] {
  return target
    .replace(APOSTROPHES, "'")
    .split(/\s*[/;|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Todas las formas que se dan por buenas para una palabra ICA:
 * "samochód / auto" -> samochód, auto · "der Hund" -> der Hund, Hund · "bać (się)" -> bać, bać się
 */
export function expandAcceptedForms(target: string, language: string): string[] {
  const out = new Set<string>()
  for (const part of splitAlternatives(target)) {
    const withoutParens = part.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
    const parensKept = part.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
    for (const form of [withoutParens, parensKept]) {
      if (!form) continue
      out.add(form)
      const noArticle = stripLeadingArticle(form, language)
      if (noArticle) out.add(noArticle)
    }
  }
  return Array.from(out)
}

/** La forma "principal" de una palabra: la primera, sin paréntesis ni artículo. */
export function mainForm(target: string, language: string): string {
  const first = splitAlternatives(target)[0] || target.trim()
  const withoutParens = first.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  return stripLeadingArticle(withoutParens, language) || withoutParens
}

export function firstLetterHint(target: string, language: string): string {
  const main = mainForm(target, language)
  const first = Array.from(main)[0] || ''
  return first ? `${first}…` : ''
}

// ---------------------------------------------------------------------------
// Completa la frase: encontrar la palabra dentro de su frase de ejemplo
// ---------------------------------------------------------------------------

export type PhraseGap = { before: string; answer: string; after: string }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type Token = { text: string; start: number; end: number }

function tokenize(phrase: string): Token[] {
  const tokens: Token[] = []
  const regex = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu
  let match: RegExpExecArray | null
  while ((match = regex.exec(phrase)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  return tokens
}

function commonPrefixLength(a: string, b: string): number {
  const ca = Array.from(a)
  const cb = Array.from(b)
  let count = 0
  while (count < ca.length && count < cb.length && ca[count] === cb[count]) count += 1
  return count
}

/** ¿Es este trozo de la frase la palabra ICA (o una forma suya, p. ej. "samochodem")? */
function tokenMatchesWord(token: string, word: string): boolean {
  const t = token.normalize('NFC').toLowerCase()
  const w = word.normalize('NFC').toLowerCase()
  if (t === w) return true
  const wordLength = Array.from(w).length
  const tokenLength = Array.from(t).length
  if (wordLength < 4) return false
  const prefix = commonPrefixLength(t, w)
  const needed = Math.max(3, Math.ceil(wordLength * 0.6))
  return prefix >= needed && tokenLength <= wordLength + 5
}

export function locateInPhrase(
  phrase: string | null | undefined,
  target: string,
  language: string,
): PhraseGap | null {
  const text = (phrase || '').trim()
  if (!text) return null

  const forms = expandAcceptedForms(target, language).sort((a, b) => b.length - a.length)
  const tokens = tokenize(text)

  const build = (start: number, end: number): PhraseGap | null => {
    const before = text.slice(0, start)
    const after = text.slice(end)
    // Tiene que quedar contexto de verdad (al menos 2 palabras fuera del hueco).
    if (countWords(`${before} ${after}`.replace(/[^\p{L}\p{N}\s]/gu, ' ')) < 2) return null
    return { before, answer: text.slice(start, end), after }
  }

  // 1) La palabra tal cual aparece en la frase.
  for (const form of forms) {
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(form)})(?=$|[^\\p{L}\\p{N}])`, 'iu')
    const match = regex.exec(text)
    if (match) {
      const start = match.index + match[1].length
      const gap = build(start, start + match[2].length)
      if (gap) return gap
    }
  }

  // 2) Una forma parecida (plural, declinación, conjugación regular…).
  for (const form of forms) {
    const words = form.split(/\s+/).filter(Boolean)
    if (words.length === 0 || words.length > 4) continue
    for (let i = 0; i + words.length <= tokens.length; i += 1) {
      const slice = tokens.slice(i, i + words.length)
      if (slice.every((token, k) => tokenMatchesWord(token.text, words[k]))) {
        const gap = build(slice[0].start, slice[slice.length - 1].end)
        if (gap) return gap
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// ¿Qué palabras sirven para cada modo?
// ---------------------------------------------------------------------------

export function isCardEligible(kind: QuestionKind, card: EngineCard, language: string): boolean {
  const target = card.target.trim()
  const native = card.native.trim()
  if (!target || !native) return false
  if (!/\p{L}/u.test(target)) return false

  switch (kind) {
    case 'choice':
      return true
    case 'listen':
      return countWords(target) <= 6
    case 'write': {
      // Luis: "solo una palabra, para no liarla" (el artículo no cuenta: "der Hund" vale).
      const main = mainForm(target, language)
      return countWords(main) === 1 && Array.from(main).length <= 30
    }
    case 'speak': {
      const words = countWords(mainForm(target, language))
      return words >= 1 && words <= 4
    }
    case 'cloze':
      return locateInPhrase(card.examplePhrase, target, language) !== null
    case 'pairs':
      // Tienen que caber en los botones del tablero.
      return (
        countWords(target) <= 4 &&
        Array.from(target).length <= 28 &&
        countWords(native) <= 5 &&
        Array.from(native).length <= 32
      )
    default:
      return false
  }
}

function uniqueByTarget(cards: EngineCard[]): EngineCard[] {
  const seen = new Set<string>()
  const out: EngineCard[] = []
  for (const card of cards) {
    const key = normalizeLoose(card.target)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(card)
  }
  return out
}

type OptionDisplay = 'target' | 'native'

/** En los modos con opciones, qué se ve en los botones (Lectura: la palabra ICA; Escucha: su significado). */
function optionDisplayFor(kind: QuestionKind): OptionDisplay | null {
  if (kind === 'choice' || kind === 'cloze') return 'target'
  if (kind === 'listen') return 'native'
  return null
}

function optionLabel(card: EngineCard, display: OptionDisplay): string {
  return (display === 'target' ? card.target : card.native).trim()
}

/**
 * Orden de preferencia de las palabras en Lectura y Escucha:
 *  0 = palabra suelta con al menos 3 opciones de su misma forma,
 *  1 = expresión de varias palabras con 3 opciones parecidas,
 *  2 = sin bastantes opciones parecidas (solo si no queda otra).
 */
function makeOptionPriority(kind: QuestionKind, pools: EngineCard[][]): ((card: EngineCard) => number) | null {
  const display = optionDisplayFor(kind)
  if (!display) return null
  const byWordCount = new Map<number, number>()
  for (const card of uniqueByTarget(pools.flat())) {
    const words = optionWordCount(optionLabel(card, display))
    byWordCount.set(words, (byWordCount.get(words) || 0) + 1)
  }
  return (card) => {
    const words = optionWordCount(optionLabel(card, display))
    let similar = -1 // la propia palabra no cuenta
    byWordCount.forEach((amount, count) => {
      if (isSimilarOptionShape(words, count)) similar += amount
    })
    if (similar < 3) return 2
    return words <= 1 ? 0 : 1
  }
}

/**
 * Ordena sin perder el azar: dentro de cada prioridad se mantiene el orden barajado.
 * Las palabras potenciadas (Luis, 8 Oct) van siempre delante.
 */
function sortByPriority(cards: EngineCard[], priority: ((card: EngineCard) => number) | null): EngineCard[] {
  if (!priority) return [...cards.filter((card) => card.boosted), ...cards.filter((card) => !card.boosted)]
  return cards
    .map((card, index) => ({ card, index, rank: (card.boosted ? -1000 : 0) + priority(card) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.card)
}

export type PickResult =
  | { ok: true; cards: EngineCard[] }
  | { ok: false; reason: 'not_enough_words'; eligibleByPool: number[] }

/**
 * Elige las palabras del desafío.
 * - Un solo baúl (modo "cada uno con sus palabras"): todas de ese baúl.
 * - Dos baúles (mezcla): la mitad de cada uno; si a uno le faltan, se completa con el otro.
 * Si no hay bastantes palabras distintas, se repiten (como hacía el modo original).
 * En Lectura y Escucha van primero las palabras sueltas (Luis: "que se prioricen las
 * palabras ICA de una sola palabra") y las que tienen opciones de su misma forma.
 */
export function pickPromptCards(input: {
  kind: QuestionKind
  pools: EngineCard[][]
  count: number
  language: string
  rng?: Rng
}): PickResult {
  const rng = input.rng || Math.random
  const priority = makeOptionPriority(input.kind, input.pools)
  const seen = new Set<string>()
  const eligiblePools = input.pools.map((pool) => {
    const eligible = uniqueByTarget(pool.filter((card) => isCardEligible(input.kind, card, input.language)))
    // Una palabra que está en los dos baúles solo cuenta una vez.
    return sortByPriority(shuffle(eligible, rng), priority).filter((card) => {
      const key = normalizeLoose(card.target)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

  const totalEligible = eligiblePools.reduce((sum, pool) => sum + pool.length, 0)
  if (totalEligible < MIN_UNIQUE_WORDS) {
    return {
      ok: false,
      reason: 'not_enough_words',
      eligibleByPool: eligiblePools.map((pool) => pool.length),
    }
  }

  const poolCount = Math.max(1, eligiblePools.length)
  const quotas = eligiblePools.map((_, index) =>
    Math.floor(input.count / poolCount) + (index < input.count % poolCount ? 1 : 0),
  )

  const picked: EngineCard[] = []
  const leftovers: EngineCard[] = []
  eligiblePools.forEach((pool, index) => {
    picked.push(...pool.slice(0, quotas[index]))
    leftovers.push(...pool.slice(quotas[index]))
  })

  const shuffledLeftovers = sortByPriority(shuffle(leftovers, rng), priority)
  while (picked.length < input.count && shuffledLeftovers.length > 0) {
    picked.push(shuffledLeftovers.shift() as EngineCard)
  }

  const unique = shuffle(picked, rng)
  const cards = unique.slice()
  let cursor = 0
  while (cards.length < input.count) {
    cards.push(unique[cursor % unique.length])
    cursor += 1
  }

  return { ok: true, cards }
}

export function countEligible(kind: QuestionKind, cards: EngineCard[], language: string): number {
  return uniqueByTarget(cards.filter((card) => isCardEligible(kind, card, language))).length
}

// ---------------------------------------------------------------------------
// Construir preguntas
// ---------------------------------------------------------------------------

/**
 * Las 3 opciones falsas. Tienen la misma forma que la respuesta (una palabra si la
 * respuesta es una palabra; 2–4 si son 3…), para que ninguna opción se delate sola.
 * Si el baúl no tiene bastantes parecidas, se usan las más cercanas en número de palabras.
 */
function pickDistractors(input: {
  correct: EngineCard
  pool: EngineCard[]
  rng: Rng
  display: OptionDisplay
}): EngineCard[] {
  const correctTarget = normalizeLoose(input.correct.target)
  const correctNative = normalizeLoose(input.correct.native)
  const usedDisplay = new Set<string>([normalizeLoose(optionLabel(input.correct, input.display))])
  const answerWords = optionWordCount(optionLabel(input.correct, input.display))
  const similar: EngineCard[] = []
  const others: Array<{ card: EngineCard; distance: number }> = []

  for (const card of shuffle(input.pool, input.rng)) {
    if (similar.length >= 3) break
    const target = normalizeLoose(card.target)
    const native = normalizeLoose(card.native)
    if (!target || !native) continue
    // Nunca dos respuestas buenas: ni la misma palabra ni el mismo significado.
    if (target === correctTarget || native === correctNative) continue
    const display = input.display === 'target' ? target : native
    if (usedDisplay.has(display)) continue
    usedDisplay.add(display)
    const words = optionWordCount(optionLabel(card, input.display))
    if (isSimilarOptionShape(answerWords, words)) {
      similar.push(card)
    } else {
      others.push({ card, distance: Math.abs(words - answerWords) })
    }
  }

  if (similar.length >= 3) return similar
  others.sort((a, b) => a.distance - b.distance)
  return [...similar, ...others.map((item) => item.card)].slice(0, 3)
}

function acceptedFormsFor(card: EngineCard, pool: EngineCard[], language: string): string[] {
  const nativeKey = normalizeLoose(card.native)
  const accepted = new Set<string>(expandAcceptedForms(card.target, language))
  // Sinónimos del propio baúl: si "coche" está guardado como "samochód" y como "auto",
  // las dos respuestas valen.
  for (const other of pool) {
    if (other.id === card.id) continue
    if (normalizeLoose(other.native) !== nativeKey) continue
    for (const form of expandAcceptedForms(other.target, language)) accepted.add(form)
  }
  return Array.from(accepted)
}

function baseAnswer(card: EngineCard): SecretAnswer {
  return {
    cardId: card.id,
    ownerUserId: card.ownerUserId,
    target: card.target.trim(),
    native: card.native.trim(),
    correctOptionIndex: null,
    accepted: [],
    phrase: card.examplePhrase?.trim() || null,
    phraseTranslation: card.exampleTranslation?.trim() || null,
  }
}

export function buildQuestion(input: {
  kind: QuestionKind
  card: EngineCard
  optionPool: EngineCard[]
  language: string
  rng?: Rng
}): GeneratedQuestion | null {
  const rng = input.rng || Math.random
  const { card, kind } = input
  const base = baseAnswer(card)
  // Parejas se monta por tableros (generatePairsQuestions), no palabra a palabra.
  if (kind === 'pairs') return null

  if (kind === 'choice' || kind === 'listen' || kind === 'cloze') {
    const display = kind === 'listen' ? 'native' : 'target'
    const distractors = pickDistractors({ correct: card, pool: input.optionPool, rng, display })
    if (distractors.length < 3) return null
    const options = shuffle([card, ...distractors], rng)
    const correctOptionIndex = options.findIndex((item) => item.id === card.id)
    const labels = options.map((item) => (display === 'native' ? item.native.trim() : item.target.trim()))
    const answer: SecretAnswer = { ...base, correctOptionIndex }

    if (kind === 'choice') {
      return { kind, question: { kind, prompt: base.native, options: labels }, answer }
    }
    if (kind === 'listen') {
      return { kind, question: { kind, audioText: base.target, options: labels }, answer }
    }
    const gap = locateInPhrase(card.examplePhrase, card.target, input.language)
    if (!gap) return null
    return {
      kind,
      question: { kind, before: gap.before, after: gap.after, options: labels },
      answer,
    }
  }

  const accepted = acceptedFormsFor(card, input.optionPool, input.language)
  if (kind === 'write') {
    return {
      kind,
      question: { kind, prompt: base.native, hint: firstLetterHint(card.target, input.language) },
      answer: { ...base, accepted },
    }
  }

  return {
    kind,
    question: { kind, prompt: base.native },
    answer: { ...base, accepted },
  }
}

/**
 * Genera todas las preguntas del desafío (10 por turnos o 40 para el Modo Relámpago).
 * `pools`: un baúl (cada uno con sus palabras) o dos (mezcla).
 */
export function generateQuestions(input: {
  kind: QuestionKind
  pools: EngineCard[][]
  count: number
  language: string
  rng?: Rng
}): { ok: true; questions: GeneratedQuestion[] } | { ok: false; reason: string; eligibleByPool?: number[] } {
  const rng = input.rng || Math.random
  const picked = pickPromptCards(input)
  if (!picked.ok) return picked

  if (input.kind === 'pairs') {
    const questions = generatePairsQuestions({
      picked: picked.cards,
      pool: uniqueByTarget(input.pools.flat().filter((card) => isCardEligible('pairs', card, input.language))),
      count: input.count,
      rng,
    })
    return questions ? { ok: true, questions } : { ok: false, reason: 'not_enough_words' }
  }

  const optionPool = uniqueByTarget(input.pools.flat())
  if (
    (input.kind === 'choice' || input.kind === 'listen' || input.kind === 'cloze') &&
    optionPool.length < MIN_UNIQUE_WORDS
  ) {
    return { ok: false, reason: 'not_enough_words' }
  }

  const questions: GeneratedQuestion[] = []
  for (const card of picked.cards) {
    const question = buildQuestion({ kind: input.kind, card, optionPool, language: input.language, rng })
    if (question) questions.push(question)
  }

  if (questions.length === 0) return { ok: false, reason: 'not_enough_words' }
  // Si alguna palabra no pudo tener 3 opciones distintas, se rellena repitiendo.
  const filled = questions.slice()
  let cursor = 0
  while (filled.length < input.count) {
    filled.push(questions[cursor % questions.length])
    cursor += 1
  }
  return { ok: true, questions: filled }
}

// ---------------------------------------------------------------------------
// Parejas: tableros de 5 palabras
// ---------------------------------------------------------------------------

/**
 * Monta los tableros. En un mismo tablero no se repite ninguna palabra ni ningún
 * significado (si no, habría dos parejas buenas). Cada pareja se guarda como una
 * pregunta: así la puntuación, los turnos y los resultados funcionan igual que en
 * los demás modos (10 palabras = 2 tableros de 5).
 */
export function generatePairsQuestions(input: {
  picked: EngineCard[]
  pool: EngineCard[]
  count: number
  rng?: Rng
}): GeneratedQuestion[] | null {
  const rng = input.rng || Math.random
  const boardCount = Math.max(1, Math.ceil(input.count / PAIRS_PER_BOARD))
  const questions: GeneratedQuestion[] = []

  for (let boardIndex = 0; boardIndex < boardCount; boardIndex += 1) {
    const board: EngineCard[] = []
    const targets = new Set<string>()
    const natives = new Set<string>()
    const tryAdd = (card: EngineCard) => {
      if (board.length >= PAIRS_PER_BOARD) return
      const target = normalizeLoose(card.target)
      const native = normalizeLoose(card.native)
      if (!target || !native || targets.has(target) || natives.has(native)) return
      targets.add(target)
      natives.add(native)
      board.push(card)
    }
    // Primero las palabras elegidas para este tablero; si alguna choca, otra del baúl.
    input.picked
      .slice(boardIndex * PAIRS_PER_BOARD, (boardIndex + 1) * PAIRS_PER_BOARD)
      .forEach(tryAdd)
    shuffle(input.pool, rng).forEach(tryAdd)
    if (board.length < PAIRS_PER_BOARD) return null

    const left = shuffle(board, rng)
    const right = shuffle(board, rng)
    const words = left.map((card) => card.target.trim())
    const options = right.map((card) => card.native.trim())
    for (const card of left) {
      questions.push({
        kind: 'pairs',
        question: { kind: 'pairs', words, options },
        answer: { ...baseAnswer(card), correctOptionIndex: right.indexOf(card) },
      })
    }
  }

  return questions.slice(0, Math.max(input.count, PAIRS_PER_BOARD))
}

/** Primer índice del tablero al que pertenece una pregunta de Parejas. */
export function boardStart(index: number): number {
  return index - (index % PAIRS_PER_BOARD)
}

/** Índices (preguntas) del tablero que empieza en `start`. */
export function boardIndices(start: number, totalQuestions: number): number[] {
  const out: number[] = []
  for (let index = start; index < start + PAIRS_PER_BOARD && index < totalQuestions; index += 1) {
    out.push(index)
  }
  return out
}

/** Lo que manda el móvil: para cada palabra de la izquierda, el significado elegido (o nada). */
export function readPairMatches(raw: unknown): Array<number | null> {
  const list = Array.isArray(raw) ? raw.slice(0, PAIRS_PER_BOARD) : []
  const out: Array<number | null> = []
  for (let position = 0; position < PAIRS_PER_BOARD; position += 1) {
    const value = list[position]
    const parsed = value === null || value === undefined || value === '' ? NaN : Math.round(Number(value))
    out.push(Number.isInteger(parsed) && parsed >= 0 && parsed < PAIRS_PER_BOARD ? parsed : null)
  }
  // Un mismo significado no puede estar unido a dos palabras: se queda con la primera.
  const used = new Set<number>()
  return out.map((value) => {
    if (value === null || used.has(value)) return null
    used.add(value)
    return value
  })
}

/** Corrige un tablero entero. Fuera de tiempo, no cuenta ninguna pareja. */
export function evaluatePairsBoard(input: {
  answers: SecretAnswer[]
  matches: Array<number | null>
  inTime: boolean
}): { correct: boolean[]; solution: number[]; chosen: Array<number | null> } {
  const solution = input.answers.map((answer) => (answer.correctOptionIndex ?? -1))
  const chosen = input.answers.map((_, position) => input.matches[position] ?? null)
  const correct = input.answers.map(
    (_, position) => input.inTime && chosen[position] !== null && chosen[position] === solution[position],
  )
  return { correct, solution, chosen }
}

// ---------------------------------------------------------------------------
// Corregir
// ---------------------------------------------------------------------------

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((word, k) => haystack[i + k] === word)) return true
  }
  return false
}

export function evaluateResponse(input: {
  kind: QuestionKind
  answer: SecretAnswer
  response: PlayerResponse
  language: string
}): boolean {
  const { kind, answer, response } = input

  if (kind === 'choice' || kind === 'listen' || kind === 'cloze' || kind === 'pairs') {
    const optionIndex = response.optionIndex
    return (
      typeof optionIndex === 'number' &&
      Number.isInteger(optionIndex) &&
      answer.correctOptionIndex !== null &&
      optionIndex === answer.correctOptionIndex
    )
  }

  const accepted = answer.accepted.length > 0 ? answer.accepted : [answer.target]

  if (kind === 'write') {
    const typed = toText(response.text).slice(0, 120)
    if (!typed) return false
    const typedForms = new Set<string>([normalizeTyped(typed)])
    const withoutArticle = stripLeadingArticle(typed, input.language)
    if (withoutArticle) typedForms.add(normalizeTyped(withoutArticle))
    return accepted.some((form) => typedForms.has(normalizeTyped(form)))
  }

  // Hablado: se buscan las palabras esperadas dentro de lo que ha entendido el micrófono
  // (sin tildes: el reconocimiento ya escribe bien, y así no se castiga una tilde perdida).
  const transcripts = (Array.isArray(response.transcripts) ? response.transcripts : [])
    .map((item) => toText(item).slice(0, 200))
    .filter(Boolean)
    .slice(0, 6)
  if (transcripts.length === 0) return false

  return transcripts.some((transcript) => {
    const heard = normalizeLoose(transcript).split(' ').filter(Boolean)
    return accepted.some((form) => containsSequence(heard, normalizeLoose(form).split(' ').filter(Boolean)))
  })
}

// ---------------------------------------------------------------------------
// Nivel real (el de la barra de progreso) y distancia entre niveles
// ---------------------------------------------------------------------------

export const LEVEL_SCALE: string[] = ['Pre-A1', ...LEVEL_KEYS]

export function normalizeLevel(value: unknown): string | null {
  const normalized = toText(value).toUpperCase().replace(/\s+/g, '')
  if (!normalized) return null
  if (['PREA1', 'PRE-A1', 'A0', 'LEVEL0', '0'].includes(normalized)) return 'Pre-A1'
  const plus = normalized.replace('PLUS', '+')
  if ((LEVEL_KEYS as readonly string[]).includes(plus)) return plus
  if (plus === 'C2' || plus === 'C1+') return 'C1'
  return null
}

export type MetaTrackerLike = {
  start_level?: unknown
  prior_ica_words?: unknown
  activation_words_total?: unknown
  confirmed_at?: unknown
}

function thresholdsFor(targetLang: string): Record<LevelKey, number> {
  const family = LANG_TO_FAMILY[targetLang] || DEFAULT_LEVEL_FAMILY
  return LEVEL_THRESHOLDS_BY_FAMILY[family] || LEVEL_THRESHOLDS_BY_FAMILY[DEFAULT_LEVEL_FAMILY]
}

export function levelFromWordCount(totalWords: number, targetLang: string): string {
  const thresholds = thresholdsFor(targetLang)
  const safeTotal = Math.max(0, Number.isFinite(totalWords) ? totalWords : 0)
  let level = 'Pre-A1'
  for (const key of LEVEL_KEYS) {
    if (safeTotal >= thresholds[key]) level = key
  }
  return level
}

/** Igual que la barra: nivel de partida + palabras ICA previas + palabras activadas. */
export function levelFromTracker(row: MetaTrackerLike | null | undefined, targetLang: string): string | null {
  if (!row || !row.confirmed_at) return null
  const thresholds = thresholdsFor(targetLang)
  const startLevel = normalizeLevel(row.start_level)
  const baseWords = startLevel && startLevel !== 'Pre-A1' ? thresholds[startLevel as LevelKey] || 0 : 0
  const prior = Number(row.prior_ica_words)
  const activation = Number(row.activation_words_total)
  const total =
    baseWords + (Number.isFinite(prior) ? prior : 0) + (Number.isFinite(activation) ? activation : 0)
  return levelFromWordCount(total, targetLang)
}

export function levelIndex(level: string | null | undefined): number {
  if (!level) return -1
  return LEVEL_SCALE.indexOf(level)
}

/** Escalones entre dos niveles (A1 -> B1 = 4). null si alguno no se conoce. */
export function levelGap(a: string | null | undefined, b: string | null | undefined): number | null {
  const ia = levelIndex(a)
  const ib = levelIndex(b)
  if (ia < 0 || ib < 0) return null
  return Math.abs(ia - ib)
}

export function checkMixedAllowed(input: {
  myLevel: string | null
  rivalLevel: string | null
  maxGap: number
}): { allowed: true } | { allowed: false; reason: string } {
  if (!input.myLevel) {
    return { allowed: false, reason: 'Aún no tienes nivel en tu barra de progreso.' }
  }
  if (!input.rivalLevel) {
    return { allowed: false, reason: 'Este icademer aún no tiene nivel en su barra de progreso.' }
  }
  const gap = levelGap(input.myLevel, input.rivalLevel)
  if (gap === null || gap > input.maxGap) {
    return {
      allowed: false,
      reason: `Nivel demasiado distinto (${input.myLevel} y ${input.rivalLevel}).`,
    }
  }
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Actividad de cada icademer (lista de rivales)
// ---------------------------------------------------------------------------

/** Quien lleva estos días sin usar la app no sale en la lista de rivales. */
export const INACTIVE_AFTER_DAYS = 30
/** Ventana para ordenar por «los que más retos hacen». */
export const TRENDING_WINDOW_DAYS = 30

export type ActivityChallengeRow = {
  challengerUserId: string
  challengedUserId: string
  status: string
  resultType: string | null
  winnerUserId: string | null
  finalizedAt: string | null
  createdAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function toMs(value: string | null): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : NaN
}

/**
 * Para un icademer: cuántos desafíos ha jugado en los últimos 30 días (sirve para
 * ponerlo arriba), su racha de victorias seguidas y cuándo jugó el último.
 */
export function summarizeChallengeActivity(
  rows: ActivityChallengeRow[],
  userId: string,
  nowMs = Date.now(),
): { recentChallenges: number; winStreak: number; lastChallengeAtMs: number | null } {
  const mine = rows.filter((row) => row.challengerUserId === userId || row.challengedUserId === userId)
  const windowStart = nowMs - TRENDING_WINDOW_DAYS * DAY_MS

  const recentChallenges = mine.filter(
    (row) => (row.status === 'in_progress' || row.status === 'completed') && toMs(row.createdAt) >= windowStart,
  ).length

  const finished = mine
    .filter(
      (row) =>
        row.status === 'completed' &&
        (row.resultType === 'challenger_win' || row.resultType === 'challenged_win' || row.resultType === 'draw'),
    )
    .sort((a, b) => (toMs(b.finalizedAt) || toMs(b.createdAt) || 0) - (toMs(a.finalizedAt) || toMs(a.createdAt) || 0))
  let winStreak = 0
  for (const row of finished) {
    if (row.resultType !== 'draw' && row.winnerUserId === userId) winStreak += 1
    else break
  }

  let lastChallengeAtMs: number | null = null
  for (const row of mine) {
    if (row.status !== 'in_progress' && row.status !== 'completed') continue
    const at = Math.max(toMs(row.finalizedAt) || 0, toMs(row.createdAt) || 0)
    if (at > 0 && (lastChallengeAtMs === null || at > lastChallengeAtMs)) lastChallengeAtMs = at
  }

  return { recentChallenges, winStreak, lastChallengeAtMs }
}

/** Día (AAAA-MM-DD, UTC) desde el que alguien cuenta como activo. */
export function activeSinceDay(nowMs = Date.now()): string {
  return new Date(nowMs - INACTIVE_AFTER_DAYS * DAY_MS).toISOString().slice(0, 10)
}

export function isRecentlyActive(input: {
  lastAppActivityDay: string | null
  lastChallengeAtMs: number | null
  nowMs?: number
}): boolean {
  const nowMs = input.nowMs ?? Date.now()
  if (input.lastAppActivityDay && input.lastAppActivityDay >= activeSinceDay(nowMs)) return true
  return input.lastChallengeAtMs !== null && input.lastChallengeAtMs >= nowMs - INACTIVE_AFTER_DAYS * DAY_MS
}

// ---------------------------------------------------------------------------
// Configuración de cada partida
// ---------------------------------------------------------------------------

export type ModeSettings = {
  typeId: string
  kind: QuestionKind
  format: ChallengeFormat
  rounds: number
  questionsPerRound: number
  totalQuestions: number
  secondsPerQuestion: number
  sessionSeconds: number | null
  wordSource: WordSource
}

function toRounds(value: unknown, kind: QuestionKind): number {
  const parsed = Number(value)
  // Parejas: 1 ronda con los 2 tableros, o 2 rondas de 1 tablero.
  if (kind === 'pairs') return parsed === 1 ? 1 : 2
  return (ALLOWED_ROUNDS as readonly number[]).includes(parsed) ? parsed : 2
}

/** Segundos máximos por pregunta (en Parejas, por tablero). */
function maxSecondsFor(kind: QuestionKind): number {
  return kind === 'pairs' ? 120 : 30
}

/** Al crear el desafío: se congela la configuración en game_metadata. */
export function buildModeSettings(input: {
  typeId: string
  typeConfig: Record<string, unknown>
  rounds: unknown
  responseSeconds: unknown
  wordSource: WordSource
}): ModeSettings | null {
  const defaults = MODE_DEFAULTS[input.typeId]
  if (!defaults) return null

  if (defaults.format === 'lightning') {
    return {
      typeId: input.typeId,
      kind: defaults.kind,
      format: 'lightning',
      rounds: 1,
      questionsPerRound: LIGHTNING_POOL_SIZE,
      totalQuestions: LIGHTNING_POOL_SIZE,
      secondsPerQuestion: 0,
      sessionSeconds: clampInt(input.typeConfig.sessionSeconds, 20, 180, defaults.sessionSeconds || 60),
      wordSource: input.wordSource,
    }
  }

  const rounds = toRounds(input.rounds, defaults.kind)
  // En Lectura el retador elige los segundos (3–8), como hasta ahora.
  const secondsPerQuestion =
    input.typeId === 'ica-own-words'
      ? clampInt(input.responseSeconds, 3, 8, defaults.secondsPerQuestion)
      : clampInt(input.typeConfig.secondsPerQuestion, 3, maxSecondsFor(defaults.kind), defaults.secondsPerQuestion)

  return {
    typeId: input.typeId,
    kind: defaults.kind,
    format: 'turns',
    rounds,
    questionsPerRound: TURN_QUESTIONS_TOTAL / rounds,
    totalQuestions: TURN_QUESTIONS_TOTAL,
    secondsPerQuestion,
    sessionSeconds: null,
    wordSource: input.wordSource,
  }
}

export function settingsToMetadata(settings: ModeSettings, extra: Record<string, unknown> = {}) {
  return {
    mode: settings.typeId,
    kind: settings.kind,
    format: settings.format,
    rounds: settings.rounds,
    questionsPerRound: settings.questionsPerRound,
    totalQuestions: settings.totalQuestions,
    secondsPerQuestion: settings.secondsPerQuestion,
    // Nombre antiguo, lo sigue leyendo la app ya publicada.
    responseSeconds: settings.secondsPerQuestion,
    sessionSeconds: settings.sessionSeconds,
    wordSource: settings.wordSource,
    ...extra,
  }
}

/** Lee la configuración guardada (también la de los desafíos creados antes de este cambio). */
export function readModeSettings(typeId: string, metadata: unknown): ModeSettings | null {
  const defaults = MODE_DEFAULTS[typeId]
  if (!defaults) return null
  const data = isRecord(metadata) ? metadata : {}
  const wordSource: WordSource = data.wordSource === 'mixed' ? 'mixed' : 'own'

  if (defaults.format === 'lightning') {
    return {
      typeId,
      kind: defaults.kind,
      format: 'lightning',
      rounds: 1,
      questionsPerRound: LIGHTNING_POOL_SIZE,
      totalQuestions: LIGHTNING_POOL_SIZE,
      secondsPerQuestion: 0,
      sessionSeconds: clampInt(data.sessionSeconds, 20, 180, defaults.sessionSeconds || 60),
      wordSource,
    }
  }

  const rounds = toRounds(data.rounds, defaults.kind)
  return {
    typeId,
    kind: defaults.kind,
    format: 'turns',
    rounds,
    questionsPerRound: TURN_QUESTIONS_TOTAL / rounds,
    totalQuestions: TURN_QUESTIONS_TOTAL,
    secondsPerQuestion: clampInt(
      data.secondsPerQuestion ?? data.responseSeconds,
      3,
      maxSecondsFor(defaults.kind),
      defaults.secondsPerQuestion,
    ),
    sessionSeconds: null,
    wordSource,
  }
}

// ---------------------------------------------------------------------------
// Estado de cada jugador, tiempo, rondas y turnos
// ---------------------------------------------------------------------------

export type CurrentQuestion = { index: number; servedAt: string }

export type CompetitorGameState = {
  answered: number
  correct: number
  completedAt: string | null
  current: CurrentQuestion | null
  sessionStartedAt: string | null
  sessionEndsAt: string | null
}

export function readGameState(payload: unknown): CompetitorGameState {
  const data = isRecord(payload) ? payload : {}
  const game = isRecord(data.game) ? data.game : {}
  const legacy = isRecord(data.ownWords) ? data.ownWords : {}
  const current = isRecord(game.current) ? game.current : null
  const currentIndex = current ? Number(current.index) : NaN
  const currentServedAt = current ? toText(current.servedAt) : ''

  return {
    answered: Math.max(0, Number(game.answered ?? legacy.answeredQuestions ?? 0) || 0),
    correct: Math.max(0, Number(game.correct ?? legacy.score ?? 0) || 0),
    completedAt: toText(game.completedAt) || toText(legacy.completedAt) || null,
    current:
      Number.isInteger(currentIndex) && currentIndex >= 0 && currentServedAt
        ? { index: currentIndex, servedAt: currentServedAt }
        : null,
    sessionStartedAt: toText(game.sessionStartedAt) || null,
    sessionEndsAt: toText(game.sessionEndsAt) || null,
  }
}

export function isLightningSessionOver(state: CompetitorGameState, nowMs: number): boolean {
  if (!state.sessionEndsAt) return false
  const endsAt = Date.parse(state.sessionEndsAt)
  return Number.isFinite(endsAt) && nowMs > endsAt + LIGHTNING_GRACE_MS
}

export function isCompetitorDone(input: {
  settings: ModeSettings
  state: CompetitorGameState
  answeredCount: number
  nowMs: number
}): boolean {
  if (input.state.completedAt) return true
  if (input.settings.format === 'lightning') {
    return isLightningSessionOver(input.state, input.nowMs) || input.answeredCount >= input.settings.totalQuestions
  }
  return input.answeredCount >= input.settings.totalQuestions
}

/** ¿Llega a tiempo esta respuesta? (el servidor manda, el reloj del móvil solo ayuda) */
export function isAnswerInTime(input: {
  settings: ModeSettings
  servedAtMs: number
  nowMs: number
  clientMs: number | null
  sessionEndsAtMs: number | null
}): boolean {
  if (input.settings.format === 'lightning') {
    if (input.sessionEndsAtMs === null || !Number.isFinite(input.sessionEndsAtMs)) return false
    return input.nowMs <= input.sessionEndsAtMs + LIGHTNING_GRACE_MS
  }
  const limitMs = input.settings.secondsPerQuestion * 1000
  const clientOk = input.clientMs === null || input.clientMs <= limitMs + 400
  const serverOk = input.nowMs - input.servedAtMs <= limitMs + FEEDBACK_ALLOWANCE_MS + NETWORK_GRACE_MS
  return clientOk && serverOk
}

/** Si el alumno cerró la app con una pregunta abierta y ya no le da tiempo, cuenta como fallo. */
export function isPendingQuestionStale(input: {
  settings: ModeSettings
  servedAtMs: number
  nowMs: number
}): boolean {
  if (input.settings.format === 'lightning') return false
  const limitMs = input.settings.secondsPerQuestion * 1000
  return input.nowMs - input.servedAtMs > limitMs + FEEDBACK_ALLOWANCE_MS + NETWORK_GRACE_MS
}

export function remainingQuestionMs(input: {
  settings: ModeSettings
  servedAtMs: number
  nowMs: number
}): number {
  const limitMs = input.settings.secondsPerQuestion * 1000
  return Math.max(0, Math.min(limitMs, limitMs - (input.nowMs - input.servedAtMs)))
}

export function roundInfo(settings: ModeSettings, answered: number) {
  const perRound = Math.max(1, settings.questionsPerRound)
  const roundNumber = Math.min(settings.rounds, Math.floor(answered / perRound) + 1)
  return {
    roundNumber,
    roundsTotal: settings.rounds,
    positionInRound: (answered % perRound) + 1,
    questionsInRound: perRound,
  }
}

/** Tras responder la pregunta nº `answered` (contando desde 1): ¿se acaba la ronda? */
export function isRoundFinished(settings: ModeSettings, answered: number): boolean {
  if (settings.format === 'lightning') return false
  return answered >= settings.totalQuestions || answered % Math.max(1, settings.questionsPerRound) === 0
}

export function nextTurnUserId(input: {
  me: string
  rival: string
  meDone: boolean
  rivalDone: boolean
}): string | null {
  if (input.meDone && input.rivalDone) return null
  if (input.rivalDone) return input.me
  return input.rival
}

/**
 * Gana quien más acierte. En Parejas, si empatan, gana quien haya tardado menos
 * (tiempo medido en el servidor).
 */
export function decideResult(
  challengerScore: number,
  challengedScore: number,
  tiebreak?: { challengerMs: number; challengedMs: number } | null,
): 'challenger_win' | 'challenged_win' | 'draw' {
  if (challengerScore > challengedScore) return 'challenger_win'
  if (challengedScore > challengerScore) return 'challenged_win'
  if (
    tiebreak &&
    Number.isFinite(tiebreak.challengerMs) &&
    Number.isFinite(tiebreak.challengedMs) &&
    tiebreak.challengerMs !== tiebreak.challengedMs
  ) {
    return tiebreak.challengerMs < tiebreak.challengedMs ? 'challenger_win' : 'challenged_win'
  }
  return 'draw'
}

export function usesTimeTiebreak(kind: QuestionKind): boolean {
  return kind === 'pairs'
}
