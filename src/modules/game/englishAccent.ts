import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { LANG_CODES } from '../constants'

// INGLÉS AMERICANO O BRITÁNICO (Luis, 17 Oct): «Inglés» is still one language in the app (words,
// phrases, ranking… all keep 'Inglés'), but each student chooses the accent. It changes the voice
// of the app (the premium voice saves the two accents apart) and the speech recognition, wherever
// English sounds or is spoken: as the language you learn and as your own language.
// Saved in the account (user_metadata.english_accent, the same on every device) and in this device
// for the first moment. American by default (the voice the app always had).

export type EnglishAccent = 'us' | 'uk'

const STORAGE_KEY = 'ica-english-accent'
const CHANGED_EVENT = 'ica:english-accent-changed'
const LOCALE: Record<EnglishAccent, string> = { us: 'en-US', uk: 'en-GB' }

function isAccent(value: unknown): value is EnglishAccent {
  return value === 'us' || value === 'uk'
}

function readStored(): EnglishAccent {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isAccent(value) ? value : 'us'
  } catch {
    return 'us'
  }
}

let current: EnglishAccent = typeof window === 'undefined' ? 'us' : readStored()

/**
 * Every voice and the speech recognition read the code of a language from LANG_CODES when they
 * start, so changing the English one there is enough for the whole app.
 */
function apply(accent: EnglishAccent): void {
  current = accent
  LANG_CODES['Inglés'] = LOCALE[accent]
}
apply(current)

export function getEnglishAccent(): EnglishAccent {
  return current
}

/** Applies the accent saved in the account (on login). Does not write anything. */
export function syncEnglishAccentFromAccount(value: unknown): void {
  if (!isAccent(value) || value === current) return
  apply(value)
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* only this visit */
  }
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

/** The student chose an accent: applied now, kept in this device and saved in the account. */
export async function setEnglishAccent(accent: EnglishAccent): Promise<void> {
  if (accent !== current) {
    apply(accent)
    try {
      window.localStorage.setItem(STORAGE_KEY, accent)
    } catch {
      /* only this visit */
    }
    window.dispatchEvent(new Event(CHANGED_EVENT))
  }
  if (!supabase) return
  try {
    await supabase.auth.updateUser({ data: { english_accent: accent } })
  } catch {
    /* kept in this device; the account gets it next time */
  }
}

export function useEnglishAccent(): EnglishAccent {
  const [accent, setAccent] = useState<EnglishAccent>(current)
  useEffect(() => {
    const onChange = () => setAccent(current)
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [])
  return accent
}

/** The key of the English flag of an accent: 'Inglés:us' (American) or 'Inglés:uk' (British). */
export function englishFlagKey(accent: EnglishAccent): string {
  return accent === 'uk' ? 'Inglés:uk' : 'Inglés:us'
}

/**
 * The flag of ANOTHER student (ranking, rivals, their profile). A bare «Inglés» would be drawn with
 * YOUR accent, so it gets theirs. For now everyone else's English shows the American flag (the
 * default accent): which accent each one chose is saved in their own account, which nobody else can
 * read. Other languages are returned as they are.
 */
export function useOthersLanguageFlag(): (lang: string | null | undefined, userId: string | null | undefined) => string | null {
  return useCallback((lang: string | null | undefined) => {
    if (!lang) return null
    return lang === 'Inglés' ? englishFlagKey('us') : lang
  }, [])
}
