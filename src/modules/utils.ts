import { IMPORTANCE_ORDER } from './constants'
import type { ImportanceKey, Lexicard, ReviewMode } from './types'

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
    const msPerDay = 24 * 60 * 60 * 1000
    return Date.now() - lastReviewed >= 7 * msPerDay
  }

  const cadence = getSuccessfulCadenceSessions(streak)
  if (cadence <= 1) return true

  const lastSeenSession = card.lastSeenSession ?? -Infinity
  const elapsed = currentSession - lastSeenSession
  return elapsed >= cadence
}

export function getStreak(completedDays: string[]): number {
  if (!completedDays || completedDays.length === 0) return 0
  const sorted = [...completedDays].sort().reverse()
  const today = todayKey()
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0
  let streak = 0
  const checkDate = new Date()
  if (sorted[0] !== today) checkDate.setDate(checkDate.getDate() - 1)
  for (let i = 0; i < 365; i++) {
    const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
    if (sorted.includes(key)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else break
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

function getCardWeight(card: Lexicard, mode: ReviewMode): number {
  const streak = card.streak || 0
  const interval = card.interval || 1
  const isNew = card.lastReviewed === null
  const isFailed = streak === 0 && card.lastReviewed !== null

  const baseByImportance: Record<ImportanceKey, number> = {
    vital: 1.2,
    frequent: 1,
    occasional: 0.85,
    rare: 0.72,
    irrelevant: 0.58,
  }

  const streakFactor = 1 / (1 + streak * 0.55)
  const intervalFactor = 1 / (1 + Math.max(0, interval - 1) * 0.08)
  const noveltyFactor = isNew ? 1.25 : 1
  const failedFactor = isFailed ? 1.35 : 1
  const modeBoost = mode !== 'mixed' && card.importance === mode ? 2.4 : 1

  return Math.max(
    0.03,
    (baseByImportance[card.importance] ?? 0.5) *
      streakFactor *
      intervalFactor *
      noveltyFactor *
      failedFactor *
      modeBoost,
  )
}

function pickWeightedOne(cards: Lexicard[], mode: ReviewMode): Lexicard | null {
  if (cards.length === 0) return null
  const weighted = cards.map((card) => ({ card, weight: getCardWeight(card, mode) }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return weighted[Math.floor(Math.random() * weighted.length)].card

  let target = Math.random() * total
  for (const item of weighted) {
    target -= item.weight
    if (target <= 0) return item.card
  }

  return weighted[weighted.length - 1].card
}

function pickWeightedMany(
  source: Lexicard[],
  count: number,
  mode: ReviewMode,
  excludedIds: Set<string>,
): Lexicard[] {
  const selected: Lexicard[] = []
  const localExcluded = new Set(excludedIds)

  while (selected.length < count) {
    const candidates = source.filter((card) => !localExcluded.has(card.id))
    if (candidates.length === 0) break
    const picked = pickWeightedOne(candidates, mode)
    if (!picked) break
    selected.push(picked)
    localExcluded.add(picked.id)
  }

  return selected
}

function sortRoundByLearningPriority(cards: Lexicard[]): Lexicard[] {
  return [...cards].sort((a, b) => {
    const aNew = (a.streak || 0) === 0 && a.lastReviewed === null
    const bNew = (b.streak || 0) === 0 && b.lastReviewed === null
    if (aNew !== bNew) return aNew ? -1 : 1

    const aStreak = a.streak || 0
    const bStreak = b.streak || 0
    if (aStreak !== bStreak) return aStreak - bStreak

    return (a.lastReviewed || 0) - (b.lastReviewed || 0)
  })
}

export function buildReviewRound(
  cards: Lexicard[],
  mode: ReviewMode,
  roundSize: number,
): Lexicard[] {
  if (cards.length === 0 || roundSize <= 0) return []

  const uniquePool = cards.filter(
    (card, index, self) => self.findIndex((value) => value.id === card.id) === index,
  )
  const selected: Lexicard[] = []
  const excluded = new Set<string>()

  if (mode === 'mixed') {
    const byImportance: Record<ImportanceKey, Lexicard[]> = {
      vital: uniquePool.filter((card) => card.importance === 'vital'),
      frequent: uniquePool.filter((card) => card.importance === 'frequent'),
      occasional: uniquePool.filter((card) => card.importance === 'occasional'),
      rare: uniquePool.filter((card) => card.importance === 'rare'),
      irrelevant: uniquePool.filter((card) => card.importance === 'irrelevant'),
    }

    const quotas: Array<{ key: ImportanceKey; count: number }> = [
      { key: 'vital', count: 4 },
      { key: 'frequent', count: 3 },
      { key: 'occasional', count: 2 },
    ]

    for (const quota of quotas) {
      const picks = pickWeightedMany(byImportance[quota.key], quota.count, mode, excluded)
      selected.push(...picks)
      for (const card of picks) excluded.add(card.id)
    }

    const warmPool = [...byImportance.rare, ...byImportance.irrelevant]
    const warmPick = pickWeightedMany(warmPool, 1, mode, excluded)
    selected.push(...warmPick)
    for (const card of warmPick) excluded.add(card.id)
  } else {
    const primary = uniquePool.filter((card) => card.importance === mode)
    const primaryPicks = pickWeightedMany(primary, roundSize, mode, excluded)
    selected.push(...primaryPicks)
    for (const card of primaryPicks) excluded.add(card.id)
    return sortRoundByLearningPriority(selected)
  }

  if (selected.length < roundSize) {
    const fillers = pickWeightedMany(uniquePool, roundSize - selected.length, mode, excluded)
    selected.push(...fillers)
  }

  return sortRoundByLearningPriority(selected)
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
