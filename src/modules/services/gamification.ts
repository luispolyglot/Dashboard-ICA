import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import { evaluateAndUnlockAchievements } from './achievements'
import { notifyCreationMetricsChanged } from './creationMetricsSync'
import { registerWordActivations } from './metaTracker'
import { signalIcaCoinsStateChanged } from '../game/fichas'

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
  signalIcaCoinsStateChanged()
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

  const { data: phraseId, error: phraseError } = await supabase.rpc('record_phrase_generation_event', {
    p_word_ids: params.wordIds,
    p_phrase: params.phrase,
    p_translation: params.translation,
    p_target_lang: params.targetLang,
    p_native_lang: params.nativeLang,
    p_source: params.source || 'generated',
  })
  if (phraseError) {
    signalIcaCoinsStateChanged()
    throw phraseError
  }
  const phraseGenerationId = typeof phraseId === 'string' ? phraseId : null
  signalIcaCoinsStateChanged()

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
  signalIcaCoinsStateChanged()

  return { activationWordsTotal: activationTotal, phraseGenerationId }
}
