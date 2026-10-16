// DESAFÍO ALEATORIO: CONTAR LOS CLICS (Luis, 16 Oct). Each tap on «Desafío aleatorio» saves a row
// when it is tapped and another one with how it ended, joined by the same tapId
// (public.ica_random_challenge_taps, migration 20261016100100). Never throws and never waits:
// counting must not slow down or break the challenge.
import { supabase } from '@/lib/supabase'

export type RandomChallengeTapEvent =
  | 'tap'
  | 'locked'
  | 'sent'
  | 'no_rival'
  | 'needs_pass'
  | 'cancelled'
  | 'error'

/** A new id for one tap (all its rows share it). */
export function newRandomChallengeTapId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* older browser: below */
  }
  // RFC 4122 version 4 by hand.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export function logRandomChallengeTap(tapId: string | null | undefined, event: RandomChallengeTapEvent): void {
  if (!supabase || !tapId) return
  try {
    void Promise.resolve(
      supabase.from('ica_random_challenge_taps').insert({ tap_id: tapId, event }),
    ).catch(() => {
      /* not counted: nothing else changes */
    })
  } catch {
    /* not counted: nothing else changes */
  }
}
