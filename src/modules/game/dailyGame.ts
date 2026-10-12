import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenIcon, HeadphonesIcon, Link2Icon, MicIcon, PencilIcon, type LucideIcon } from 'lucide-react'
import {
  generateQuestions,
  type EngineCard,
  type GeneratedQuestion,
} from '../../../supabase/functions/ica-challenges-center/engine.ts'
import { isSpeechRecognitionSupported } from '../components/NotaDesafiante/challengeEngine'
import type { Lexicard } from '../types'
import { todayKey } from '../utils'
import { supabase } from '../../lib/supabase'
import { peekQuick, storeQuick } from '../services/quickCache'

// RETO DEL DÍA: el minijuego que se abre al completar el ciclo, a la vez que el cofre.
// Usa el mismo motor que Desafíos ICA, pero lo juegas tú solo con tus palabras ICA.
// Cada día del mes toca el mismo modo para todos (Luis, 6 oct): día 1 Habla, 2 Escucha,
// 3 Escritura, 4 Lectura, 5 Parejas, y vuelta a empezar (día 6 Habla…). Cuenta como hecho con 5 aciertos o más. El mejor resultado diario se sincroniza
// con el servidor para que el camino se comparta entre dispositivos.

export type DailyGameKind = 'pairs' | 'choice' | 'write' | 'listen' | 'speak'

export type DailyGameMode = {
  kind: DailyGameKind
  name: string
  pitch: string
  icon: LucideIcon
}

export const DAILY_GAME_MODES: DailyGameMode[] = [
  { kind: 'pairs', name: 'Parejas', pitch: 'Une cada palabra con su significado.', icon: Link2Icon },
  { kind: 'choice', name: 'Lectura', pitch: 'Lees la palabra en tu idioma y eliges la buena.', icon: BookOpenIcon },
  { kind: 'write', name: 'Escritura', pitch: 'Ves la palabra en tu idioma y la escribes.', icon: PencilIcon },
  { kind: 'listen', name: 'Escucha', pitch: 'Escuchas la palabra y eliges qué significa.', icon: HeadphonesIcon },
  { kind: 'speak', name: 'Habla', pitch: 'Ves la palabra en tu idioma y la dices en voz alta.', icon: MicIcon },
]

/** Aciertos para dar el reto por completado (la mitad: 5 de 10). */
export const DAILY_GAME_PASS = 5

/** El reto solo cuenta como hecho con 5 aciertos o más. */
export function isDailyGamePassed(result: Pick<DailyGameResult, 'correct'> | null | undefined): boolean {
  return Boolean(result) && (result as Pick<DailyGameResult, 'correct'>).correct >= DAILY_GAME_PASS
}

/** Palabras por partida (Parejas: 2 tableros de 5). */
export const DAILY_GAME_QUESTIONS = 10
/** Palabras ICA que hacen falta en tu baúl para jugarlo. */
export const DAILY_GAME_MIN_WORDS = 10
/** Segundos por palabra (Parejas: por tablero). null = sin reloj. */
export const DAILY_GAME_SECONDS: Record<DailyGameKind, number> = {
  pairs: 45,
  choice: 8,
  // 10 s per word, like the Desafíos ICA (Luis, 8 Oct).
  write: 10,
  listen: 10,
  speak: 10,
}

function speechSupported(): boolean {
  try {
    return isSpeechRecognitionSupported()
  } catch {
    return false
  }
}

/** Order of the month calendar: day 1 Habla, 2 Escucha, 3 Escritura, 4 Lectura, 5 Parejas. */
export const DAILY_GAME_CALENDAR: DailyGameKind[] = ['speak', 'listen', 'write', 'choice', 'pairs']

/**
 * El modo que toca hoy: el mismo para todos según el día del mes, para que el reto sea justo.
 * Si tu dispositivo o tu baúl no permiten ese modo, buildDailyGame pasa al siguiente.
 */
export function dailyGameModeFor(day = todayKey()): DailyGameMode {
  const dayOfMonth = Number(day.split('-')[2]) || 1
  const kind = DAILY_GAME_CALENDAR[(dayOfMonth - 1) % DAILY_GAME_CALENDAR.length]
  return DAILY_GAME_MODES.find((mode) => mode.kind === kind) ?? DAILY_GAME_MODES[0]
}

export function toEngineCards(cards: Lexicard[], ownerUserId: string): EngineCard[] {
  return cards.map((card) => ({
    id: card.id,
    ownerUserId,
    target: card.target,
    native: card.native,
    examplePhrase: card.examplePhrase ?? null,
    exampleTranslation: card.exampleTranslation ?? null,
    boosted: (card.boostDaily ?? 0) > 0,
  }))
}

/**
 * Prepara la partida: el modo del día y, si con tu baúl no se puede montar
 * (por ejemplo, Escritura necesita palabras sueltas), el siguiente que sí se pueda.
 */
export function buildDailyGame(
  preferred: DailyGameMode,
  cards: EngineCard[],
  language: string,
): { mode: DailyGameMode; questions: GeneratedQuestion[] } | null {
  if (cards.length < DAILY_GAME_MIN_WORDS) return null
  // Fallback follows the same calendar order after today's mode, so it is predictable too.
  const start = Math.max(0, DAILY_GAME_CALENDAR.indexOf(preferred.kind))
  const order = DAILY_GAME_CALENDAR.map((_, offset) => DAILY_GAME_CALENDAR[(start + offset) % DAILY_GAME_CALENDAR.length])
    .map((kind) => DAILY_GAME_MODES.find((mode) => mode.kind === kind))
    .filter((mode): mode is DailyGameMode => Boolean(mode))
  // Habla necesita el reconocimiento de voz del navegador; si no lo hay, se salta.
  const canSpeak = speechSupported()
  for (const mode of order) {
    if (mode.kind === 'speak' && !canSpeak) continue
    const generated = generateQuestions({ kind: mode.kind, pools: [cards], count: DAILY_GAME_QUESTIONS, language })
    if (generated.ok && generated.questions.length >= DAILY_GAME_QUESTIONS) {
      return { mode, questions: generated.questions.slice(0, DAILY_GAME_QUESTIONS) }
    }
  }
  return null
}

export type DailyGameResult = {
  day: string
  kind: DailyGameKind
  correct: number
  total: number
  finishedAt: number
}

export const DAILY_GAME_CHANGED_EVENT = 'ica:daily-game-changed'

function parseDailyGameRow(value: unknown): DailyGameResult | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  if (typeof record.day !== 'string' || typeof record.kind !== 'string') return null
  const finishedAt = Date.parse(String(record.finished_at || ''))
  return {
    day: record.day,
    kind: record.kind as DailyGameKind,
    correct: Number(record.correct || 0),
    total: Number(record.total || 0),
    finishedAt: Number.isFinite(finishedAt) ? finishedAt : Date.now(),
  }
}

export async function saveDailyGameResult(
  userId: string | null | undefined,
  result: DailyGameResult,
): Promise<DailyGameResult | null> {
  if (!supabase || !userId) return null
  const { data, error } = await supabase.rpc('save_daily_game_result', {
    p_kind: result.kind,
    p_correct: result.correct,
    p_total: result.total,
  })
  if (error) throw error
  const saved = parseDailyGameRow(data)
  window.dispatchEvent(new Event(DAILY_GAME_CHANGED_EVENT))
  return saved
}

/**
 * Modo de hoy y tu resultado de hoy (si ya lo jugaste). Con tus tarjetas, el modo es
 * el que de verdad se va a jugar (si el del día no se puede, el siguiente).
 */
export function useDailyGame(userId: string | null | undefined, cards?: Lexicard[], language?: string) {
  const day = todayKey()
  const preferred = dailyGameModeFor(day)
  const playable = useMemo(
    () => (cards && language ? buildDailyGame(preferred, toEngineCards(cards, 'me'), language)?.mode ?? null : null),
    // Solo cambia si cambia el día, el número de palabras o el idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preferred.kind, cards?.length, language],
  )
  // Last known result of today, shown at once when coming back to Home (Luis, 5 Oct: after
  // going to Ranking and back, the finished challenge showed as not done for a moment and the
  // path played its «unlock» again). `loaded` tells whether we know today's result yet.
  const cacheKey = userId ? `daily-game:${userId}:${day}` : null
  const cached = cacheKey ? peekQuick<DailyGameResult | null>(cacheKey) : undefined
  const [result, setResult] = useState<DailyGameResult | null>(cached ?? null)
  const [loaded, setLoaded] = useState(cached !== undefined)

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setResult(null)
      setLoaded(true)
      return null
    }
    const { data, error } = await supabase.rpc('get_my_daily_game_result')
    if (error) throw error
    const next = parseDailyGameRow(data)
    setResult(next)
    setLoaded(true)
    storeQuick(`daily-game:${userId}:${todayKey()}`, next)
    return next
  }, [userId])

  useEffect(() => {
    // If the server cannot answer, stop waiting (the path must not stay asleep).
    const onRefresh = () => { void refresh().catch(() => setLoaded(true)) }
    onRefresh()
    window.addEventListener(DAILY_GAME_CHANGED_EVENT, onRefresh)
    window.addEventListener('focus', onRefresh)
    return () => {
      window.removeEventListener(DAILY_GAME_CHANGED_EVENT, onRefresh)
      window.removeEventListener('focus', onRefresh)
    }
  }, [refresh, day])

  return { mode: playable ?? preferred, result, done: isDailyGamePassed(result), loaded }
}
