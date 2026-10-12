import { uiLocale } from '@/i18n'
import { IMPORTANCE_ORDER } from './constants'
import type { Lexicard, ReviewMode } from './types'

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function shiftIsoDay(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1))
  date.setUTCDate(date.getUTCDate() + days)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateTime(
  value: string | null | undefined,
  fallback = 'No disponible',
): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString()
}

export function formatDate(
  value: string | null | undefined,
  fallback = 'No disponible',
): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString(uiLocale())
}

function isCardFailed(card: Lexicard): boolean {
  return (card.streak || 0) === 0 && card.lastReviewed !== null
}

function isCardNew(card: Lexicard): boolean {
  return (card.streak || 0) === 0 && card.lastReviewed === null
}

function isCardGraduated(card: Lexicard): boolean {
  return (card.streak || 0) >= 10
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const REVIEW_MIN_DECK_FOR_NEW_COOLDOWN = 20
const REVIEW_NEW_CARD_COOLDOWN_DAYS = 2
const REVIEW_MAX_NEW_CARDS_PER_ROUND = 2
// A word answered «No la sabía» rests 10 minutes before it can come up in a new round (Luis,
// 12 Oct: leaving and coming back showed it first again, right away).
export const REVIEW_FAILED_REST_MS = 10 * 60 * 1000
// Cuánto pesa la frecuencia frente al estado de la tarjeta al elegir qué sale.
const REVIEW_IMPORTANCE_WEIGHT = 1.5

function getSuccessfulCadenceSessions(streak: number): number {
  if (streak <= 1) return 1
  if (streak <= 3) return 2
  if (streak <= 7) return 4
  return 0
}

function isSuccessfulCardDue(card: Lexicard, currentSession: number): boolean {
  const streak = card.streak || 0
  if (streak <= 0 || isCardGraduated(card)) return false

  if (streak >= 8) {
    const lastReviewed = card.lastReviewed || 0
    if (!lastReviewed) return true
    return Date.now() - lastReviewed >= 7 * MS_PER_DAY
  }

  const cadence = getSuccessfulCadenceSessions(streak)
  if (cadence <= 1) return true

  const lastSeenSession = card.lastSeenSession ?? -Infinity
  const elapsed = currentSession - lastSeenSession
  return elapsed >= cadence
}

export function getStreak(completedDays: string[]): number {
  if (!completedDays || completedDays.length === 0) return 0

  const sorted = [...new Set(completedDays)].sort().reverse()
  const sortedSet = new Set(sorted)
  const today = todayKey()
  const yesterday = shiftIsoDay(today, -1)

  if (sorted[0] !== today && sorted[0] !== yesterday) return 0

  let streak = 0
  let cursor = sorted[0] === today ? today : yesterday

  for (let i = 0; i < 365; i++) {
    if (sortedSet.has(cursor)) {
      streak++
      cursor = shiftIsoDay(cursor, -1)
    } else break
  }

  return streak
}

export function getStreakWithSaved(
  completedDays: string[],
  savedDays: string[],
  pendingFrozenDay?: string | null,
): number {
  if (
    (!completedDays || completedDays.length === 0)
    && (!savedDays || savedDays.length === 0)
    && !pendingFrozenDay
  ) {
    return 0
  }

  const completedSet = new Set(completedDays || [])
  const continuitySet = new Set([
    ...(completedDays || []),
    ...(savedDays || []),
    ...(pendingFrozenDay ? [pendingFrozenDay] : []),
  ])
  if (continuitySet.size === 0) return 0

  const sorted = [...continuitySet].sort().reverse()
  const today = todayKey()
  const yesterday = shiftIsoDay(today, -1)

  if (sorted[0] !== today && sorted[0] !== yesterday) return 0

  let streak = 0
  let cursor = sorted[0] === today ? today : yesterday

  for (let i = 0; i < 365; i++) {
    if (!continuitySet.has(cursor)) break
    if (completedSet.has(cursor)) streak++
    cursor = shiftIsoDay(cursor, -1)
  }

  return streak
}

export function sortByPriority(cards: Lexicard[], currentSession: number): Lexicard[] {
  const dueCards = cards.filter((card) => {
    if (isCardGraduated(card)) return false
    if (isCardFailed(card) || isCardNew(card)) return true
    return isSuccessfulCardDue(card, currentSession)
  })

  return dueCards.sort((a, b) => {
    const aFailed = isCardFailed(a)
    const bFailed = isCardFailed(b)
    if (aFailed !== bFailed) return aFailed ? -1 : 1

    const aNew = isCardNew(a)
    const bNew = isCardNew(b)
    if (aNew !== bNew) return aNew ? -1 : 1

    const aImportance = IMPORTANCE_ORDER[a.importance] ?? 4
    const bImportance = IMPORTANCE_ORDER[b.importance] ?? 4
    if (aImportance !== bImportance) return aImportance - bImportance

    return (a.lastReviewed || 0) - (b.lastReviewed || 0)
  })
}

export function sortChronological(cards: Lexicard[]): Lexicard[] {
  return [...cards].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

/** A word failed less than 10 minutes ago: it waits, unless there is nothing else to play. */
function isCardResting(card: Lexicard, now: number): boolean {
  if (!isCardFailed(card)) return false
  const lastReviewed = card.lastReviewed || 0
  return lastReviewed > 0 && now - lastReviewed < REVIEW_FAILED_REST_MS
}

function getNewCardAgeDays(card: Lexicard, now: number): number {
  if (!card.createdAt) return 0
  return Math.max(0, Math.floor((now - card.createdAt) / MS_PER_DAY))
}

function isCardInNewCooldown(
  card: Lexicard,
  totalDeckSize: number,
  now: number,
): boolean {
  if (!isCardNew(card)) return false
  if (totalDeckSize < REVIEW_MIN_DECK_FOR_NEW_COOLDOWN) return false
  return getNewCardAgeDays(card, now) < REVIEW_NEW_CARD_COOLDOWN_DAYS
}

// FLASHCARDS POR FECHAS (Luis, 12 Oct, como Anki): every word has a moment when it is due.
// - Failed: 10 minutes after the answer.
// - Known (1 or more right in a row): `interval` days after the last answer (1, 3, then x2.5…).
//   Words with 10 right in a row are no longer retired: they keep coming back, months apart.
// - New: right away (with the limits for new words of each round).
// A round takes the due words first; if they are not enough, it is filled with the words that are
// due soonest. A word failed less than 10 minutes ago only comes back when there is nothing else.
type ReviewBucket = 'failed' | 'dueReview' | 'newEligible' | 'notDue' | 'newCooling' | 'resting'

const REVIEW_MAX_INTERVAL_DAYS = 365
const REVIEW_MAX_EASE = 2.5

/** When the word is due again (ms). New words: now. */
export function getCardDueAt(card: Lexicard, now = Date.now()): number {
  if (isCardNew(card)) return now
  const lastReviewed = card.lastReviewed || 0
  if (!lastReviewed) return now
  if (isCardFailed(card)) return lastReviewed + REVIEW_FAILED_REST_MS
  const days = Math.min(REVIEW_MAX_INTERVAL_DAYS, Math.max(1, card.interval || 1))
  return lastReviewed + days * MS_PER_DAY
}

function getReviewBucket(card: Lexicard, totalDeckSize: number, now: number): ReviewBucket {
  if (isCardResting(card, now)) return 'resting'
  if (isCardFailed(card)) return 'failed'
  if (isCardNew(card)) {
    return isCardInNewCooldown(card, totalDeckSize, now) ? 'newCooling' : 'newEligible'
  }
  return getCardDueAt(card, now) <= now ? 'dueReview' : 'notDue'
}

function getReviewBucketPriority(bucket: ReviewBucket): number {
  if (bucket === 'failed') return 0
  if (bucket === 'dueReview') return 1
  if (bucket === 'newEligible') return 3
  if (bucket === 'notDue') return 4
  if (bucket === 'newCooling') return 5
  return 6
}

function isDueBucket(bucket: ReviewBucket): boolean {
  return bucket === 'failed' || bucket === 'dueReview' || bucket === 'newEligible'
}

function sortRoundByReviewPriority(cards: Lexicard[], totalDeckSize: number, now: number): Lexicard[] {
  const info = new Map(
    cards.map((card) => [
      card.id,
      {
        bucket: getReviewBucket(card, totalDeckSize, now),
        importance: IMPORTANCE_ORDER[card.importance] ?? 4,
        dueAt: getCardDueAt(card, now),
      },
    ]),
  )
  return [...cards].sort((a, b) => {
    const x = info.get(a.id)!
    const y = info.get(b.id)!

    // Due words first; the rest only fill the round.
    const xDue = isDueBucket(x.bucket)
    const yDue = isDueBucket(y.bucket)
    if (xDue !== yDue) return xDue ? -1 : 1

    if (xDue) {
      // Frequency weighs a lot: a due Vital word goes before a failed Rare one.
      const xScore = getReviewBucketPriority(x.bucket) + x.importance * REVIEW_IMPORTANCE_WEIGHT
      const yScore = getReviewBucketPriority(y.bucket) + y.importance * REVIEW_IMPORTANCE_WEIGHT
      if (xScore !== yScore) return xScore - yScore
      if (x.importance !== y.importance) return x.importance - y.importance
      // The longest overdue first.
      if (x.dueAt !== y.dueAt) return x.dueAt - y.dueAt
    } else {
      const bucketDiff = getReviewBucketPriority(x.bucket) - getReviewBucketPriority(y.bucket)
      if (bucketDiff !== 0) return bucketDiff
      // Filling the round: the words that are due soonest.
      if (x.dueAt !== y.dueAt) return x.dueAt - y.dueAt
      if (x.importance !== y.importance) return x.importance - y.importance
    }

    const streakDiff = (a.streak || 0) - (b.streak || 0)
    if (streakDiff !== 0) return streakDiff
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
}

export function buildReviewRound(
  cards: Lexicard[],
  mode: ReviewMode,
  roundSize: number,
  currentSession = 0,
  totalDeckSize = cards.length,
  options: {
    /**
     * «Solo por aprender»: el alumno pide justo las palabras pendientes (casi todas nuevas), así
     * que no se aplica el tope de nuevas por ronda ni la espera de 2 días. Antes solo salían 2.
     */
    ignoreNewCardLimits?: boolean
  } = {},
): Lexicard[] {
  if (cards.length === 0 || roundSize <= 0) return []

  const uniquePool = cards.filter(
    (card, index, self) => self.findIndex((value) => value.id === card.id) === index,
  )

  const modePool =
    mode === 'mixed'
      ? uniquePool
      : uniquePool.filter((card) => card.importance === mode)
  if (modePool.length === 0) return []

  const now = Date.now()
  // `currentSession` no longer decides anything: words come back by date (kept for the callers).
  void currentSession
  const sortedPool = sortRoundByReviewPriority(modePool, totalDeckSize, now)
  const selected: Lexicard[] = []
  const deferredByNewLimit: Lexicard[] = []
  const deferredByCooldown: Lexicard[] = []
  const deferredByRest: Lexicard[] = []
  const enforceNewExposureControls =
    !options.ignoreNewCardLimits && totalDeckSize >= REVIEW_MIN_DECK_FOR_NEW_COOLDOWN
  const maxNewPerRound = Math.max(
    1,
    enforceNewExposureControls
      ? Math.min(REVIEW_MAX_NEW_CARDS_PER_ROUND, Math.floor(roundSize / 4) || 1)
      : roundSize,
  )
  let includedNewCards = 0

  // Boosted words (Potenciar, Luis 8 Oct) come first, without the limits for new words.
  for (const card of sortedPool) {
    if (selected.length >= roundSize) break
    if ((card.boostFlash ?? 0) > 0 && !isCardResting(card, now)) selected.push(card)
  }

  for (const card of sortedPool) {
    if (selected.length >= roundSize) break
    if (isCardResting(card, now)) {
      deferredByRest.push(card)
      continue
    }
    if ((card.boostFlash ?? 0) > 0) continue

    const isNew = isCardNew(card)
    if (!isNew) {
      selected.push(card)
      continue
    }

    if (enforceNewExposureControls && isCardInNewCooldown(card, totalDeckSize, now)) {
      deferredByCooldown.push(card)
      continue
    }

    if (includedNewCards >= maxNewPerRound) {
      deferredByNewLimit.push(card)
      continue
    }

    selected.push(card)
    includedNewCards += 1
  }

  const shouldUseDeferredNewCards =
    selected.length === 0 || !enforceNewExposureControls
  if (shouldUseDeferredNewCards) {
    for (const card of deferredByNewLimit) {
      if (selected.length >= roundSize) break
      selected.push(card)
    }
  }

  const shouldUseCooldownCards = selected.length === 0
  if (shouldUseCooldownCards) {
    for (const card of deferredByCooldown) {
      if (selected.length >= roundSize) break
      selected.push(card)
    }
  }

  // Only when there is nothing else at all, the words failed a moment ago come back.
  if (selected.length === 0) {
    for (const card of deferredByRest) {
      if (selected.length >= roundSize) break
      selected.push(card)
    }
  }

  return selected.slice(0, roundSize)
}

export function updateCardAfterReview(
  card: Lexicard,
  knew: boolean,
  currentSession: number,
): Lexicard {
  const now = Date.now()
  // ×2.5 at most (Luis, 12 Oct): the ease used to keep rising (2.6, 2.7…) with every right answer.
  const ef = Math.min(REVIEW_MAX_EASE, card.easeFactor || REVIEW_MAX_EASE)
  const interval = card.interval || 1
  const streak = card.streak || 0
  if (knew) {
    // A known word that came out early, only to fill the round: right again, but its next date
    // does not jump ahead (otherwise a word added today could reach 64 days in one afternoon).
    if (streak > 0 && getCardDueAt(card, now) > now) {
      return {
        ...card,
        streak: streak + 1,
        lastReviewed: now,
        lastSeenSession: currentSession,
      }
    }
    const ni = Math.min(REVIEW_MAX_INTERVAL_DAYS, streak === 0 ? 1 : streak === 1 ? 3 : Math.round(interval * ef))
    return {
      ...card,
      interval: ni,
      easeFactor: Math.min(REVIEW_MAX_EASE, Math.max(1.3, ef + 0.1)),
      streak: streak + 1,
      lastReviewed: now,
      lastSeenSession: currentSession,
    }
  }
  return {
    ...card,
    interval: 1,
    easeFactor: Math.max(1.3, ef - 0.2),
    streak: 0,
    lastReviewed: now,
    lastSeenSession: currentSession,
  }
}
