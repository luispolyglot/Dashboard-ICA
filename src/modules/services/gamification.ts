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
  creation_goal_completed: boolean
  xp_earned: number
}

async function bumpCreationDailyMetrics(params: {
  day: string
  wordsAdded: number
  wordsAddedDelta: number
  phraseGenerated: boolean
  xpDelta: number
}): Promise<DailyMetricRow> {
  if (!supabase) return { words_added: 0, creation_goal_completed: false, xp_earned: 0 }

  const { data, error } = await supabase.rpc('bump_daily_creation_metrics', {
    p_day: params.day,
    p_words_added: params.wordsAdded,
    p_words_added_delta: params.wordsAddedDelta,
    p_phrase_generated: params.phraseGenerated,
    p_xp_delta: params.xpDelta,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return {
    words_added: Number(row?.words_added ?? 0),
    creation_goal_completed: Boolean(row?.creation_goal_completed ?? false),
    xp_earned: Number(row?.xp_earned ?? 0),
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
  const nextWords = Math.max(0, Math.floor(params.wordsAdded || 0))

  const { error: xpError } = await supabase.from('xp_events').insert({
    user_id: userId,
    source: 'word_added',
    points: WORD_ADD_POINTS,
    metadata: { day },
  })
  if (xpError) throw xpError

  const metric = await bumpCreationDailyMetrics({
    day,
    wordsAdded: nextWords,
    wordsAddedDelta: 1,
    phraseGenerated: params.phraseGenerated,
    xpDelta: WORD_ADD_POINTS,
  })

  const { error: goalError } = await supabase.from('goal_completions').upsert(
    {
      user_id: userId,
      day,
      goal_type: 'creation_goal',
      completed: metric.creation_goal_completed,
      progress_value: metric.words_added,
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

type PhraseGeneratedEventResult = {
  activationWordsTotal: number | null
  phraseGenerationId: string | null
}

export async function recordPhraseGeneratedEvent(
  params: PhraseEventParams,
): Promise<PhraseGeneratedEventResult> {
  if (!supabase) return { activationWordsTotal: null, phraseGenerationId: null }
  const userId = await getCurrentUserId()
  if (!userId) return { activationWordsTotal: null, phraseGenerationId: null }

  const day = todayKey()

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
  let phraseGenerationId: string | null = null

  const insertWithLang = await supabase
    .from('phrase_generations')
    .insert(phrasePayload)
    .select('id')
    .single()

  if (insertWithLang.error) {
    const insertLegacy = await supabase
      .from('phrase_generations')
      .insert({
      user_id: userId,
      source_words: params.words,
      generated_phrase: params.phrase,
      translation: params.translation,
      model:
        params.source === 'manual'
          ? 'manual'
          : import.meta.env.VITE_ANTHROPIC_MODEL || null,
      success: true,
    })
      .select('id')
      .single()
    phraseError = insertLegacy.error
    phraseGenerationId = insertLegacy.data?.id || null
  } else {
    phraseGenerationId = insertWithLang.data?.id || null
  }

  if (phraseError) throw phraseError

  let activationTotal = await registerWordActivations(
    params.wordIds,
    params.targetLang,
    params.nativeLang,
    params.words,
  )

  if (activationTotal === null) {
    activationTotal = await registerWordActivations(
      params.wordIds,
      params.targetLang,
      params.nativeLang,
      params.words,
    )
  }

  if (activationTotal === null) {
    console.error('Could not register word activations after retry', {
      userId,
      targetLang: params.targetLang,
      nativeLang: params.nativeLang,
      wordIdsCount: params.wordIds.length,
      wordsCount: params.words.length,
      source: params.source || 'generated',
    })
  }

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

  const metric = await bumpCreationDailyMetrics({
    day,
    wordsAdded: Math.max(0, Math.floor(params.wordsAdded || 0)),
    wordsAddedDelta: 0,
    phraseGenerated: true,
    xpDelta: PHRASE_POINTS,
  })

  const { error: goalError } = await supabase.from('goal_completions').upsert(
    {
      user_id: userId,
      day,
      goal_type: 'creation_goal',
      completed: metric.creation_goal_completed,
      progress_value: metric.words_added,
      target_value: CREATION_WORDS_GOAL,
    },
    { onConflict: 'user_id,day,goal_type' },
  )
  if (goalError) throw goalError

  await evaluateAndUnlockAchievements(userId)
  return { activationWordsTotal: activationTotal, phraseGenerationId }
}
