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

// RETO DEL DÍA: el minijuego que se abre al completar el ciclo, a la vez que el cofre.
// Usa el mismo motor que Desafíos ICA, pero lo juegas tú solo con tus palabras ICA.
// Cada día toca uno de los modos de Desafíos (Parejas, Lectura, Escritura, Escucha, Habla;
// van rotando). Cuenta como hecho con 5 aciertos o más. El mejor resultado diario se sincroniza
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
  write: 12,
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

function dayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, date || 1) / 86_400_000)
}

/** El modo que toca hoy (rota cada día). */
export function dailyGameModeFor(day = todayKey()): DailyGameMode {
  const index = ((dayNumber(day) % DAILY_GAME_MODES.length) + DAILY_GAME_MODES.length) % DAILY_GAME_MODES.length
  return DAILY_GAME_MODES[index]
}

export function toEngineCards(cards: Lexicard[], ownerUserId: string): EngineCard[] {
  return cards.map((card) => ({
    id: card.id,
    ownerUserId,
    target: card.target,
    native: card.native,
    examplePhrase: card.examplePhrase ?? null,
    exampleTranslation: card.exampleTranslation ?? null,
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
  const order = [preferred, ...DAILY_GAME_MODES.filter((mode) => mode.kind !== preferred.kind)]
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
  const [result, setResult] = useState<DailyGameResult | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setResult(null)
      return null
    }
    const { data, error } = await supabase.rpc('get_my_daily_game_result')
    if (error) throw error
    const next = parseDailyGameRow(data)
    setResult(next)
    return next
  }, [userId])

  useEffect(() => {
    const onRefresh = () => { void refresh().catch(() => undefined) }
    onRefresh()
    window.addEventListener(DAILY_GAME_CHANGED_EVENT, onRefresh)
    window.addEventListener('focus', onRefresh)
    return () => {
      window.removeEventListener(DAILY_GAME_CHANGED_EVENT, onRefresh)
      window.removeEventListener('focus', onRefresh)
    }
  }, [refresh, day])

  return { mode: playable ?? preferred, result, done: isDailyGamePassed(result) }
}
