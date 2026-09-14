export const FEATURE_FLAG_KEYS = ['ica-challenges'] as const

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number]

export type FeatureFlagAppEnv = 'all' | 'development' | 'staging' | 'production'

export type FeatureFlagRow = {
  key: string
  is_enabled: boolean
  rollout_percentage: number
  app_env: FeatureFlagAppEnv
  starts_at: string | null
  ends_at: string | null
  payload: Record<string, unknown> | null
}

export type FeatureFlagState = Record<FeatureFlagKey, boolean>

export const DEFAULT_FEATURE_FLAGS: FeatureFlagState = {
  'ica-challenges': false,
}

function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(value)
}

function isDateAfter(value: string | null, now: Date): boolean {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > now.getTime()
}

function isDateBefore(value: string | null, now: Date): boolean {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() < now.getTime()
}

export function isFeatureFlagRowEnabled(
  row: FeatureFlagRow,
  currentEnv: Exclude<FeatureFlagAppEnv, 'all'>,
  now = new Date(),
): boolean {
  if (!row.is_enabled) return false
  if (row.app_env !== 'all' && row.app_env !== currentEnv) return false
  if (row.rollout_percentage <= 0) return false
  if (isDateAfter(row.starts_at, now)) return false
  if (isDateBefore(row.ends_at, now)) return false
  return true
}

export function resolveFeatureFlagsFromRows(
  rows: FeatureFlagRow[],
  currentEnv: Exclude<FeatureFlagAppEnv, 'all'>,
  now = new Date(),
): FeatureFlagState {
  const next: FeatureFlagState = { ...DEFAULT_FEATURE_FLAGS }
  for (const row of rows) {
    if (!isFeatureFlagKey(row.key)) continue
    next[row.key] = isFeatureFlagRowEnabled(row, currentEnv, now)
  }
  return next
}
