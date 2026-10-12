import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { canRespellLocally, polishToSpanishRespelling } from './polish'
/** Palabras por petición (las mismas que acepta el servidor). */
const PRONUNCIATION_MAX_WORDS = 20

// PRONUNCIACIÓN FIGURADA: «beaucoup» → /bocú/, escrita como suena para quien habla español
// (para el resto, con su idioma). La pide la IA barata (Haiku) una sola vez por palabra y se
// guarda en este dispositivo. Se ve en las flashcards y en «Últimas añadidas» de Inmersión.
// Se puede ocultar en Perfil.
//
// Sale de la acción «pronunciation» de la función anthropic-proxy (hay que desplegarla).
// Polaco para hispanohablantes: sin IA, con reglas fijas (polish.ts), que aciertan siempre.

const PREF_KEY = 'ica-show-pronunciation'
// v2 (4 oct): se tiran las que hizo la IA con el prompt viejo (muchas estaban mal).
const CACHE_PREFIX = 'ica-pronunciation-v2:'
export const PRONUNCIATION_PREF_EVENT = 'ica:pronunciation-pref'

export function isPronunciationEnabled(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setPronunciationEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sin almacenamiento: dura hasta recargar.
  }
  window.dispatchEvent(new Event(PRONUNCIATION_PREF_EVENT))
}

export function usePronunciationEnabled(): boolean {
  const [enabled, setEnabled] = useState(isPronunciationEnabled)
  useEffect(() => {
    const sync = () => setEnabled(isPronunciationEnabled())
    window.addEventListener(PRONUNCIATION_PREF_EVENT, sync)
    return () => window.removeEventListener(PRONUNCIATION_PREF_EVENT, sync)
  }, [])
  return enabled
}

type Pair = { targetLang: string; nativeLang: string }
const pairKey = ({ targetLang, nativeLang }: Pair) => `${targetLang}|${nativeLang}`

const memory = new Map<string, Record<string, string>>()

function readCache(pair: Pair): Record<string, string> {
  const key = pairKey(pair)
  const cached = memory.get(key)
  if (cached) return cached
  let value: Record<string, string> = {}
  try {
    value = JSON.parse(window.localStorage.getItem(CACHE_PREFIX + key) || '{}') || {}
  } catch {
    value = {}
  }
  memory.set(key, value)
  return value
}

function writeCache(pair: Pair, entries: Record<string, string>): void {
  const merged = { ...readCache(pair), ...entries }
  memory.set(pairKey(pair), merged)
  try {
    window.localStorage.setItem(CACHE_PREFIX + pairKey(pair), JSON.stringify(merged))
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}

async function requestPronunciations(words: string[], pair: Pair): Promise<Record<string, string>> {
  const body = { action: 'pronunciation', words, targetLang: pair.targetLang, nativeLang: pair.nativeLang }
  if (!supabase) return {}
  const { data, error } = await supabase.functions.invoke<{ result?: Record<string, string> }>('anthropic-proxy', { body })
  if (error) throw error
  return data?.result || {}
}

// Se juntan las palabras que se piden a la vez (la ronda de flashcards, «Últimas añadidas»…).
// Si una palabra no llega, se reintenta sola (a los 2, 8 y 25 s); tras eso se deja 5 minutos.
const RETRY_DELAYS_MS = [2000, 8000, 25000]
const GIVE_UP_MS = 5 * 60 * 1000
const queues = new Map<string, { pair: Pair; words: Set<string>; timer: ReturnType<typeof setTimeout> | null }>()
const listeners = new Set<() => void>()
const inFlight = new Set<string>()
const waitingRetry = new Set<string>()
const attempts = new Map<string, number>()
const gaveUpAt = new Map<string, number>()

const notify = () => listeners.forEach((listener) => listener())

function isPending(id: string): boolean {
  if (inFlight.has(id) || waitingRetry.has(id)) return true
  const [targetLang, nativeLang, ...rest] = id.split('|')
  return Boolean(queues.get(`${targetLang}|${nativeLang}`)?.words.has(rest.join('|')))
}

function markFailed(word: string, pair: Pair) {
  const id = `${pairKey(pair)}|${word}`
  const tries = (attempts.get(id) ?? 0) + 1
  attempts.set(id, tries)
  const delay = RETRY_DELAYS_MS[tries - 1]
  if (delay === undefined) {
    attempts.delete(id)
    gaveUpAt.set(id, Date.now())
    return
  }
  waitingRetry.add(id)
  setTimeout(() => {
    waitingRetry.delete(id)
    enqueue(word, pair, true)
  }, delay)
}

function flush(key: string) {
  const queue = queues.get(key)
  if (!queue) return
  queues.delete(key)
  const all = Array.from(queue.words)
  const words = all.slice(0, PRONUNCIATION_MAX_WORDS)
  for (const word of words) inFlight.add(`${key}|${word}`)
  void requestPronunciations(words, queue.pair)
    .then((result) => {
      writeCache(queue.pair, result)
      for (const word of words) {
        if (result[word]) attempts.delete(`${key}|${word}`)
        else markFailed(word, queue.pair)
      }
    })
    .catch(() => {
      for (const word of words) markFailed(word, queue.pair)
    })
    .finally(() => {
      for (const word of words) inFlight.delete(`${key}|${word}`)
      notify()
    })
  for (const word of all.slice(PRONUNCIATION_MAX_WORDS)) enqueue(word, queue.pair)
}

function enqueue(word: string, pair: Pair, isRetry = false) {
  const key = pairKey(pair)
  const id = `${key}|${word}`
  if (readCache(pair)[word] || inFlight.has(id) || waitingRetry.has(id)) return
  const gaveUp = gaveUpAt.get(id)
  if (gaveUp !== undefined) {
    if (Date.now() - gaveUp < GIVE_UP_MS) return
    gaveUpAt.delete(id)
  }
  const queue = queues.get(key) ?? { pair, words: new Set<string>(), timer: null }
  queue.words.add(word)
  if (!queue.timer) queue.timer = setTimeout(() => flush(key), isRetry ? 0 : 60)
  queues.set(key, queue)
}

/**
 * Pide de antemano la pronunciación de varias palabras (p. ej. toda la ronda de flashcards),
 * para que ya esté al girar la tarjeta.
 */
export function prefetchPronunciations(items: Array<{ word: string | null | undefined; targetLang: string | null | undefined; nativeLang: string | null | undefined }>): void {
  if (!isPronunciationEnabled()) return
  for (const item of items) {
    const clean = (item.word || '').trim()
    if (canRespellLocally(item.targetLang, item.nativeLang)) continue
    if (clean && item.targetLang && item.nativeLang) enqueue(clean, { targetLang: item.targetLang, nativeLang: item.nativeLang })
  }
}

/**
 * Pronunciación figurada de una palabra. `text` es null mientras carga, si está apagada o si no
 * se ha podido conseguir; `loading` indica que está de camino.
 */
export function usePronunciation(
  word: string | null | undefined,
  targetLang: string | null | undefined,
  nativeLang: string | null | undefined,
): { text: string | null; loading: boolean } {
  const enabled = usePronunciationEnabled()
  const clean = (word || '').trim()
  const pair = targetLang && nativeLang ? { targetLang, nativeLang } : null
  const [, setTick] = useState(0)

  useEffect(() => {
    const listener = () => setTick((value) => value + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const local = enabled && pair && clean && canRespellLocally(pair.targetLang, pair.nativeLang)
  const cached = enabled && pair && clean ? (local ? polishToSpanishRespelling(clean) : readCache(pair)[clean] ?? null) : null

  useEffect(() => {
    if (!enabled || !pair || !clean || cached || local) return
    enqueue(clean, pair)
    notify()
  }, [enabled, clean, cached, pair?.targetLang, pair?.nativeLang]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = Boolean(enabled && pair && clean && !cached && isPending(`${pairKey(pair)}|${clean}`))
  return { text: cached, loading }
}
