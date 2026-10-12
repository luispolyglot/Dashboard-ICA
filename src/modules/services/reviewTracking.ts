import { supabase } from '../../lib/supabase'
import type { Lexicard } from '../types'
import { evaluateAndUnlockAchievements } from './achievements'
import { signalIcaCoinsStateChanged } from '../game/fichas'

type RecordReviewEventParams = {
  previousCard: Lexicard
  nextCard: Lexicard
  knew: boolean
}

export async function recordReviewEvent(params: RecordReviewEventParams): Promise<void> {
  if (!supabase) return
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return

  const { error } = await supabase.rpc('record_review_event', {
    p_lexicard_id: params.previousCard.id,
    p_knew: params.knew,
    p_response_time_ms: null,
  })
  if (error) throw error
  signalIcaCoinsStateChanged()
  await evaluateAndUnlockAchievements(userId)
}
