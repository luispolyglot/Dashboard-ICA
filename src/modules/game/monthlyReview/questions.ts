import { countWords, normalizeLoose } from '../../../../supabase/functions/ica-challenges-center/engine.ts'
import {
  REVIEW_MIN_PHRASES,
  REVIEW_ROUNDS,
  REVIEW_ROUND_SIZE,
  arrangeKinds,
  shuffleWith,
  splitAlternatives,
  type ReviewChoiceQuestion,
  type ReviewKind,
  type ReviewOrderQuestion,
  type ReviewPool,
  type ReviewPoolItem,
  type ReviewQuestion,
  type ReviewRound,
  type ReviewTypeQuestion,
  type Rng,
} from './rules'

/**
 * The 14 questions of the Repaso, built from the student's own words, expressions and phrases of
 * the month (the pool the server sends). Pure: the same pool and the same random numbers give the
 * same questions, which is how it is tested.
 *
 * Round 1 · Reading (4, you choose):  «¿Qué significa tu frase?» ×2 and «Completa tu frase» ×2.
 * Round 2 · Listening (4):            «Escucha y escribe» ×2 and «Escucha tu frase y elige» ×2.
 * Round 3 · Writing (6, you write):   «Completa tu expresión» ×2, «Completa la palabra» ×2 and
 *                                     «Ordena tu frase» ×2.
 * Without enough phrases (or phrases the question can use) the phrase questions become word ones.
 */

const SENTENCE_MIN_TOKENS = 3
const SENTENCE_MAX_TOKENS = 12
const EXPRESSION_MAX_WORDS = 6
const COMPLETE_WORD_MIN_LETTERS = 4
const OPTIONS = 3

type Source = 'phrase' | 'word'

type Slot = {
  kind: ReviewKind
  round: ReviewRound
  source: Source
  item: ReviewPoolItem
}

function tokensOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

function lettersOnly(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function letterCount(text: string): number {
  return Array.from(normalizeLoose(text).replace(/\s+/g, '')).length
}

function cleanItems(items: ReviewPoolItem[]): ReviewPoolItem[] {
  const seen = new Set<string>()
  const result: ReviewPoolItem[] = []
  for (const item of items) {
    const target = item.target.trim()
    const native = item.native.trim()
    if (!item.id || !target || !native) continue
    const key = normalizeLoose(target)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push({ id: item.id, target, native })
  }
  return result
}

const isSingleWord = (item: ReviewPoolItem) => countWords(item.target) === 1
const isExpression = (item: ReviewPoolItem) => {
  const words = countWords(item.target)
  return words >= 2 && words <= EXPRESSION_MAX_WORDS
}
const isSentence = (item: ReviewPoolItem) => {
  const tokens = tokensOf(item.target).length
  return tokens >= SENTENCE_MIN_TOKENS && tokens <= SENTENCE_MAX_TOKENS
}
const canListenAndWrite = (item: ReviewPoolItem) =>
  isSingleWord(item) && splitAlternatives(item.native).some((form) => countWords(form) === 1)
const canCompleteWord = (item: ReviewPoolItem) => isSingleWord(item) && letterCount(item.target) >= COMPLETE_WORD_MIN_LETTERS

/** Picks `count` distractors close in length to the right one, never equal to it or to each other. */
function pickDistractors(
  correct: string,
  candidates: string[],
  count: number,
  rng: Rng,
  forbidden: string[] = [],
): string[] {
  const taken = new Set<string>([normalizeLoose(correct), ...forbidden.map((value) => normalizeLoose(value))])
  const unique: string[] = []
  for (const candidate of shuffleWith(candidates, rng)) {
    const key = normalizeLoose(candidate)
    if (!key || taken.has(key)) continue
    taken.add(key)
    unique.push(candidate)
  }
  const length = correct.length
  unique.sort((a, b) => Math.abs(a.length - length) - Math.abs(b.length - length))
  // The closest in length, but not always the same trio: a few of the closest, then shuffled.
  return shuffleWith(unique.slice(0, count + 3), rng).slice(0, count)
}

function withCorrect(correct: string, distractors: string[], rng: Rng): { options: string[]; correctIndex: number } {
  const options = shuffleWith([correct, ...distractors], rng)
  return { options, correctIndex: options.indexOf(correct) }
}

export function buildReviewQuestions(pool: ReviewPool, rng: Rng = Math.random): ReviewQuestion[] {
  const words = cleanItems(pool.words)
  const allPhrases = cleanItems(pool.phrases)
  const phraseMode = allPhrases.length >= REVIEW_MIN_PHRASES
  if (words.length === 0) return []

  const usedWords = new Set<string>()
  const usedPhrases = new Set<string>()

  const takeWord = (prefer: (item: ReviewPoolItem) => boolean): ReviewPoolItem => {
    const free = words.filter((item) => !usedWords.has(item.id))
    const match = shuffleWith(free.filter(prefer), rng)[0] ?? shuffleWith(free, rng)[0] ?? shuffleWith(words, rng)[0]
    usedWords.add(match.id)
    return match
  }
  const takePhrase = (prefer: (item: ReviewPoolItem) => boolean): ReviewPoolItem | null => {
    if (!phraseMode) return null
    const match = shuffleWith(
      allPhrases.filter((item) => !usedPhrases.has(item.id) && prefer(item)),
      rng,
    )[0]
    if (!match) return null
    usedPhrases.add(match.id)
    return match
  }

  // 1. Phrase slots first, interleaved, so the few phrases a student may have reach every kind.
  const slots: Slot[] = []
  const phraseKinds: Array<{ kind: ReviewKind; round: ReviewRound; prefer: (item: ReviewPoolItem) => boolean; fallback: ReviewKind }> = [
    { kind: 'meaning', round: 'reading', prefer: () => true, fallback: 'meaning' },
    { kind: 'listen-meaning', round: 'listening', prefer: () => true, fallback: 'listen-meaning' },
    { kind: 'cloze', round: 'reading', prefer: isSentence, fallback: 'pick-word' },
    { kind: 'order-phrase', round: 'writing', prefer: isSentence, fallback: 'write-word' },
  ]
  const needsSentence = (kind: ReviewKind) => kind === 'cloze' || kind === 'order-phrase'
  const pendingWordSlots: Array<{ kind: ReviewKind; round: ReviewRound }> = []
  for (let copy = 0; copy < 2; copy += 1) {
    for (const entry of phraseKinds) {
      const phrase = needsSentence(entry.kind)
        ? takePhrase(entry.prefer)
        : takePhrase((item) => !isSentence(item)) ?? takePhrase(() => true)
      if (phrase) slots.push({ kind: entry.kind, round: entry.round, source: 'phrase', item: phrase })
      else pendingWordSlots.push({ kind: entry.fallback, round: entry.round })
    }
  }

  // 2. Word slots, the scarcest first so they get the words that suit them.
  const wordPlan: Array<{ kind: ReviewKind; round: ReviewRound; prefer: (item: ReviewPoolItem) => boolean }> = [
    { kind: 'complete-expression', round: 'writing', prefer: isExpression },
    { kind: 'complete-expression', round: 'writing', prefer: isExpression },
    { kind: 'listen-write', round: 'listening', prefer: canListenAndWrite },
    { kind: 'listen-write', round: 'listening', prefer: canListenAndWrite },
    { kind: 'complete-word', round: 'writing', prefer: canCompleteWord },
    { kind: 'complete-word', round: 'writing', prefer: canCompleteWord },
  ]
  for (const entry of wordPlan) {
    const item = takeWord(entry.prefer)
    const suits = entry.prefer(item)
    // No word fits (a student with no expressions, say): the slot becomes a plain «write the word».
    const kind: ReviewKind = suits ? entry.kind : entry.round === 'listening' ? 'listen-meaning' : 'write-word'
    slots.push({ kind, round: entry.round, source: 'word', item })
  }
  for (const pending of pendingWordSlots) {
    slots.push({ kind: pending.kind, round: pending.round, source: 'word', item: takeWord(() => true) })
  }

  // 3. Each round, in an order where no kind repeats more than twice in a row.
  const questions: ReviewQuestion[] = []
  let previousKinds: ReviewKind[] = []
  for (const round of REVIEW_ROUNDS) {
    const roundSlots = slots.filter((slot) => slot.round === round).slice(0, REVIEW_ROUND_SIZE[round])
    const order = arrangeKinds(
      roundSlots.map((slot) => slot.kind),
      previousKinds.slice(-2),
      rng,
    )
    const queue = shuffleWith(roundSlots, rng)
    for (const kind of order) {
      const index = queue.findIndex((slot) => slot.kind === kind)
      const [slot] = queue.splice(index, 1)
      questions.push(buildQuestion(slot, `${round}-${questions.length}`, words, allPhrases, rng))
    }
    previousKinds = order
  }
  return questions
}

function buildQuestion(slot: Slot, id: string, words: ReviewPoolItem[], phrases: ReviewPoolItem[], rng: Rng): ReviewQuestion {
  const { item, round } = slot
  const base = {
    id,
    round,
    native: item.native,
    target: item.target,
    wordId: slot.source === 'word' ? item.id : null,
    source: slot.source,
  }
  // The other items of the same source, for the wrong options.
  const sameSource = slot.source === 'phrase' ? phrases : words
  const natives = (list: ReviewPoolItem[]) => list.filter((other) => other.id !== item.id).map((other) => other.native)
  const meaningDistractors = () => {
    const near = pickDistractors(item.native, natives(sameSource), OPTIONS - 1, rng)
    if (near.length >= OPTIONS - 1) return near
    const more = pickDistractors(item.native, natives([...words, ...phrases]), OPTIONS - 1, rng, near)
    return [...near, ...more].slice(0, OPTIONS - 1)
  }

  switch (slot.kind) {
    case 'meaning':
    case 'listen-meaning': {
      const listening = slot.kind === 'listen-meaning'
      const { options, correctIndex } = withCorrect(item.native, meaningDistractors(), rng)
      const question: ReviewChoiceQuestion = {
        ...base,
        mode: 'choice',
        kind: slot.kind,
        stem: listening ? '' : item.target,
        audioText: listening ? item.target : null,
        options,
        correctIndex,
      }
      return question
    }
    case 'pick-word': {
      const targets = words.filter((other) => other.id !== item.id).map((other) => other.target)
      const { options, correctIndex } = withCorrect(item.target, pickDistractors(item.target, targets, OPTIONS - 1, rng), rng)
      const question: ReviewChoiceQuestion = { ...base, mode: 'choice', kind: 'pick-word', stem: item.native, audioText: null, options, correctIndex }
      return question
    }
    case 'cloze': {
      const tokens = tokensOf(item.target)
      const candidates = tokens
        .map((token, index) => ({ index, word: lettersOnly(token) }))
        .filter(({ word }) => Array.from(word).length >= 3)
      // Not the first word when another fits: its capital letter would give it away.
      const inside = candidates.filter(({ index }) => index > 0)
      const gap = shuffleWith(inside.length ? inside : candidates, rng)[0] ?? { index: tokens.length - 1, word: lettersOnly(tokens[tokens.length - 1]) }
      const stem = tokens
        .map((token, index) => (index === gap.index ? token.replace(gap.word, '____') : token))
        .join(' ')
      const inPhrase = tokens.map((token) => lettersOnly(token))
      // Wrong options: single words of the student's own words and phrases.
      const singles = [
        ...words.map((entry) => lettersOnly(entry.target)),
        ...phrases.flatMap((phrase) => tokensOf(phrase.target).map((token) => lettersOnly(token))),
      ].filter((word) => word && countWords(word) === 1 && Array.from(word).length >= 3)
      const { options, correctIndex } = withCorrect(gap.word, pickDistractors(gap.word, singles, OPTIONS - 1, rng, inPhrase), rng)
      const question: ReviewChoiceQuestion = { ...base, mode: 'choice', kind: 'cloze', stem, audioText: null, options, correctIndex }
      return question
    }
    case 'listen-write': {
      const question: ReviewTypeQuestion = {
        ...base,
        mode: 'type',
        kind: 'listen-write',
        shown: '',
        audioText: item.target,
        accepted: splitAlternatives(item.native),
        answerDisplay: item.native,
        answerLang: 'native',
      }
      return question
    }
    case 'complete-expression': {
      const tokens = tokensOf(item.target)
      const candidates = tokens
        .map((token, index) => ({ index, word: lettersOnly(token) }))
        .filter(({ word }) => word.length > 0)
      const long = candidates.filter(({ word }) => Array.from(word).length >= 3)
      const gap = shuffleWith(long.length ? long : candidates, rng)[0] ?? { index: 0, word: lettersOnly(tokens[0] ?? item.target) }
      const shown = tokens.map((token, index) => (index === gap.index ? token.replace(gap.word, '____') : token)).join(' ')
      const question: ReviewTypeQuestion = {
        ...base,
        mode: 'type',
        kind: 'complete-expression',
        shown,
        audioText: null,
        accepted: [gap.word],
        answerDisplay: item.target,
        answerLang: 'target',
      }
      return question
    }
    case 'complete-word': {
      const letters = Array.from(item.target.trim())
      const question: ReviewTypeQuestion = {
        ...base,
        mode: 'type',
        kind: 'complete-word',
        shown: `${letters[0]}…${letters[letters.length - 1]}`,
        audioText: null,
        accepted: [item.target],
        answerDisplay: item.target,
        answerLang: 'target',
      }
      return question
    }
    case 'order-phrase': {
      const solution = tokensOf(item.target)
      let tiles = shuffleWith(solution, rng)
      for (let attempt = 0; attempt < 20 && tiles.join(' ') === solution.join(' '); attempt += 1) tiles = shuffleWith(solution, rng)
      const question: ReviewOrderQuestion = { ...base, mode: 'order', kind: 'order-phrase', tiles, solution }
      return question
    }
    case 'write-word':
    default: {
      const question: ReviewTypeQuestion = {
        ...base,
        mode: 'type',
        kind: 'write-word',
        shown: '',
        audioText: null,
        accepted: [item.target],
        answerDisplay: item.target,
        answerLang: 'target',
      }
      return question
    }
  }
}
