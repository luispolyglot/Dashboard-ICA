import { supabase } from '@/lib/supabase'
import type { Lexicard } from '../types'

/**
 * POTENCIAR (Luis, 8 Oct): a word that is already in the Baúl ICA can be boosted from Inmersión.
 * It becomes Vital and comes first in the next 2 games of each kind (flashcards, daily challenge
 * and Desafíos ICA). The counters live in lexicards.boost_flash / boost_daily / boost_duel.
 */
export const BOOST_GAMES = 2

export type BoostGame = 'flash' | 'daily' | 'duel'

/** Boosts one of your words (Vital + 2 games of each kind). */
export async function boostLexicard(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.rpc('boost_lexicard', { p_id: id })
  if (error) throw error
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
