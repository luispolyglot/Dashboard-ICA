/**
 * NOTA DESAFIANTE — trozos de cada frase (fase 1) y preparación del desafío.
 *
 * - Se enciende con el feature flag `nota-desafiante` (tabla feature_flags), para todos a la vez.
 * - La IA solo se llama desde el servidor (anthropic-proxy, acción split_phrase).
 * - Los trozos los guarda el servidor en phrase_generations (challenge_*). El navegador solo lee;
 *   un trigger impide que el cliente escriba esas columnas.
 */
import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useFeatureFlagsStore } from '../stores/featureFlagsStore'
import type { ActivationPhraseResult } from '../types'

export type PhraseChunk = { target: string; native: string }

export type PhraseChallengeData = {
  chunks: PhraseChunk[] | null
  // null = aún sin procesar · true = entra en el desafío · false = queda fuera
  ready: boolean | null
  problem: string | null
}

export const CHALLENGE_FEATURE_FLAG = 'nota-desafiante' as const

/** Lectura puntual del flag (fuera de React o dentro de callbacks). */
export function isChallengeEnabledNow(): boolean {
  return Boolean(useFeatureFlagsStore.getState().flags[CHALLENGE_FEATURE_FLAG])
}

/** Flag reactivo para componentes. Carga los flags si aún no se han cargado. */
export function useChallengeEnabled(): boolean {
  const loadFlags = useFeatureFlagsStore((state) => state.loadFlags)
  const enabled = useFeatureFlagsStore((state) => state.flags[CHALLENGE_FEATURE_FLAG])
  useEffect(() => {
    void loadFlags()
  }, [loadFlags])
  return Boolean(enabled)
}

// ---------------------------------------------------------------------------
// Servidor: preparar (y guardar) los trozos de una frase
// ---------------------------------------------------------------------------

/**
 * Pide al servidor los trozos de una frase ya guardada. El servidor:
 * - devuelve lo guardado si ya se procesó (sin gastar IA),
 * - acepta `chunks` si reproducen la frase guardada (frases nuevas de la IA),
 * - si no, divide la frase con la IA y guarda el resultado.
 */
async function requestPhraseChallenge(
  phraseId: string,
  chunks?: PhraseChunk[] | null,
): Promise<PhraseChallengeData | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke<{ result?: PhraseChallengeData }>(
    'anthropic-proxy',
    { body: { action: 'split_phrase', phraseId, ...(chunks ? { chunks } : {}) } },
  )
  if (error) throw error
  return data?.result ?? null
}

// ---------------------------------------------------------------------------
// Leer
// ---------------------------------------------------------------------------

export async function loadChallengeData(
  phraseIds: string[],
): Promise<Record<string, PhraseChallengeData>> {
  const ids = Array.from(new Set(phraseIds.filter(Boolean)))
  if (!ids.length || !supabase) return {}

  const { data, error } = await supabase
    .from('phrase_generations')
    .select('id, challenge_chunks, challenge_ready, challenge_problem')
    .in('id', ids)
  if (error) throw error

  const map: Record<string, PhraseChallengeData> = {}
  for (const row of (data || []) as Array<{
    id: string
    challenge_chunks: PhraseChunk[] | null
    challenge_ready: boolean | null
    challenge_problem: string | null
  }>) {
    map[row.id] = {
      chunks: row.challenge_chunks,
      ready: row.challenge_ready,
      problem: row.challenge_problem,
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Al crear una frase (PhraseView)
// ---------------------------------------------------------------------------

export async function storeChallengeForNewPhrase(params: {
  phraseId: string
  result: ActivationPhraseResult
  isManual: boolean
}): Promise<void> {
  const { phraseId, result, isManual } = params
  // Frase de la IA con el prompt nuevo: ya trae sus trozos y el servidor solo los valida.
  // Frase escrita por el alumno: el servidor la divide.
  const chunks = !isManual && result.chunks ? result.chunks : null
  await requestPhraseChallenge(phraseId, chunks)
}

// ---------------------------------------------------------------------------
// Al abrir el desafío de una nota (frases antiguas sin trozos se preparan aquí)
// ---------------------------------------------------------------------------

export type ChallengePhraseInput = {
  phraseId: string
  target: string
  native: string
}

export type PreparedChallenge = {
  rounds: Array<PhraseChunk & { phraseId: string; phraseIndex: number }>
  excluded: Array<{ phraseIndex: number; target: string; reason: string }>
}

export async function prepareNoteChallenge(params: {
  phrases: ChallengePhraseInput[]
  onProgress?: (done: number, total: number) => void
}): Promise<PreparedChallenge> {
  const { phrases, onProgress } = params
  const stored = await loadChallengeData(phrases.map((item) => item.phraseId))
  const missing = phrases.filter((item) => stored[item.phraseId]?.ready == null)

  let done = 0
  let firstError: unknown = null
  onProgress?.(done, missing.length)

  // De 3 en 3 para que no tarde demasiado con notas largas.
  for (let index = 0; index < missing.length; index += 3) {
    const batch = missing.slice(index, index + 3)
    await Promise.all(
      batch.map(async (item) => {
        try {
          const data = await requestPhraseChallenge(item.phraseId)
          stored[item.phraseId] = data ?? { chunks: null, ready: null, problem: null }
        } catch (error) {
          console.error('[nota desafiante] split_phrase', error)
          stored[item.phraseId] = { chunks: null, ready: null, problem: null }
          if (!firstError) firstError = error
        } finally {
          done += 1
          onProgress?.(done, missing.length)
        }
      }),
    )
  }

  const rounds: PreparedChallenge['rounds'] = []
  const excluded: PreparedChallenge['excluded'] = []

  phrases.forEach((item, phraseIndex) => {
    const data = stored[item.phraseId]
    if (data?.ready && data.chunks?.length) {
      data.chunks.forEach((chunk) => {
        rounds.push({ ...chunk, phraseId: item.phraseId, phraseIndex })
      })
      return
    }
    excluded.push({
      phraseIndex,
      target: item.target,
      reason:
        data?.problem ||
        (data?.ready === false
          ? 'La frase tiene errores o no tiene sentido.'
          : 'No se pudo preparar esta frase.'),
    })
  })

  // Si no se ha podido preparar nada por un error, se muestra ese error en vez de un desafío vacío.
  if (!rounds.length && firstError) throw firstError

  return { rounds, excluded }
}
