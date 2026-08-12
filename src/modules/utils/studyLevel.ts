import { getMetaTrackerSnapshot } from '../components/MetaTracker/progress'
import type { MetaTrackerProfile, StudyLevel } from '../types'

export const DEFAULT_STUDY_LEVEL: StudyLevel = 'A2'

const VALID_STUDY_LEVELS = new Set<StudyLevel>([
  'Pre-A1',
  'A1',
  'A1+',
  'A2',
  'A2+',
  'B1',
  'B1+',
  'B2',
  'B2+',
  'C1',
])

export function toStudyLevel(value: string | null | undefined): StudyLevel {
  if (!value) return DEFAULT_STUDY_LEVEL
  const normalized = value.trim() as StudyLevel
  return VALID_STUDY_LEVELS.has(normalized) ? normalized : DEFAULT_STUDY_LEVEL
}

export function getEffectiveStudyLevel(
  targetLang: string,
  profile: MetaTrackerProfile | null | undefined,
): StudyLevel {
  if (!profile?.confirmedAt) return DEFAULT_STUDY_LEVEL
  const snapshot = getMetaTrackerSnapshot(profile, targetLang)
  return toStudyLevel(snapshot.currentLevelKey)
}
