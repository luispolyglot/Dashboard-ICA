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
  return date.toLocaleDateString('es-ES')
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

type ReviewBucket =
  | 'failed'
  | 'dueReview'
  | 'learning'
  | 'newEligible'
  | 'newCooling'
  | 'graduated'

function getReviewBucket(
  card: Lexicard,
  totalDeckSize: number,
  currentSession: number,
  now: number,
): ReviewBucket {
  if (isCardFailed(card)) return 'failed'
  if (isCardNew(card)) {
    return isCardInNewCooldown(card, totalDeckSize, now)
      ? 'newCooling'
      : 'newEligible'
  }
  if (isCardGraduated(card)) return 'graduated'
  if (isSuccessfulCardDue(card, currentSession)) return 'dueReview'
  return 'learning'
}

function getReviewBucketPriority(bucket: ReviewBucket): number {
  if (bucket === 'failed') return 0
  if (bucket === 'dueReview') return 1
  if (bucket === 'learning') return 2
  if (bucket === 'newEligible') return 3
  if (bucket === 'newCooling') return 4
  return 5
}

function sortRoundByReviewPriority(
  cards: Lexicard[],
  totalDeckSize: number,
  currentSession: number,
  now: number,
): Lexicard[] {
  return [...cards].sort((a, b) => {
    const aBucket = getReviewBucket(a, totalDeckSize, currentSession, now)
    const bBucket = getReviewBucket(b, totalDeckSize, currentSession, now)
    const bucketDiff =
      getReviewBucketPriority(aBucket) - getReviewBucketPriority(bBucket)
    if (bucketDiff !== 0) return bucketDiff

    const aImportance = IMPORTANCE_ORDER[a.importance] ?? 4
    const bImportance = IMPORTANCE_ORDER[b.importance] ?? 4
    if (aImportance !== bImportance) return aImportance - bImportance

    if (aBucket === 'newEligible' || aBucket === 'newCooling') {
      const ageDiff = getNewCardAgeDays(b, now) - getNewCardAgeDays(a, now)
      if (ageDiff !== 0) return ageDiff
    }

    if (aBucket === 'failed' || aBucket === 'dueReview' || aBucket === 'learning') {
      const reviewDiff = (a.lastReviewed || 0) - (b.lastReviewed || 0)
      if (reviewDiff !== 0) return reviewDiff
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
  const sortedPool = sortRoundByReviewPriority(
    modePool,
    totalDeckSize,
    currentSession,
    now,
  )
  const selected: Lexicard[] = []
  const deferredByNewLimit: Lexicard[] = []
  const deferredByCooldown: Lexicard[] = []
  const enforceNewExposureControls =
    totalDeckSize >= REVIEW_MIN_DECK_FOR_NEW_COOLDOWN
  const maxNewPerRound = Math.max(
    1,
    enforceNewExposureControls
      ? Math.min(REVIEW_MAX_NEW_CARDS_PER_ROUND, Math.floor(roundSize / 4) || 1)
      : roundSize,
  )
  let includedNewCards = 0

  for (const card of sortedPool) {
    if (selected.length >= roundSize) break

    const isNew = isCardNew(card)
    if (!isNew) {
      selected.push(card)
      continue
    }

    if (isCardInNewCooldown(card, totalDeckSize, now)) {
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

  return selected.slice(0, roundSize)
}

export function updateCardAfterReview(
  card: Lexicard,
  knew: boolean,
  currentSession: number,
): Lexicard {
  const ef = card.easeFactor || 2.5
  const interval = card.interval || 1
  const streak = card.streak || 0
  if (knew) {
    const ni = streak === 0 ? 1 : streak === 1 ? 3 : Math.round(interval * ef)
    return {
      ...card,
      interval: ni,
      easeFactor: Math.max(1.3, ef + 0.1),
      streak: streak + 1,
      lastReviewed: Date.now(),
      lastSeenSession: currentSession,
    }
  }
  return {
    ...card,
    interval: 1,
    easeFactor: Math.max(1.3, ef - 0.2),
    streak: 0,
    lastReviewed: Date.now(),
    lastSeenSession: currentSession,
  }
}
