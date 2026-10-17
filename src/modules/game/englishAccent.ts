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
export function syncEnglishAccentFromAccount(value: unknown, userId?: string | null): void {
  if (isAccent(value) && userId) void publishAccent(userId, value)
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
    const { data } = await supabase.auth.updateUser({ data: { english_accent: accent } })
    if (data.user?.id) await publishAccent(data.user.id, accent)
  } catch {
    /* kept in this device; the account gets it next time */
  }
}

// What the others see (ica_english_accents): your accent, so your English flag is the right one
// for them too. Written once per accent and device (not on every visit).
const PUBLISHED_KEY = 'ica-english-accent-published'

async function publishAccent(userId: string, accent: EnglishAccent): Promise<void> {
  if (!supabase) return
  const mark = `${userId}:${accent}`
  try {
    if (window.localStorage.getItem(PUBLISHED_KEY) === mark) return
  } catch {
    /* no storage: write it */
  }
  const { error } = await supabase
    .from('ica_english_accents')
    .upsert({ user_id: userId, accent, updated_at: new Date().toISOString() })
  if (error) return
  try {
    window.localStorage.setItem(PUBLISHED_KEY, mark)
  } catch {
    /* written again next visit: harmless */
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
 * YOUR accent, so it gets theirs (ica_english_accents; no row = American, the default). The accents
 * are asked in one go for everyone on screen, and the flags update when they arrive. Other
 * languages are returned as they are.
 */
const othersAccent = new Map<string, EnglishAccent>()
const othersWanted = new Set<string>()
const OTHERS_EVENT = 'ica:others-english-accents'
let othersTimer: ReturnType<typeof setTimeout> | null = null

function askOthersAccent(userId: string): void {
  if (othersAccent.has(userId) || othersWanted.has(userId)) return
  othersWanted.add(userId)
  if (othersTimer) return
  othersTimer = setTimeout(() => {
    othersTimer = null
    void loadOthersAccents()
  }, 30)
}

async function loadOthersAccents(): Promise<void> {
  const ids = Array.from(othersWanted)
  othersWanted.clear()
  if (!supabase || ids.length === 0) return
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200)
    const { data, error } = await supabase.from('ica_english_accents').select('user_id, accent').in('user_id', chunk)
    if (error) continue // older server without the table: they stay American
    const found = new Map((data ?? []).map((row) => [String(row.user_id), row.accent]))
    for (const id of chunk) {
      const accent = found.get(id)
      othersAccent.set(id, isAccent(accent) ? accent : 'us')
    }
  }
  window.dispatchEvent(new Event(OTHERS_EVENT))
}

export function useOthersLanguageFlag(): (lang: string | null | undefined, userId: string | null | undefined) => string | null {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const onChange = () => setVersion((value) => value + 1)
    window.addEventListener(OTHERS_EVENT, onChange)
    return () => window.removeEventListener(OTHERS_EVENT, onChange)
  }, [])
  return useCallback(
    (lang: string | null | undefined, userId: string | null | undefined) => {
      if (!lang) return null
      if (lang !== 'Inglés') return lang
      const accent = userId ? othersAccent.get(userId) : undefined
      if (userId && !accent) askOthersAccent(userId)
      return englishFlagKey(accent ?? 'us')
    },
    // A new function when accents arrive, so the screens that use it draw again.
    [version],
  )
}
