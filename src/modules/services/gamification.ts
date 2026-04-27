import { CREATION_WORDS_GOAL } from '../constants'
import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import { evaluateAndUnlockAchievements } from './achievements'
import { registerWordActivations } from './metaTracker'

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

type WordAddedEventParams = {
  wordsAdded: number
  phraseGenerated: boolean
}

export async function recordWordAddedEvent(params: WordAddedEventParams): Promise<void> {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return

  const day = todayKey()
  const metric = await getDailyMetrics(userId, day)
  const nextWords = params.wordsAdded
  const nextXp = metric.xp_earned + WORD_ADD_POINTS
  const creationCompleted = nextWords >= CREATION_WORDS_GOAL && params.phraseGenerated

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
      phrase_generated: params.phraseGenerated,
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
  wordIds: string[]
  words: string[]
  phrase: string
  translation: string
  wordsAdded: number
  targetLang: string
  nativeLang: string
  source?: 'generated' | 'manual'
}

export async function recordPhraseGeneratedEvent(
  params: PhraseEventParams,
): Promise<number | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const day = todayKey()
  const metric = await getDailyMetrics(userId, day)
  const nextXp = metric.xp_earned + PHRASE_POINTS
  const creationCompleted = params.wordsAdded >= CREATION_WORDS_GOAL

  const phrasePayload = {
    user_id: userId,
    source_words: params.words,
    generated_phrase: params.phrase,
    translation: params.translation,
    model:
      params.source === 'manual'
        ? 'manual'
        : import.meta.env.VITE_ANTHROPIC_MODEL || null,
    success: true,
    target_lang: params.targetLang,
    native_lang: params.nativeLang,
  }

  let phraseError: Error | null = null
  const insertWithLang = await supabase.from('phrase_generations').insert(phrasePayload)
  if (insertWithLang.error) {
    const insertLegacy = await supabase.from('phrase_generations').insert({
      user_id: userId,
      source_words: params.words,
      generated_phrase: params.phrase,
      translation: params.translation,
      model: import.meta.env.VITE_ANTHROPIC_MODEL || null,
      success: true,
    })
    phraseError = insertLegacy.error
  }
  if (phraseError) throw phraseError

  const activationTotal = await registerWordActivations(
    params.wordIds,
    params.targetLang,
    params.nativeLang,
    params.words,
  )

  const { error: xpError } = await supabase.from('xp_events').insert({
    user_id: userId,
    source: 'phrase_generated',
    points: PHRASE_POINTS,
    metadata: {
      day,
      word_count: params.words.length,
      activation_words_total: activationTotal,
      phrase_source: params.source || 'generated',
    },
  })
  if (xpError) throw xpError

  const { error: dailyError } = await supabase.from('daily_metrics').upsert(
    {
      user_id: userId,
      day,
      words_added: params.wordsAdded,
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
      progress_value: params.wordsAdded,
      target_value: CREATION_WORDS_GOAL,
    },
    { onConflict: 'user_id,day,goal_type' },
  )
  if (goalError) throw goalError

  await evaluateAndUnlockAchievements(userId)
  return activationTotal
}
