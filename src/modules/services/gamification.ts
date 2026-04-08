import { CREATION_WORDS_GOAL } from '../constants'
import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import { evaluateAndUnlockAchievements } from './achievements'

const WORD_ADD_POINTS = 5
const PHRASE_POINTS = 20

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

type DailyMetricRow = {
  words_added: number
  phrase_generated: boolean
  xp_earned: number
}

async function getDailyMetrics(userId: string, day: string): Promise<DailyMetricRow> {
  if (!supabase) return { words_added: 0, phrase_generated: false, xp_earned: 0 }

  const { data, error } = await supabase
    .from('daily_metrics')
    .select('words_added, phrase_generated, xp_earned')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle()

  if (error) throw error

  return {
    words_added: data?.words_added ?? 0,
    phrase_generated: data?.phrase_generated ?? false,
    xp_earned: data?.xp_earned ?? 0,
  }
}

export async function recordWordAddedEvent(): Promise<void> {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return

  const day = todayKey()
  const metric = await getDailyMetrics(userId, day)
  const nextWords = metric.words_added + 1
  const nextXp = metric.xp_earned + WORD_ADD_POINTS
  const creationCompleted = nextWords >= CREATION_WORDS_GOAL && metric.phrase_generated

  const { error: xpError } = await supabase.from('xp_events').insert({
    user_id: userId,
    source: 'word_added',
    points: WORD_ADD_POINTS,
    metadata: { day },
  })
  if (xpError) throw xpError

  const { error: dailyError } = await supabase.from('daily_metrics').upsert(
    {
      user_id: userId,
      day,
      words_added: nextWords,
      phrase_generated: metric.phrase_generated,
      xp_earned: nextXp,
      creation_goal_completed: creationCompleted,
    },
    { onConflict: 'user_id,day' },
  )
  if (dailyError) throw dailyError

  const { error: goalError } = await supabase.from('goal_completions').upsert(
    {
      user_id: userId,
      day,
      goal_type: 'creation_goal',
      completed: creationCompleted,
      progress_value: nextWords,
      target_value: CREATION_WORDS_GOAL,
    },
    { onConflict: 'user_id,day,goal_type' },
  )
  if (goalError) throw goalError

  await evaluateAndUnlockAchievements(userId)
}

type PhraseEventParams = {
  words: string[]
  phrase: string
  translation: string
}

export async function recordPhraseGeneratedEvent(params: PhraseEventParams): Promise<void> {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return

  const day = todayKey()
  const metric = await getDailyMetrics(userId, day)
  const nextXp = metric.xp_earned + PHRASE_POINTS
  const creationCompleted = metric.words_added >= CREATION_WORDS_GOAL

  const { error: phraseError } = await supabase.from('phrase_generations').insert({
    user_id: userId,
    source_words: params.words,
    generated_phrase: params.phrase,
    translation: params.translation,
    model: import.meta.env.VITE_ANTHROPIC_MODEL || null,
    success: true,
  })
  if (phraseError) throw phraseError

  const { error: xpError } = await supabase.from('xp_events').insert({
    user_id: userId,
    source: 'phrase_generated',
    points: PHRASE_POINTS,
    metadata: {
      day,
      word_count: params.words.length,
    },
  })
  if (xpError) throw xpError

  const { error: dailyError } = await supabase.from('daily_metrics').upsert(
    {
      user_id: userId,
      day,
      words_added: metric.words_added,
      phrase_generated: true,
      xp_earned: nextXp,
      creation_goal_completed: creationCompleted,
    },
    { onConflict: 'user_id,day' },
  )
  if (dailyError) throw dailyError

  const { error: goalError } = await supabase.from('goal_completions').upsert(
    {
      user_id: userId,
      day,
      goal_type: 'creation_goal',
      completed: creationCompleted,
      progress_value: metric.words_added,
      target_value: CREATION_WORDS_GOAL,
    },
    { onConflict: 'user_id,day,goal_type' },
  )
  if (goalError) throw goalError

  await evaluateAndUnlockAchievements(userId)
}
