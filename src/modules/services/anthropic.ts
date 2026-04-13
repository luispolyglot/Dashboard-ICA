import { supabase } from '../../lib/supabase'
import type {
  ActivationPhraseResult,
  CEFRLevel,
  Lexicard,
} from '../types'

type TranslateResponse = {
  translation?: string | null
}

type SpellcheckResponse = {
  suggestion?: string | null
}

type WordExampleResponse = {
  result?: ActivationPhraseResult | null
}

type ActivationPhraseResponse = {
  result?: ActivationPhraseResult | null
}

export async function fetchTranslation(
  text: string,
  fromLang: string,
  toLang: string,
): Promise<string | null> {
  if (!supabase) return null

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
      return null
    }

    const result = data?.translation?.trim()
    return result ? result : null
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function fetchSpellingSuggestion(
  text: string,
  lang: string,
): Promise<string | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.functions.invoke<SpellcheckResponse>('anthropic-proxy', {
      body: {
        action: 'spellcheck',
        text,
        lang,
      },
    })

    if (error) {
      console.error(error)
      return null
    }

    const result = data?.suggestion?.trim()
    return result ? result : null
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
  level: CEFRLevel,
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
  level: CEFRLevel,
): Promise<ActivationPhraseResult | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.functions.invoke<ActivationPhraseResponse>('anthropic-proxy', {
      body: {
        action: 'activation_phrase',
        words: words.map((word) => ({
          target: word.target,
          native: word.native,
        })),
        targetLang,
        nativeLang,
        level,
      },
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
