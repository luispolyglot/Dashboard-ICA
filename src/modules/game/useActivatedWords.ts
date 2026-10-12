import { useMemo } from 'react'
import { useDashboardContext } from '../context/DashboardContext'
import type { Lexicard } from '../types'
import { FLASHCARDS_MIN_ACTIVATED_WORDS } from './rules'

/**
 * Palabras activadas = palabras ICA distintas que ya usaste en alguna frase de Creación.
 * Se mira tu baúl (cada palabra guarda cuántas veces se activó) y el total del
 * MetaTracker, que se actualiza al momento al crear una frase. Se usa el mayor.
 */
export function countActivatedWords(
  cards: Lexicard[],
  metaTrackerTotal?: number | null,
): number {
  const fromCards = (cards || []).filter((card) => (card.activationCount || 0) > 0).length
  return Math.max(fromCards, metaTrackerTotal ?? 0)
}

export function useActivatedWords(): {
  activatedWords: number
  flashcardsUnlocked: boolean
  missingForFlashcards: number
} {
  const { cards, metaTrackerProfile } = useDashboardContext()
  const metaTrackerTotal = metaTrackerProfile?.activationWordsTotal ?? null
  return useMemo(() => {
    const activatedWords = countActivatedWords(cards, metaTrackerTotal)
    return {
      activatedWords,
      // Students who already played flashcards keep them (Luis, 12 Oct, launch): the 20 activated
      // words only apply to those who never reviewed a word. Same rule as record_review_event.
      flashcardsUnlocked:
        activatedWords >= FLASHCARDS_MIN_ACTIVATED_WORDS || (cards || []).some((card) => card.lastReviewed != null),
      missingForFlashcards: Math.max(0, FLASHCARDS_MIN_ACTIVATED_WORDS - activatedWords),
    }
  }, [cards, metaTrackerTotal])
}
