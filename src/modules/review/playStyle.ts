import { REVIEW_ROUND_SIZE } from '../constants'

export type ReviewPlayStyle = 'classic' | 'goal'

export const REVIEW_PLAY_STYLE_CORRECT_GOAL = 10
export const DEFAULT_REVIEW_PLAY_STYLE: ReviewPlayStyle = 'classic'
export const REVIEW_CLASSIC_MIN_WORDS_PER_FREQUENCY = 10
export const REVIEW_GOAL_MIN_WORDS_PER_MODE = 20
export const REVIEW_PLAY_STYLE_QUERY_PARAM = 'playStyle'

export function isReviewPlayStyle(value: unknown): value is ReviewPlayStyle {
  return value === 'classic' || value === 'goal'
}

export function getReviewPlayStyleFromQuery(value: string | null): ReviewPlayStyle {
  if (value === 'goal') return 'goal'
  if (value === 'classic' || value === 'clasic') return 'classic'
  return DEFAULT_REVIEW_PLAY_STYLE
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
