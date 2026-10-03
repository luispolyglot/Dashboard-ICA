import { useAuth } from '@/auth/AuthContext'
import { useFichas } from './fichas'
import { DAILY_LIMITS, PHASE_BOOST_MULTIPLIER, type DailyLimitKey } from './rules'

export type DailyLimitsState = {
  limits: Record<DailyLimitKey, number>
  used: Record<DailyLimitKey, number>
  boosted: Record<DailyLimitKey, boolean>
  isAtLimit: (key: DailyLimitKey) => boolean
}

/** Cuotas y usos vienen del estado del servidor; localStorage ya no concede cuota. */
export function useDailyLimits(): DailyLimitsState {
  const { user } = useAuth()
  const { phaseBoosts: boosted, usageToday: used } = useFichas(user?.id)
  const factor = (key: DailyLimitKey) => (boosted[key] ? PHASE_BOOST_MULTIPLIER : 1)
  const limits = {
    words: DAILY_LIMITS.words * factor('words'),
    phrases: DAILY_LIMITS.phrases * factor('phrases'),
    activations: DAILY_LIMITS.activations * factor('activations'),
  }

  return {
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
