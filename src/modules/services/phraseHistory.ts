import { supabase } from '../../lib/supabase'
import type { PhraseGenerationEntry } from '../types'

export async function fetchPhraseHistory(limit = 30): Promise<PhraseGenerationEntry[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('phrase_generations')
    .select('id, source_words, generated_phrase, translation, model, created_at')
    .eq('success', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw error
  }

  return (data || []) as PhraseGenerationEntry[]
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
