import { supabase } from '@/lib/supabase'
import type { Lexicard } from '../types'

/**
 * POTENCIAR (Luis, 8 Oct): a word that is already in the Baúl ICA can be boosted from Inmersión.
 * It becomes Vital and comes first in the next 2 games of each kind (flashcards, daily challenge
 * and Desafíos ICA). The counters live in lexicards.boost_flash / boost_daily / boost_duel.
 * Max 3 boosts a day (Luis, 12 Oct), from Inmersión, the results of a Desafío ICA and PreguntICA.
 */
export const BOOST_GAMES = 2

export type BoostGame = 'flash' | 'daily' | 'duel'

/** Boosts allowed per day, in total (Inmersión, Desafíos ICA and PreguntICA). The server enforces it. */
export const BOOST_DAILY_LIMIT = 3

/** Where the boost was tapped (the server keeps it with the day's count). */
export type BoostSource = 'immersion' | 'challenge' | 'preguntica'

export type BoostUsage = { used: number; remaining: number; limit: number }

export class BoostLimitError extends Error {
  constructor() {
    super('BOOST_DAILY_LIMIT')
    this.name = 'BoostLimitError'
  }
}

function parseUsage(value: unknown): BoostUsage | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const used = Number(row.used)
  const remaining = Number(row.remaining)
  const limit = Number(row.limit)
  if (![used, remaining, limit].every(Number.isFinite)) return null
  return { used, remaining, limit }
}

/** How many boosts are left today. Null when the server cannot say (the button stays available). */
export async function fetchBoostUsage(): Promise<BoostUsage | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('get_my_lexicard_boost_usage')
    if (error) return null
    return parseUsage(data)
  } catch {
    return null
  }
}

/**
 * Boosts one of your words (Vital + 2 games of each kind). Max 3 a day: the 4th throws
 * BoostLimitError. Returns the numbers of the day (null with a server that does not report them).
 */
export async function boostLexicard(id: string, source: BoostSource = 'immersion'): Promise<BoostUsage | null> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.rpc('boost_lexicard', { p_id: id, p_source: source })
  if (error) {
    if (String(error.message || '').includes('BOOST_DAILY_LIMIT')) throw new BoostLimitError()
    // The app can be published a few minutes before the database is updated: the old function
    // only takes the id (and has no daily limit), so it is called that way.
    if (error.code === 'PGRST202') {
      const fallback = await supabase.rpc('boost_lexicard', { p_id: id })
      if (fallback.error) throw fallback.error
      return null
    }
    throw error
  }
  return parseUsage(data)
}

/** One game played with these boosted words. Never fails (a missed count is harmless). */
export async function consumeLexicardBoosts(ids: string[], game: BoostGame): Promise<void> {
  if (!supabase || ids.length === 0) return
  try {
    await supabase.rpc('consume_lexicard_boosts', { p_ids: ids, p_game: game })
  } catch {
    // Without the boost columns (database not updated yet) there is nothing to use up.
  }
}

/**
 * The boost counters of your boosted words. Read apart from the rest of the Baúl ICA, so that a
 * database without these columns yet still loads the words exactly as before.
 */
export async function fetchLexicardBoosts(userId: string): Promise<Map<string, Pick<Lexicard, 'boostFlash' | 'boostDaily' | 'boostDuel'>>> {
  const boosts = new Map<string, Pick<Lexicard, 'boostFlash' | 'boostDaily' | 'boostDuel'>>()
  if (!supabase) return boosts
  try {
    const { data, error } = await supabase
      .from('lexicards')
      .select('id, boost_flash, boost_daily, boost_duel')
      .eq('user_id', userId)
      .or('boost_flash.gt.0,boost_daily.gt.0,boost_duel.gt.0')
    if (error || !data) return boosts
    for (const row of data as Array<Record<string, unknown>>) {
      boosts.set(String(row.id), {
        boostFlash: Number(row.boost_flash) || 0,
        boostDaily: Number(row.boost_daily) || 0,
        boostDuel: Number(row.boost_duel) || 0,
      })
    }
  } catch {
    // Same as above: no boosts.
  }
  return boosts
}

export function isBoosted(card: Pick<Lexicard, 'boostFlash' | 'boostDaily' | 'boostDuel'>, game: BoostGame): boolean {
  const left = game === 'flash' ? card.boostFlash : game === 'daily' ? card.boostDaily : card.boostDuel
  return (left ?? 0) > 0
}
