import type { CoachingV2Focus } from '../services/coaching'

export const COACHING_V2_MAX_VISIBLE_FOCUS_COLUMNS = 5

export function getVisibleFocusColumns(
  focuses: CoachingV2Focus[],
  showAll: boolean,
  maxColumns = COACHING_V2_MAX_VISIBLE_FOCUS_COLUMNS,
): CoachingV2Focus[] {
  if (showAll) return focuses
  if (maxColumns <= 0) return []
  if (focuses.length <= maxColumns) return focuses
  return focuses.slice(focuses.length - maxColumns)
}

export function areCoachGuidelinesComplete(input: {
  coachGuideline1: string | null
  coachGuideline2: string | null
  coachGuideline3: string | null
}): boolean {
  return Boolean(input.coachGuideline1?.trim()) && Boolean(input.coachGuideline2?.trim()) && Boolean(input.coachGuideline3?.trim())
}
