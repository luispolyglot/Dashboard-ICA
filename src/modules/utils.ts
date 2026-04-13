import { IMPORTANCE_ORDER } from './constants'
import type { Lexicard } from './types'

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
