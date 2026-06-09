import { useMemo } from 'react'
import type { Lexicard } from '../types'
import {
  extractWordsFromText,
  normalizeComparableText,
} from '../wordExtraction'

export type WordExtractionCandidate = {
  value: string
  alreadyExists: boolean
}

type UseWordExtractionCandidatesInput = {
  text: string
  targetLang: string
  cards: Lexicard[]
  seedWords?: string[]
}

export function useWordExtractionCandidates({
  text,
  targetLang,
  cards,
  seedWords,
}: UseWordExtractionCandidatesInput): {
  candidates: WordExtractionCandidate[]
  lowConfidence: boolean
} {
  return useMemo(() => {
    const byScope = cards.filter(
      (card) => !card.targetLang || card.targetLang === targetLang,
    )
    const existingWords = new Set(
      byScope.map((card) => normalizeComparableText(card.target)),
    )
    const extracted = extractWordsFromText(text, targetLang)
    const queue = [...(seedWords || []), ...extracted.tokens]
    const dedup = new Set<string>()
    const candidates: WordExtractionCandidate[] = []

    for (const item of queue) {
      const token = item.trim()
      if (!token) continue

      const normalized = normalizeComparableText(token)
      if (!normalized || dedup.has(normalized)) continue

      dedup.add(normalized)
      candidates.push({
        value: token,
        alreadyExists: existingWords.has(normalized),
      })
    }

    return {
      candidates,
      lowConfidence: extracted.lowConfidence,
    }
  }, [cards, seedWords, targetLang, text])
}
