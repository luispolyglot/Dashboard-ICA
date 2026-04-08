import { supabase } from '../../lib/supabase'

type AchievementRule = {
  id: string
  threshold: number
  metric: 'words' | 'reviews' | 'phrases' | 'xp'
}

const ACHIEVEMENT_RULES: AchievementRule[] = [
  { id: 'first_word', threshold: 1, metric: 'words' },
  { id: 'vocab_25', threshold: 25, metric: 'words' },
  { id: 'review_100', threshold: 100, metric: 'reviews' },
  { id: 'phrase_10', threshold: 10, metric: 'phrases' },
  { id: 'xp_500', threshold: 500, metric: 'xp' },
]

async function getMetricCounts(userId: string) {
  if (!supabase) {
    return { words: 0, reviews: 0, phrases: 0, xp: 0 }
  }

  const [wordsRes, reviewsRes, phrasesRes, xpRes] = await Promise.all([
    supabase.from('lexicards').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('lexicard_reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('phrase_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('success', true),
    supabase.from('xp_events').select('points').eq('user_id', userId),
  ])

  if (wordsRes.error) throw wordsRes.error
  if (reviewsRes.error) throw reviewsRes.error
  if (phrasesRes.error) throw phrasesRes.error
  if (xpRes.error) throw xpRes.error

  const xp = (xpRes.data || []).reduce((sum, row) => sum + Number(row.points || 0), 0)

  return {
    words: wordsRes.count ?? 0,
    reviews: reviewsRes.count ?? 0,
    phrases: phrasesRes.count ?? 0,
    xp,
  }
}

export async function evaluateAndUnlockAchievements(userId: string): Promise<void> {
  if (!supabase) return

  const metrics = await getMetricCounts(userId)
  const { data: existingAchievements, error: existingAchievementsError } = await supabase
    .from('achievements')
    .select('id')

  if (existingAchievementsError) {
    throw existingAchievementsError
  }

  const existingIds = new Set((existingAchievements || []).map((item) => item.id))

  const rows = ACHIEVEMENT_RULES
    .filter((rule) => existingIds.has(rule.id) && metrics[rule.metric] >= rule.threshold)
    .map((rule) => ({
      user_id: userId,
      achievement_id: rule.id,
      progress: metrics[rule.metric],
    }))

  if (!rows.length) return

  const { error } = await supabase
    .from('user_achievements')
    .upsert(rows, { onConflict: 'user_id,achievement_id' })

  if (error) {
    throw error
  }
}
