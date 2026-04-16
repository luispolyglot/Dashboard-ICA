import { supabase } from '../../lib/supabase'
import type { PhraseGenerationEntry } from '../types'

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
  if (!supabase) return []

  const baseSelect = 'id, source_words, generated_phrase, translation, model, created_at'
  const selectWithLang = `${baseSelect}, target_lang, native_lang`

  if (targetLang) {
    const scoped = await supabase
      .from('phrase_generations')
      .select(selectWithLang)
      .eq('success', true)
      .eq('target_lang', targetLang)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!scoped.error) {
      return (scoped.data || []) as PhraseGenerationEntry[]
    }
  }

  const fallback = await supabase
    .from('phrase_generations')
    .select(baseSelect)
    .eq('success', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (fallback.error) {
    throw fallback.error
  }

  const rows = (fallback.data || []) as PhraseGenerationEntry[]
  if (!targetLang) return rows

  return rows.filter((row) => scriptMatchesTarget(row.generated_phrase, targetLang))
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
}
