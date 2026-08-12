import { supabase } from '../../lib/supabase'
import {
  notifyActivationMetricsChanged,
  notifyCreationMetricsChanged,
} from './creationMetricsSync'
import type { PhraseGenerationEntry } from '../types'

type FetchPhraseHistoryPageInput = {
  limit?: number
  offset?: number
  targetLang?: string
}

type FetchPhraseHistoryPageResult = {
  items: PhraseGenerationEntry[]
  hasMore: boolean
}

const SCRIPT_BY_LANGUAGE: Record<string, RegExp> = {
  Japonés: /[\u3040-\u30ff\u4e00-\u9faf]/,
  Chino: /[\u4e00-\u9fff]/,
  Coreano: /[\uac00-\ud7af]/,
  Tailandés: /[\u0E00-\u0E7F]/,
  Hindi: /[\u0900-\u097F]/,
  Árabe: /[\u0600-\u06FF]/,
  Hebreo: /[\u0590-\u05FF]/,
}

function scriptMatchesTarget(phrase: string | null, targetLang: string): boolean {
  const text = (phrase || '').trim()
  if (!text) return false

  const script = SCRIPT_BY_LANGUAGE[targetLang]
  if (!script) return true
  return script.test(text)
}

export async function fetchPhraseHistory(
  limit = 30,
  targetLang?: string,
): Promise<PhraseGenerationEntry[]> {
  const { items } = await fetchPhraseHistoryPage({
    limit,
    offset: 0,
    targetLang,
  })
  return items
}

export async function fetchPhraseHistoryPage({
  limit = 30,
  offset = 0,
  targetLang,
}: FetchPhraseHistoryPageInput = {}): Promise<FetchPhraseHistoryPageResult> {
  if (!supabase) return { items: [], hasMore: false }

  const safeLimit = Math.max(1, Math.floor(limit))
  const safeOffset = Math.max(0, Math.floor(offset))
  const from = safeOffset
  const to = safeOffset + safeLimit - 1

  const baseSelect = 'id, source_words, generated_phrase, translation, model, created_at'
  const selectWithLang = `${baseSelect}, target_lang, native_lang`

  if (targetLang) {
    const scoped = await supabase
      .from('phrase_generations')
      .select(selectWithLang)
      .eq('success', true)
      .eq('target_lang', targetLang)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!scoped.error) {
      const items = (scoped.data || []) as PhraseGenerationEntry[]
      return {
        items,
        hasMore: items.length === safeLimit,
      }
    }
  }

  const fallback = await supabase
    .from('phrase_generations')
    .select(baseSelect)
    .eq('success', true)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (fallback.error) {
    throw fallback.error
  }

  const rows = (fallback.data || []) as PhraseGenerationEntry[]
  if (!targetLang) {
    return {
      items: rows,
      hasMore: rows.length === safeLimit,
    }
  }

  return {
    items: rows.filter((row) => scriptMatchesTarget(row.generated_phrase, targetLang)),
    hasMore: rows.length === safeLimit,
  }
}

export async function fetchPhraseHistoryByIds(
  phraseIds: string[],
): Promise<PhraseGenerationEntry[]> {
  if (!supabase) return []

  const ids = Array.from(new Set(phraseIds.filter(Boolean)))
  if (ids.length === 0) return []

  const baseSelect = 'id, source_words, generated_phrase, translation, model, created_at'
  const selectWithLang = `${baseSelect}, target_lang, native_lang`
  const batchSize = 200
  const rows: PhraseGenerationEntry[] = []

  for (let index = 0; index < ids.length; index += batchSize) {
    const batchIds = ids.slice(index, index + batchSize)

    const withLang = await supabase
      .from('phrase_generations')
      .select(selectWithLang)
      .eq('success', true)
      .in('id', batchIds)

    if (!withLang.error) {
      rows.push(...((withLang.data || []) as PhraseGenerationEntry[]))
      continue
    }

    const fallback = await supabase
      .from('phrase_generations')
      .select(baseSelect)
      .eq('success', true)
      .in('id', batchIds)

    if (fallback.error) {
      throw fallback.error
    }

    rows.push(...((fallback.data || []) as PhraseGenerationEntry[]))
  }

  return rows
}

export async function deletePhraseHistoryEntry(id: string): Promise<void> {
  if (!supabase) return

  const { error } = await supabase
    .from('phrase_generations')
    .delete()
    .eq('id', id)

  if (error) {
    throw error
  }

  notifyCreationMetricsChanged()
  notifyActivationMetricsChanged()
}

export async function fetchPhraseHistoryEntry(
  id: string,
): Promise<PhraseGenerationEntry | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('phrase_generations')
    .select(
      'id, source_words, generated_phrase, translation, model, target_lang, native_lang, created_at',
    )
    .eq('id', id)
    .eq('success', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as PhraseGenerationEntry | null) || null
}
