import { supabase } from '@/lib/supabase'
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  resolveFeatureFlagsFromRows,
  type FeatureFlagAppEnv,
  type FeatureFlagRow,
  type FeatureFlagState,
} from '../featureFlags/domain'

function getCurrentFeatureFlagEnv(): Exclude<FeatureFlagAppEnv, 'all'> {
  const rawEnv = String(import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'production')
    .trim()
    .toLowerCase()

  if (rawEnv === 'development' || rawEnv === 'dev') return 'development'
  if (rawEnv === 'staging' || rawEnv === 'stage') return 'staging'
  return 'production'
}

export async function fetchFeatureFlags(): Promise<FeatureFlagState> {
  if (!supabase) return { ...DEFAULT_FEATURE_FLAGS }

  const currentEnv = getCurrentFeatureFlagEnv()

  const { data, error } = await supabase
    .from('feature_flags')
    .select(
      'key, is_enabled, rollout_percentage, app_env, starts_at, ends_at, payload',
    )
    .in('app_env', ['all', currentEnv])
    .in('key', [...FEATURE_FLAG_KEYS])

  if (error) {
    throw new Error(error.message || 'No se pudieron cargar los feature flags.')
  }

  return resolveFeatureFlagsFromRows((data || []) as FeatureFlagRow[], currentEnv)
}
