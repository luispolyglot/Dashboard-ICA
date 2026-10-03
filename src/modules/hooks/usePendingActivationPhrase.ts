import { useEffect, useState } from 'react'
import { fetchPendingActivationPhrase } from '../services/pendingActivation'
import type { PhraseGenerationEntry } from '../types'

/**
 * Última frase creada sin activar (null si no hay o si falla la carga: es solo una ayuda).
 * `refreshKey` vuelve a pedirla (por ejemplo, al crear una frase nueva).
 */
export function usePendingActivationPhrase(
  targetLang: string | null | undefined,
  refreshKey?: string | null,
): PhraseGenerationEntry | null {
  const [phrase, setPhrase] = useState<PhraseGenerationEntry | null>(null)

  useEffect(() => {
    if (!targetLang) {
      setPhrase(null)
      return
    }
    let active = true
    fetchPendingActivationPhrase(targetLang)
      .then((next) => {
        if (active) setPhrase(next)
      })
      .catch(() => {
        if (active) setPhrase(null)
      })
    return () => {
      active = false
    }
  }, [targetLang, refreshKey])

  return phrase
}
