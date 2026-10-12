// ESCUCHAR MI BAÚL ICA (Luis, 11 Oct; idea de Natalia): the words of the vault one after another,
// first in your language and then in the one you learn, with a pause after each to repeat them.
// What was already heard is saved in public.lexicard_listens (migration 20261011160000).
import { supabase } from '@/lib/supabase'
import type { Lexicard } from '../types'

/** How many words in a row the student can choose (Luis, 11 Oct: at most 50, more is too much). */
export const VAULT_LISTEN_COUNTS = [10, 20, 30, 40, 50] as const
export type VaultListenCount = (typeof VAULT_LISTEN_COUNTS)[number]

/** Pause after each word (your language, then the one you learn), to repeat it out loud. */
export const VAULT_LISTEN_PAUSE_MS = 1500

export type VaultListenOrder = 'list' | 'random'

/**
 * The words that will be played (`cards` comes already filtered and sorted like the list). With
 * `onlyUnheard`, the ones already heard are left out. `order: 'random'` (Luis, 11 Oct) picks them
 * at random from the whole filter instead of from the top of the list.
 */
export function pickListeningQueue(
  cards: Lexicard[],
  options: {
    count: number
    onlyUnheard: boolean
    heardIds: ReadonlySet<string>
    order?: VaultListenOrder
    random?: () => number
  },
): Lexicard[] {
  const pool = (options.onlyUnheard ? cards.filter((card) => !options.heardIds.has(card.id)) : cards).filter(
    (card) => card.target.trim() && card.native.trim(),
  )
  if (options.order === 'random') {
    const random = options.random ?? Math.random
    const shuffled = [...pool]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1))
      ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
    }
    return shuffled.slice(0, Math.max(0, options.count))
  }
  return pool.slice(0, Math.max(0, options.count))
}

/** Ids of the words this student has already heard. Empty if it cannot be read. */
export async function fetchListenedWordIds(): Promise<Set<string>> {
  if (!supabase) return new Set()
  const ids = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('lexicard_listens')
      .select('lexicard_id')
      .range(from, from + pageSize - 1)
    if (error) return ids
    for (const row of data || []) ids.add(String((row as { lexicard_id: unknown }).lexicard_id))
    if (!data || data.length < pageSize) return ids
  }
}

/** Saves that a word has been heard (only the first time counts). Never throws. */
export async function markWordListened(lexicardId: string): Promise<void> {
  if (!supabase) return
  try {
    await supabase
      .from('lexicard_listens')
      .upsert({ lexicard_id: lexicardId }, { onConflict: 'user_id,lexicard_id', ignoreDuplicates: true })
  } catch {
    /* not saved: the word just stays as «sin escuchar» */
  }
}
