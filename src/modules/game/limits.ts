import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { todayKey } from '../utils'
import { nextPhaseBoostPrice, phaseBoostsToday, useFichas } from './fichas'
import { DAILY_LIMITS, PHASE_BOOST_MULTIPLIER, type DailyLimitKey } from './rules'

// LÍMITES DIARIOS: máximo de palabras, frases y activaciones por día.
// Palabras y activaciones salen del progreso real del día. Las frases nuevas se cuentan
// aquí (sin contar las regeneraciones de la IA), en este dispositivo, hasta que el
// servidor las cuente él mismo.

const PHRASES_PREFIX = 'ica-phrases-today-v1:'
export const DAILY_USAGE_CHANGED_EVENT = 'ica:daily-usage-changed'

type PhraseCounter = { day: string; count: number }

function phraseKey(userId: string | null | undefined): string {
  return `${PHRASES_PREFIX}${userId || 'anon'}`
}

export function readPhrasesToday(userId: string | null | undefined): number {
  try {
    const raw = window.localStorage.getItem(phraseKey(userId))
    const parsed = raw ? (JSON.parse(raw) as PhraseCounter) : null
    return parsed && parsed.day === todayKey() ? parsed.count : 0
  } catch {
    return 0
  }
}

export function countNewPhraseToday(userId: string | null | undefined): void {
  const next: PhraseCounter = { day: todayKey(), count: readPhrasesToday(userId) + 1 }
  try {
    window.localStorage.setItem(phraseKey(userId), JSON.stringify(next))
  } catch {
    // Sin almacenamiento: no se puede contar; el límite no bloquea.
  }
  window.dispatchEvent(new Event(DAILY_USAGE_CHANGED_EVENT))
}

export type DailyLimitsState = {
  limits: Record<DailyLimitKey, number>
  used: Record<DailyLimitKey, number>
  /** Fases ampliadas hoy (cada una se compra por separado). */
  boosted: Record<DailyLimitKey, boolean>
  /** Precio de la próxima ampliación esta semana (15, 20, 25) o null si ya no quedan. */
  nextBoostPrice: number | null
  isAtLimit: (key: DailyLimitKey) => boolean
}

export function useDailyLimits(): DailyLimitsState {
  const { user } = useAuth()
  const { dailyProgress } = useDashboardContext()
  const { entries } = useFichas(user?.id)
  const [phrasesToday, setPhrasesToday] = useState(() => readPhrasesToday(user?.id))

  useEffect(() => {
    const refresh = () => setPhrasesToday(readPhrasesToday(user?.id))
    refresh()
    window.addEventListener(DAILY_USAGE_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener(DAILY_USAGE_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [user?.id])

  const boosted = phaseBoostsToday(entries)
  const factor = (key: DailyLimitKey) => (boosted[key] ? PHASE_BOOST_MULTIPLIER : 1)
  const limits = {
    words: DAILY_LIMITS.words * factor('words'),
    phrases: DAILY_LIMITS.phrases * factor('phrases'),
    activations: DAILY_LIMITS.activations * factor('activations'),
  }
  const today = getTodayProgress(dailyProgress)
  const used = {
    words: today.wordsAdded,
    phrases: Math.max(phrasesToday, today.phraseGenerated ? 1 : 0),
    activations: today.voiceActivationsCount,
  }

  return {
    limits,
    used,
    boosted,
    nextBoostPrice: nextPhaseBoostPrice(entries),
    isAtLimit: (key) => used[key] >= limits[key],
  }
}

export const LIMIT_LABELS: Record<DailyLimitKey, { one: string; many: string }> = {
  words: { one: 'palabra', many: 'palabras' },
  phrases: { one: 'frase', many: 'frases' },
  activations: { one: 'activación', many: 'activaciones' },
}
