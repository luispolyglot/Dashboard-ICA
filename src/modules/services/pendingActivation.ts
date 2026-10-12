import type { PhraseGenerationEntry, PhraseVoiceActivationEntry } from '../types'
import { fetchPhraseHistoryPage } from './phraseHistory'
import { fetchPhraseVoiceActivations } from './phraseVoiceActivations'

// FRASE POR ACTIVAR: la última frase creada, si aún no se ha grabado con la voz.
// Creación y Activación la enseñan arriba para que nadie se pierda entre la C y la A.

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * Solo cuenta la frase más reciente y solo si es de hoy: si el icademer creó otra después,
 * o la borró (y la última es de otro día), no se insiste. Las antiguas se activan desde la lista.
 */
export function pickPendingActivationPhrase(
  newestFirst: PhraseGenerationEntry[],
  activationsByPhrase: Record<string, PhraseVoiceActivationEntry[]>,
  now: Date = new Date(),
): PhraseGenerationEntry | null {
  const latest = newestFirst[0]
  if (!latest || !latest.generated_phrase?.trim()) return null
  if ((activationsByPhrase[latest.id] || []).length > 0) return null
  const createdAt = new Date(latest.created_at)
  if (Number.isNaN(createdAt.getTime()) || !sameLocalDay(createdAt, now)) return null
  return latest
}

export async function fetchPendingActivationPhrase(targetLang: string): Promise<PhraseGenerationEntry | null> {
  const { items } = await fetchPhraseHistoryPage({ limit: 3, offset: 0, targetLang })
  const latest = items[0]
  if (!latest) return null
  const activations = await fetchPhraseVoiceActivations([latest.id])
  return pickPendingActivationPhrase(items, activations)
}
