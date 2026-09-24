/**
 * NOTA DESAFIANTE — trozos de cada frase (fase 1) y preparación del desafío.
 *
 * Dos formas de funcionar:
 * - Modo prueba local (VITE_CHALLENGE_LOCAL=true en .env, solo con `pnpm dev`):
 *   la IA se llama desde el propio ordenador (dev/local-ai-plugin.mjs) y los trozos
 *   se guardan en este navegador. No toca Supabase.
 * - Modo real (VITE_CHALLENGE_CHUNKS_DB=true, cuando esté publicada la migración
 *   20260924120000_nota_desafiante_phrase_chunks.sql y la Edge Function nueva):
 *   la IA va por anthropic-proxy y los trozos se guardan en phrase_generations.
 */
import { supabase } from '../../lib/supabase'
import type { ActivationPhraseResult } from '../types'

export type PhraseChunk = { target: string; native: string }

export type PhraseChallengeData = {
  chunks: PhraseChunk[] | null
  // null = aún sin procesar · true = entra en el desafío · false = queda fuera
  ready: boolean | null
  problem: string | null
}

type SplitPhraseResult = {
  chunks: PhraseChunk[] | null
  translation: string
  targetIsCorrect: boolean | null
  problem: string | null
}

export const isChallengeLocalMode =
  import.meta.env.DEV && import.meta.env.VITE_CHALLENGE_LOCAL === 'true'
export const isChallengeDbMode = import.meta.env.VITE_CHALLENGE_CHUNKS_DB === 'true'
export const isChallengeEnabled = isChallengeLocalMode || isChallengeDbMode

const LOCAL_STORAGE_KEY = 'ica-nota-desafiante-chunks-v1'

// ---------------------------------------------------------------------------
// Llamadas a la IA
// ---------------------------------------------------------------------------

export async function callLocalAi<T>(
  action: 'activation_phrase' | 'split_phrase',
  body: Record<string, unknown>,
): Promise<T | null> {
  const response = await fetch(`/__local-ai/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => null)) as
    | { result?: T; error?: string }
    | null
  if (!response.ok) {
    throw new Error(data?.error || `Modo prueba local: error ${response.status}`)
  }
  return data?.result ?? null
}

export async function splitPhraseForChallenge(params: {
  targetPhrase: string
  nativePhrase: string
  targetLang: string
  nativeLang: string
}): Promise<SplitPhraseResult | null> {
  const body = { action: 'split_phrase', ...params }

  if (isChallengeLocalMode) {
    return callLocalAi<SplitPhraseResult>('split_phrase', body)
  }

  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke<{ result?: SplitPhraseResult }>(
    'anthropic-proxy',
    { body },
  )
  if (error) throw error
  return data?.result ?? null
}

// ---------------------------------------------------------------------------
// Guardar y leer
// ---------------------------------------------------------------------------

function readLocalStore(): Record<string, PhraseChallengeData> {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalStore(store: Record<string, PhraseChallengeData>): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Sin espacio o bloqueado: el desafío volverá a dividir la frase la próxima vez.
  }
}

export async function saveChallengeData(
  phraseId: string,
  data: PhraseChallengeData,
): Promise<void> {
  if (isChallengeDbMode && !isChallengeLocalMode) {
    if (!supabase) return
    const { error } = await supabase
      .from('phrase_generations')
      .update({
        challenge_chunks: data.chunks,
        challenge_ready: data.ready,
        challenge_problem: data.problem,
      })
      .eq('id', phraseId)
    if (error) throw error
    return
  }

  const store = readLocalStore()
  store[phraseId] = data
  writeLocalStore(store)
}

export async function loadChallengeData(
  phraseIds: string[],
): Promise<Record<string, PhraseChallengeData>> {
  const ids = Array.from(new Set(phraseIds.filter(Boolean)))
  if (!ids.length) return {}

  if (isChallengeDbMode && !isChallengeLocalMode) {
    if (!supabase) return {}
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

  const store = readLocalStore()
  const map: Record<string, PhraseChallengeData> = {}
  ids.forEach((id) => {
    if (store[id]) map[id] = store[id]
  })
  return map
}

// ---------------------------------------------------------------------------
// Al crear una frase (PhraseView)
// ---------------------------------------------------------------------------

export async function storeChallengeForNewPhrase(params: {
  phraseId: string
  result: ActivationPhraseResult
  isManual: boolean
  targetLang: string
  nativeLang: string
}): Promise<void> {
  const { phraseId, result, isManual, targetLang, nativeLang } = params

  // Frase generada por la IA con el prompt nuevo: ya trae sus trozos.
  if (!isManual && result.chunks !== undefined) {
    await saveChallengeData(phraseId, {
      chunks: result.chunks,
      ready: Boolean(result.chunks),
      problem: result.chunks ? null : 'No se pudo dividir la frase en trozos válidos.',
    })
    return
  }

  // Frase escrita por el alumno (o generada antes del cambio): se divide ahora.
  const split = await splitPhraseForChallenge({
    targetPhrase: result.phrase,
    nativePhrase: result.translation,
    targetLang,
    nativeLang,
  })
  if (!split) return
  await saveChallengeData(phraseId, {
    chunks: split.chunks,
    ready: Boolean(split.chunks) && split.targetIsCorrect !== false,
    problem: split.problem,
  })
}

// ---------------------------------------------------------------------------
// Al abrir el desafío de una nota (frases antiguas sin trozos se dividen aquí)
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
  targetLang: string
  nativeLang: string
  onProgress?: (done: number, total: number) => void
}): Promise<PreparedChallenge> {
  const { phrases, targetLang, nativeLang, onProgress } = params
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
          const split = await splitPhraseForChallenge({
            targetPhrase: item.target,
            nativePhrase: item.native,
            targetLang,
            nativeLang,
          })
          const data: PhraseChallengeData = split
            ? {
                chunks: split.chunks,
                ready: Boolean(split.chunks) && split.targetIsCorrect !== false,
                problem:
                  split.problem ||
                  (split.chunks ? null : 'No se pudo dividir la frase en trozos válidos.'),
              }
            : { chunks: null, ready: null, problem: null }
          stored[item.phraseId] = data
          if (data.ready !== null) await saveChallengeData(item.phraseId, data)
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

  // Si no se ha podido preparar nada por un error (por ejemplo, falta la clave),
  // se muestra ese error en vez de un desafío vacío.
  if (!rounds.length && firstError) throw firstError

  return { rounds, excluded }
}
