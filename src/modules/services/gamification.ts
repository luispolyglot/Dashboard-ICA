import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import { evaluateAndUnlockAchievements } from './achievements'
import { notifyCreationMetricsChanged } from './creationMetricsSync'
import { registerWordActivations } from './metaTracker'

const WORD_ADD_POINTS = 5
const PHRASE_POINTS = 20

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function recordWordAddedEvent(): Promise<void> {
  if (!supabase) return
  const userId = await getCurrentUserId()
  if (!userId) return

  const day = todayKey()

  const { error: xpError } = await supabase.from('xp_events').insert({
    user_id: userId,
    source: 'word_added',
    points: WORD_ADD_POINTS,
    metadata: { day },
  })
  if (xpError) throw xpError

  await evaluateAndUnlockAchievements(userId)
  notifyCreationMetricsChanged()
}

type PhraseEventParams = {
  wordIds: string[]
  words: string[]
  phrase: string
  translation: string
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
    source_words_v2: params.wordIds.map((lexicardId, index) => ({
      lexicard_id: lexicardId,
      word: params.words[index] || '',
    })),
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
    phraseGenerationId || '',
    params.wordIds,
    params.targetLang,
    params.nativeLang,
    params.words,
  )

  if (activationTotal === null) {
    activationTotal = await registerWordActivations(
      phraseGenerationId || '',
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

  try {
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
  } catch (error) {
    console.error('Could not store phrase XP event', error)
  }

  try {
    await evaluateAndUnlockAchievements(userId)
  } catch (error) {
    console.error('Could not evaluate achievements after phrase generation', error)
  }

  notifyCreationMetricsChanged()

  return { activationWordsTotal: activationTotal, phraseGenerationId }
}
