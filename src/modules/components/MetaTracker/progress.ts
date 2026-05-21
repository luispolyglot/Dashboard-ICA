import type { MetaTrackerProfile } from '../../types'
import { computeLevelPosition, getLevelThresholds } from './leveling'

type MetaTrackerSnapshot = {
  totalWords: number
  currentLevelKey: string
  nextLevelKey: string
  wordsToNext: number
}

export function getMetaTrackerTotalWords(
  profile: MetaTrackerProfile,
  targetLang: string,
): number {
  const thresholds = getLevelThresholds(targetLang)
  const baseWords = profile.startLevel === '0' ? 0 : (thresholds[profile.startLevel] ?? 0)
  const priorWords = profile.priorIcaWords ?? 0
  const activationWords = profile.activationWordsTotal ?? 0
  return baseWords + priorWords + activationWords
}

export function getMetaTrackerSnapshot(
  profile: MetaTrackerProfile,
  targetLang: string,
): MetaTrackerSnapshot {
  const thresholds = getLevelThresholds(targetLang)
  const totalWords = getMetaTrackerTotalWords(profile, targetLang)
  const position = computeLevelPosition(totalWords, thresholds)

  return {
    totalWords,
    currentLevelKey: position.currentLevelKey,
    nextLevelKey: position.nextLevelKey,
    wordsToNext: position.wordsToNext,
  }
}
