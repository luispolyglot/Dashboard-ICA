import {
  DEFAULT_LEVEL_FAMILY,
  LANG_TO_FAMILY,
  LEVEL_KEYS,
  LEVEL_THRESHOLDS_BY_FAMILY,
  type LevelKey,
} from '@/shared/ica-leveling'

export { LEVEL_KEYS }
export const NATIVE_PATH_LABEL = 'Camino nativo'

export function getLevelThresholds(language: string): Record<LevelKey, number> {
  const family = LANG_TO_FAMILY[language] || DEFAULT_LEVEL_FAMILY
  return LEVEL_THRESHOLDS_BY_FAMILY[family]
}

export function computeLevelPosition(total: number, thresholds: Record<LevelKey, number>) {
  const stops = [0, ...LEVEL_KEYS.map((key) => thresholds[key])]
  const max = stops[stops.length - 1]
  const safeTotal = Math.max(0, total)
  const clamped = Math.max(0, Math.min(safeTotal, max))

  if (safeTotal >= max) {
    return {
      currentLevelKey: 'C1',
      nextLevelKey: NATIVE_PATH_LABEL,
      pctWithin: 1,
      pctOverall: 1,
      segStart: max,
      segEnd: max,
      wordsToNext: null,
      total: safeTotal,
      isNativePath: true,
    }
  }

  let idx = 0
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i] && clamped < stops[i + 1]) {
      idx = i
      break
    }
    if (clamped >= stops[stops.length - 1]) idx = stops.length - 2
  }

  const segStart = stops[idx]
  const segEnd = stops[idx + 1]
  const pctWithin = segEnd > segStart ? (clamped - segStart) / (segEnd - segStart) : 1
  const pctOverall = Math.min(1, (idx + pctWithin) / LEVEL_KEYS.length)
  const currentLevelKey = idx === 0 ? 'Pre-A1' : LEVEL_KEYS[idx - 1]
  const nextLevelKey = LEVEL_KEYS[Math.min(idx, LEVEL_KEYS.length - 1)]
  const wordsToNext = Math.max(0, segEnd - clamped)

  return {
    currentLevelKey,
    nextLevelKey,
    pctWithin,
    pctOverall,
    segStart,
    segEnd,
    wordsToNext,
    total: safeTotal,
    isNativePath: false,
  }
}
