import { supabase } from '../../lib/supabase'
import type {
  ActivationPhraseResult,
  Lexicard,
  PhraseTokenInsightResult,
  StudyLevel,
} from '../types'

type TranslateResponse = {
  translation?: string | null
  /** Corrected spelling of what was typed, or null when it was already right. */
  spellingSuggestion?: string | null
}

type ManualPhraseSuggestionResponse = {
  review?: ManualPhraseReviewResult | null
}

export type ManualPhraseReviewResult = {
  status: 'suggested' | 'perfect' | 'invalid'
  suggestion: string | null
  nativeSuggestion: string | null
  comment: string
  targetFeedback: string[]
  nativeFeedback: string[]
  issues: string[]
  diagnostics: {
    requiredWords: string[]
    matchedRequiredWords: string[]
    missingRequiredWords: string[]
    suggestionRejectedReason: string | null
    suggestionCandidate: string | null
  }
}

type WordExampleResponse = {
  result?: ActivationPhraseResult | null
}

type ActivationPhraseResponse = {
  result?: ActivationPhraseResult | null
}

type PhraseTokenInsightResponse = {
  result?: PhraseTokenInsightResult | null
}

export type TranslationWithSpelling = {
  translation: string | null
  spellingSuggestion: string | null
}

/**
 * Translation plus the spelling suggestion for the original text, in one AI call
 * (it replaced the separate spellcheck call in Inmersión; Luis, 6 Oct).
 */
export async function fetchTranslationWithSpelling(
  text: string,
  fromLang: string,
  toLang: string,
): Promise<TranslationWithSpelling> {
  const empty = { translation: null, spellingSuggestion: null }
  if (!supabase) return empty

  try {
    const { data, error } = await supabase.functions.invoke<TranslateResponse>('anthropic-proxy', {
      body: {
        action: 'translate',
        text,
        fromLang,
        toLang,
      },
    })

    if (error) {
      console.error(error)
      return empty
    }

    const translation = data?.translation?.trim() || null
    const spellingSuggestion = data?.spellingSuggestion?.trim() || null
    return { translation, spellingSuggestion }
  } catch (error) {
    console.error(error)
    return empty
  }
}

export async function fetchTranslation(
  text: string,
  fromLang: string,
  toLang: string,
): Promise<string | null> {
  return (await fetchTranslationWithSpelling(text, fromLang, toLang)).translation
}

export async function fetchManualPhraseSuggestion(
  targetPhrase: string,
  nativePhrase: string,
  requiredWords: string[],
  targetLang: string,
  nativeLang: string,
): Promise<ManualPhraseReviewResult | null> {
  if (!supabase) return null

  try {
    const { data, error } =
      await supabase.functions.invoke<ManualPhraseSuggestionResponse>(
        'anthropic-proxy',
        {
          body: {
            action: 'manual_phrase_suggestion',
            targetPhrase,
            nativePhrase,
            requiredWords,
            targetLang,
            nativeLang,
          },
        },
      )

    if (error) {
      console.error(error)
      return null
    }

    return data?.review || null
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function fetchWordExample(
  targetWord: string,
  nativeMeaning: string,
  targetLang: string,
  nativeLang: string,
  level: StudyLevel,
): Promise<ActivationPhraseResult | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.functions.invoke<WordExampleResponse>('anthropic-proxy', {
      body: {
        action: 'word_example',
        targetWord,
        nativeMeaning,
        targetLang,
        nativeLang,
        level,
      },
    })

    if (error) {
      console.error(error)
      return null
    }

    return data?.result || null
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function fetchActivationPhrase(
  words: Lexicard[],
  targetLang: string,
  nativeLang: string,
  level: StudyLevel,
  previousPhrase?: string,
): Promise<ActivationPhraseResult | null> {
  const body = {
    action: 'activation_phrase',
    words: words.map((word) => ({
      target: word.target,
      native: word.native,
    })),
    targetLang,
    nativeLang,
    level,
    previousPhrase,
  }

  if (!supabase) return null

  try {
    const { data, error } = await supabase.functions.invoke<ActivationPhraseResponse>('anthropic-proxy', {
      body,
    })

    if (error) {
      console.error(error)
      return null
    }

    if (!data?.result) return null
    return data.result
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function fetchPhraseTokenInsight(
  token: string,
  phrase: string,
  targetLang: string,
  nativeLang: string,
): Promise<PhraseTokenInsightResult | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.functions.invoke<PhraseTokenInsightResponse>('anthropic-proxy', {
      body: {
        action: 'phrase_token_insight',
        token,
        phrase,
        targetLang,
        nativeLang,
      },
    })

    if (error) {
      console.error(error)
      return null
    }

    return data?.result || null
  } catch (error) {
    console.error(error)
    return null
  }
}
