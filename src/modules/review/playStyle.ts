import { REVIEW_ROUND_SIZE } from '../constants'

export type ReviewPlayStyle = 'classic' | 'goal'

export const REVIEW_PLAY_STYLE_CORRECT_GOAL = 10
export const DEFAULT_REVIEW_PLAY_STYLE: ReviewPlayStyle = 'classic'
export const REVIEW_CLASSIC_MIN_WORDS_PER_FREQUENCY = 10
export const REVIEW_GOAL_MIN_WORDS_PER_MODE = 20
export const REVIEW_PLAY_STYLE_QUERY_PARAM = 'playStyle'
export const REVIEW_PENDING_ONLY_QUERY_PARAM = 'pendingOnly'
export const REVIEW_PLAY_STYLE_STORAGE_KEY = 'dashboard-ica-review-play-style'
export const REVIEW_PENDING_ONLY_STORAGE_KEY =
  'dashboard-ica-review-pending-only'

export function isReviewPlayStyle(value: unknown): value is ReviewPlayStyle {
  return value === 'classic' || value === 'goal'
}

export function getReviewPlayStyleFromQuery(value: string | null): ReviewPlayStyle {
  if (value === 'goal') return 'goal'
  if (value === 'classic' || value === 'clasic') return 'classic'
  return DEFAULT_REVIEW_PLAY_STYLE
}

export function getReviewPendingOnlyFromQuery(value: string | null): boolean {
  return value === '1' || value === 'true'
}

export function getReviewRoundSizeByStyle(
  style: ReviewPlayStyle,
  cardCount: number,
): number {
  if (style === 'goal') {
    return Math.max(cardCount, 1)
  }

  return REVIEW_ROUND_SIZE
}

export function getReviewModeMinimumWords(style: ReviewPlayStyle): number {
  return style === 'goal'
    ? REVIEW_GOAL_MIN_WORDS_PER_MODE
    : REVIEW_CLASSIC_MIN_WORDS_PER_FREQUENCY
}

export function loadSavedReviewPlayStyle(): ReviewPlayStyle {
  if (typeof window === 'undefined') return DEFAULT_REVIEW_PLAY_STYLE

  const saved = window.localStorage.getItem(REVIEW_PLAY_STYLE_STORAGE_KEY)
  if (isReviewPlayStyle(saved)) return saved
  return DEFAULT_REVIEW_PLAY_STYLE
}

export function saveReviewPlayStyle(style: ReviewPlayStyle): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(REVIEW_PLAY_STYLE_STORAGE_KEY, style)
}

export function loadSavedReviewPendingOnly(): boolean {
  if (typeof window === 'undefined') return false

  const saved = window.localStorage.getItem(REVIEW_PENDING_ONLY_STORAGE_KEY)
  return saved === '1' || saved === 'true'
}

export function saveReviewPendingOnly(pendingOnly: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    REVIEW_PENDING_ONLY_STORAGE_KEY,
    pendingOnly ? '1' : '0',
  )
}
