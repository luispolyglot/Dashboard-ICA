import { normalizeLoose } from '../../../../supabase/functions/ica-challenges-center/engine.ts'

/**
 * REPASO DEL MES (Luis, 9 Oct): the rules that do not depend on the screen.
 * The window (days 21 to 28), the minimum of 20 words and the prize are decided by the server
 * (see supabase/migrations/20261010120000_monthly_review.sql); here only what the game itself needs.
 */

export type Rng = () => number

export type ReviewRound = 'reading' | 'listening' | 'writing'

export const REVIEW_ROUNDS: readonly ReviewRound[] = ['reading', 'listening', 'writing']

/** Questions per round. Listening can end up with fewer: «No puedo escucharlo ahora» does not count. */
export const REVIEW_ROUND_SIZE: Record<ReviewRound, number> = { reading: 4, listening: 4, writing: 6 }
export const REVIEW_TOTAL_QUESTIONS = 14
/** At most this many questions of the same kind in a row. */
export const REVIEW_MAX_SAME_KIND_IN_A_ROW = 2
/** Below this many phrases in the month, the phrase questions become word questions. */
export const REVIEW_MIN_PHRASES = 2
/** A word of at least this many letters with ONE wrong letter is «¡Casi!» and counts as right. */
export const REVIEW_ALMOST_MIN_LENGTH = 6
/** «X de cada 10» up to this is a low score: an encouraging message and the option to repeat it (practice). */
export const REVIEW_LOW_SCORE_MAX = 4

export function isLowReviewScore(rememberedOfTen: number): boolean {
  return rememberedOfTen <= REVIEW_LOW_SCORE_MAX
}

export type ReviewKind =
  | 'meaning'
  | 'cloze'
  | 'pick-word'
  | 'listen-meaning'
  | 'listen-write'
  | 'complete-expression'
  | 'complete-word'
  | 'write-word'
  | 'order-phrase'

export type ReviewPoolItem = { id: string; target: string; native: string }

/** What the server sends: the student's words (and expressions) and phrases of the month. */
export type ReviewPool = { words: ReviewPoolItem[]; phrases: ReviewPoolItem[] }

type QuestionBase = {
  id: string
  round: ReviewRound
  /** Native-language meaning of the item (always shown to the student at some point). */
  native: string
  /** The item in the language being learned (shown in the feedback). */
  target: string
  /** Word (lexicard) id, to boost it if missed. Null for phrases. */
  wordId: string | null
  /** Where it comes from: a phrase of the month, or a word / expression of the Baúl ICA. */
  source: 'phrase' | 'word'
}

export type ReviewChoiceQuestion = QuestionBase & {
  mode: 'choice'
  kind: 'meaning' | 'cloze' | 'pick-word' | 'listen-meaning'
  /** The text shown above the options (empty for listening: only the audio). */
  stem: string
  /** Text spoken for the listening question. */
  audioText: string | null
  options: string[]
  correctIndex: number
}

export type ReviewTypeQuestion = QuestionBase & {
  mode: 'type'
  kind: 'listen-write' | 'complete-expression' | 'complete-word' | 'write-word'
  /** What is shown to complete («Ja ____ tutaj», «p…a»); empty when only the audio/meaning is shown. */
  shown: string
  audioText: string | null
  /** Every accepted answer (synonyms of the meaning are accepted when listening). */
  accepted: string[]
  /** What the feedback shows as the right answer. */
  answerDisplay: string
  /** Which language the student types in. */
  answerLang: 'target' | 'native'
}

export type ReviewOrderQuestion = QuestionBase & {
  mode: 'order'
  kind: 'order-phrase'
  tiles: string[]
  solution: string[]
}

export type ReviewQuestion = ReviewChoiceQuestion | ReviewTypeQuestion | ReviewOrderQuestion

export type ReviewVerdict = 'correct' | 'almost' | 'wrong'

export type ReviewAnswer = {
  questionId: string
  round: ReviewRound
  wordId: string | null
  verdict: ReviewVerdict
  /** «No puedo escucharlo ahora»: the question does not count. */
  skipped: boolean
}

export function isRight(verdict: ReviewVerdict): boolean {
  return verdict === 'correct' || verdict === 'almost'
}

/** Remembered words out of ten: the percentage rounded UP to the tens (86 % → 9, 74 % → 8). Same as the server. */
export function rememberedOfTen(correct: number, total: number): number {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return 0
  const safe = Math.max(0, Math.min(total, Math.floor(correct)))
  return Math.min(10, Math.floor((10 * safe + total - 1) / total))
}

export type RoundScore = { correct: number; total: number }
export type RoundScores = Record<ReviewRound, RoundScore>

export function scoreRounds(answers: ReviewAnswer[]): RoundScores {
  const scores: RoundScores = {
    reading: { correct: 0, total: 0 },
    listening: { correct: 0, total: 0 },
    writing: { correct: 0, total: 0 },
  }
  for (const answer of answers) {
    if (answer.skipped) continue
    scores[answer.round].total += 1
    if (isRight(answer.verdict)) scores[answer.round].correct += 1
  }
  return scores
}

export function totalScore(scores: RoundScores): RoundScore {
  return REVIEW_ROUNDS.reduce<RoundScore>(
    (sum, round) => ({ correct: sum.correct + scores[round].correct, total: sum.total + scores[round].total }),
    { correct: 0, total: 0 },
  )
}

/** The weakest round (lowest share of right answers); ties go to the earlier round. Null if all are perfect. */
export function weakestRound(scores: RoundScores): ReviewRound | null {
  let weakest: ReviewRound | null = null
  let weakestShare = 1
  for (const round of REVIEW_ROUNDS) {
    const { correct, total } = scores[round]
    if (total === 0) continue
    const share = correct / total
    if (share < weakestShare) {
      weakest = round
      weakestShare = share
    }
  }
  return weakest
}

// ---------------------------------------------------------------------------
// Typed answers
// ---------------------------------------------------------------------------

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * Correct, almost or wrong. Accents and capitals do not count, «ł» = «l» (normalizeLoose). One single
 * wrong letter in a word of 6 letters or more is «¡Casi!» and counts as right.
 */
export function gradeTyped(typed: string, accepted: string[]): ReviewVerdict {
  const answer = normalizeLoose(typed)
  if (!answer) return 'wrong'
  const forms = accepted.map((form) => normalizeLoose(form)).filter(Boolean)
  if (forms.some((form) => form === answer)) return 'correct'
  if (forms.some((form) => form.length >= REVIEW_ALMOST_MIN_LENGTH && editDistance(form, answer) === 1)) return 'almost'
  return 'wrong'
}

/** A native meaning can list synonyms («casa / hogar», «aquí, acá»): every one of them is accepted. */
export function splitAlternatives(text: string): string[] {
  const withoutBrackets = text.replace(/\([^)]*\)/g, ' ')
  const parts = withoutBrackets
    .split(/[/,;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length ? parts : [text.trim()].filter(Boolean)
}

/** Ordering: right when the tiles, put in order, read like the phrase (punctuation and accents aside). */
export function gradeOrder(placed: string[], solution: string[]): ReviewVerdict {
  return normalizeLoose(placed.join(' ')) === normalizeLoose(solution.join(' ')) ? 'correct' : 'wrong'
}

// ---------------------------------------------------------------------------
// Sequence: never more than two questions of the same kind in a row
// ---------------------------------------------------------------------------

export function maxRunOf<T>(items: T[], keyOf: (item: T) => string, before: string[] = []): number {
  let longest = 0
  let run = 0
  let last: string | null = null
  for (const key of [...before, ...items.map(keyOf)]) {
    run = key === last ? run + 1 : 1
    last = key
    longest = Math.max(longest, run)
  }
  return longest
}

/**
 * Orders the kinds of one round so that no kind repeats more than `maxRun` times in a row, also
 * with the end of the previous round (`before`). It shuffles until the order is valid; if the round
 * is so lopsided that shuffling rarely works, a greedy pass builds the best order it can.
 */
export function arrangeKinds<K extends string>(kinds: K[], before: K[], rng: Rng, maxRun = REVIEW_MAX_SAME_KIND_IN_A_ROW): K[] {
  const valid = (order: K[]) => maxRunOf(order, (kind) => kind, before) <= maxRun
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const order = shuffleWith(kinds, rng)
    if (valid(order)) return order
  }
  const remaining = new Map<K, number>()
  for (const kind of kinds) remaining.set(kind, (remaining.get(kind) ?? 0) + 1)
  const result: K[] = []
  const tail = [...before]
  while (result.length < kinds.length) {
    const last = tail[tail.length - 1]
    let lastRun = 0
    for (let index = tail.length - 1; index >= 0 && tail[index] === last; index -= 1) lastRun += 1
    const left = [...remaining.entries()].filter(([, count]) => count > 0)
    const allowed = left.filter(([kind]) => !(kind === last && lastRun >= maxRun))
    const pool = allowed.length ? allowed : left
    const most = Math.max(...pool.map(([, count]) => count))
    const best = pool.filter(([, count]) => count === most)
    const [pick] = best[Math.floor(rng() * best.length)]
    result.push(pick)
    tail.push(pick)
    remaining.set(pick, (remaining.get(pick) ?? 1) - 1)
  }
  return result
}

export function shuffleWith<T>(items: T[], rng: Rng): T[] {
  const copy = items.slice()
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}
