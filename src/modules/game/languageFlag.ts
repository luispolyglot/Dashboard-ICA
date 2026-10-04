import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { peekQuick, storeQuick } from '../services/quickCache'
import { gameSfx } from './sfx'
import { signalIcaCoinsStateChanged } from './fichas'

// LANGUAGE FLAG (Luis, 4 Oct): for FLAG_COST ICA Coins a student buys the flag of the language they
// are learning now. It becomes the background of their initial (profile, top bar, ranking).
// Bought flags are kept after switching language; the student picks which one is shown.
// The server decides everything (price, language, ownership): buy_language_flag / set_my_display_flag.

export const FLAG_COST = 100

const CHANGED_EVENT = 'ica:language-flag-changed'
const CACHE_PREFIX = 'language-flags:'

export type MyFlags = { owned: string[]; shown: string | null }
const EMPTY: MyFlags = { owned: [], shown: null }

async function loadMyFlags(userId: string): Promise<MyFlags> {
  if (!supabase) return EMPTY
  const [owned, shown] = await Promise.all([
    supabase.from('ica_owned_flags').select('lang').eq('user_id', userId).order('bought_at', { ascending: true }),
    supabase.from('ica_display_flags').select('lang').eq('user_id', userId).maybeSingle(),
  ])
  if (owned.error) throw owned.error
  if (shown.error) throw shown.error
  return {
    owned: (owned.data ?? []).map((row) => String(row.lang)),
    shown: typeof shown.data?.lang === 'string' ? shown.data.lang : null,
  }
}

/** The student's flags. `buy()` buys the flag of the current target language. */
export function useMyFlags(userId: string | null | undefined) {
  const [flags, setFlags] = useState<MyFlags>(() =>
    userId ? peekQuick<MyFlags>(`${CACHE_PREFIX}${userId}`) ?? EMPTY : EMPTY,
  )

  const refresh = useCallback(async () => {
    if (!userId) {
      setFlags(EMPTY)
      return EMPTY
    }
    const next = await loadMyFlags(userId)
    setFlags(next)
    storeQuick(`${CACHE_PREFIX}${userId}`, next)
    return next
  }, [userId])

  useEffect(() => {
    setFlags(userId ? peekQuick<MyFlags>(`${CACHE_PREFIX}${userId}`) ?? EMPTY : EMPTY)
    void refresh().catch(() => undefined)
    const onChange = () => {
      void refresh().catch(() => undefined)
    }
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [refresh, userId])

  /** Buys the current target language's flag. Throws INSUFFICIENT_TOKENS / TARGET_LANG_REQUIRED. */
  const buy = useCallback(async (): Promise<{ lang: string; alreadyOwned: boolean }> => {
    if (!supabase || !userId) throw new Error('AUTH_REQUIRED')
    const { data, error } = await supabase.rpc('buy_language_flag')
    if (error) throw new Error(error.message)
    const row = (data ?? {}) as { ok?: boolean; alreadyOwned?: boolean; lang?: string }
    if (!row.ok || typeof row.lang !== 'string') throw new Error('FLAG_PURCHASE_FAILED')
    if (!row.alreadyOwned) gameSfx.spend()
    signalIcaCoinsStateChanged()
    window.dispatchEvent(new Event(CHANGED_EVENT))
    return { lang: row.lang, alreadyOwned: Boolean(row.alreadyOwned) }
  }, [userId])

  /** Shows one of the owned flags, or none (null). */
  const show = useCallback(
    async (lang: string | null) => {
      if (!supabase || !userId) return
      const { error } = await supabase.rpc('set_my_display_flag', { p_lang: lang })
      if (error) throw new Error(error.message)
      const next = { ...flags, shown: lang }
      setFlags(next)
      storeQuick(`${CACHE_PREFIX}${userId}`, next)
      window.dispatchEvent(new Event(CHANGED_EVENT))
    },
    [flags, userId],
  )

  return { ...flags, buy, show, refresh }
}
