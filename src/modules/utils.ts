import { IMPORTANCE_ORDER } from './constants'
import type { Lexicard } from './types'

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

export function sortByPriority(cards: Lexicard[]): Lexicard[] {
  return [...cards].sort((a, b) => {
    const aF = (a.streak || 0) === 0
    const bF = (b.streak || 0) === 0
    const aI = IMPORTANCE_ORDER[a.importance] ?? 4
    const bI = IMPORTANCE_ORDER[b.importance] ?? 4
    const aP = (aF ? 0 : 5) + aI
    const bP = (bF ? 0 : 5) + bI
    if (aP !== bP) return aP - bP
    return (a.lastReviewed || 0) - (b.lastReviewed || 0)
  })
}

export function sortChronological(cards: Lexicard[]): Lexicard[] {
  return [...cards].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

export function updateCardAfterReview(card: Lexicard, knew: boolean): Lexicard {
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
    }
  }
  return {
    ...card,
    interval: 1,
    easeFactor: Math.max(1.3, ef - 0.2),
    streak: 0,
    lastReviewed: Date.now(),
  }
}
