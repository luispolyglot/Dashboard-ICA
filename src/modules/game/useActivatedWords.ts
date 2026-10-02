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
      flashcardsUnlocked: activatedWords >= FLASHCARDS_MIN_ACTIVATED_WORDS,
      missingForFlashcards: Math.max(0, FLASHCARDS_MIN_ACTIVATED_WORDS - activatedWords),
    }
  }, [cards, metaTrackerTotal])
}
