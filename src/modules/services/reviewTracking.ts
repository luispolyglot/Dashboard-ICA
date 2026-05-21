import { GOAL } from '../constants'
import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import type { Lexicard } from '../types'
import { evaluateAndUnlockAchievements } from './achievements'

type RecordReviewEventParams = {
  previousCard: Lexicard
  nextCard: Lexicard
  knew: boolean
}

function getPoints(knew: boolean): number {
  return knew ? 10 : 2
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

async function bumpReviewDailyMetrics(params: {
  day: string
  correctDelta: number
  xpDelta: number
}): Promise<{ correctReviews: number; reviewGoalCompleted: boolean }> {
  if (!supabase) return { correctReviews: 0, reviewGoalCompleted: false }

  const { data, error } = await supabase.rpc('bump_daily_review_metrics', {
    p_day: params.day,
    p_correct_delta: params.correctDelta,
    p_xp_delta: params.xpDelta,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return {
    correctReviews: Number(row?.correct_reviews ?? 0),
    reviewGoalCompleted: Boolean(row?.review_goal_completed ?? false),
  }
}

export async function recordReviewEvent({ previousCard, nextCard, knew }: RecordReviewEventParams): Promise<void> {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return

  const points = getPoints(knew)
  const day = todayKey()

  const { error: reviewError } = await supabase.from('lexicard_reviews').insert({
    user_id: userId,
    lexicard_id: previousCard.id,
    knew,
    previous_interval: previousCard.interval,
    next_interval: nextCard.interval,
    previous_ease_factor: previousCard.easeFactor,
    next_ease_factor: nextCard.easeFactor,
  })
  if (reviewError) throw reviewError

  const { error: xpError } = await supabase.from('xp_events').insert({
    user_id: userId,
    source: knew ? 'review_correct' : 'review_incorrect',
    points,
    metadata: {
      lexicard_id: previousCard.id,
      importance: previousCard.importance,
    },
  })
  if (xpError) throw xpError

  const metric = await bumpReviewDailyMetrics({
    day,
    correctDelta: knew ? 1 : 0,
    xpDelta: points,
  })

  const { error: goalError } = await supabase.from('goal_completions').upsert(
    {
      user_id: userId,
      day,
      goal_type: 'review_goal',
      completed: metric.reviewGoalCompleted,
      progress_value: metric.correctReviews,
      target_value: GOAL,
    },
    { onConflict: 'user_id,day,goal_type' },
  )
  if (goalError) throw goalError

  await evaluateAndUnlockAchievements(userId)
}
