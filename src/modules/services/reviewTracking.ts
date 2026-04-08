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

  const { data: metric, error: metricError } = await supabase
    .from('daily_metrics')
    .select('reviews_done, correct_reviews, xp_earned')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle()
  if (metricError) throw metricError

  const nextReviewsDone = (metric?.reviews_done ?? 0) + 1
  const nextCorrect = (metric?.correct_reviews ?? 0) + (knew ? 1 : 0)
  const nextXp = (metric?.xp_earned ?? 0) + points

  const { error: dailyError } = await supabase.from('daily_metrics').upsert(
    {
      user_id: userId,
      day,
      reviews_done: nextReviewsDone,
      correct_reviews: nextCorrect,
      xp_earned: nextXp,
      review_goal_completed: nextCorrect >= GOAL,
    },
    { onConflict: 'user_id,day' },
  )
  if (dailyError) throw dailyError

  const { error: goalError } = await supabase.from('goal_completions').upsert(
    {
      user_id: userId,
      day,
      goal_type: 'review_goal',
      completed: nextCorrect >= GOAL,
      progress_value: nextCorrect,
      target_value: GOAL,
    },
    { onConflict: 'user_id,day,goal_type' },
  )
  if (goalError) throw goalError

  await evaluateAndUnlockAchievements(userId)
}
