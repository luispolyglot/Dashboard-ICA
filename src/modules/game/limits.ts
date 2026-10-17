import { useAuth } from '@/auth/AuthContext'
import { useFichas } from './fichas'
import { DAILY_LIMITS, PHASE_BOOST_MULTIPLIER, type DailyLimitKey } from './rules'

export type DailyLimitsState = {
  /** Today's limit without «Ampliar»: double for coaching students (Luis, 16 Oct). */
  base: Record<DailyLimitKey, number>
  limits: Record<DailyLimitKey, number>
  used: Record<DailyLimitKey, number>
  boosted: Record<DailyLimitKey, boolean>
  isAtLimit: (key: DailyLimitKey) => boolean
}

/** Cuotas y usos vienen del estado del servidor; localStorage ya no concede cuota. */
export function useDailyLimits(): DailyLimitsState {
  const { user } = useAuth()
  const { phaseBoosts: boosted, usageToday: used, dailyLimitMultiplier } = useFichas(user?.id)
  const factor = (key: DailyLimitKey) => (boosted[key] ? PHASE_BOOST_MULTIPLIER : 1)
  // The server sends the multiplier (2 with an active coaching) and applies the same limits.
  const base = {
    words: DAILY_LIMITS.words * dailyLimitMultiplier,
    phrases: DAILY_LIMITS.phrases * dailyLimitMultiplier,
    activations: DAILY_LIMITS.activations * dailyLimitMultiplier,
  }
  const limits = {
    words: base.words * factor('words'),
    phrases: base.phrases * factor('phrases'),
    activations: base.activations * factor('activations'),
  }

  return {
    base,
    limits,
    used,
    boosted,
    isAtLimit: (key) => used[key] >= limits[key],
  }
}

export const LIMIT_LABELS: Record<DailyLimitKey, { one: string; many: string }> = {
  words: { one: 'palabra', many: 'palabras' },
  phrases: { one: 'frase', many: 'frases' },
  activations: { one: 'activación', many: 'activaciones' },
}
