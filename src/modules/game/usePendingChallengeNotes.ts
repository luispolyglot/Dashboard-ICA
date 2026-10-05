import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CHALLENGE_PLAY_RECORDED_EVENT } from '../services/challengeUnlocks'
import type { ClosedMasterNote } from './useClosedMasterNotes'

/** A finished note «waits» for its nota desafiante during this many days. */
const PENDING_WINDOW_DAYS = 7

/**
 * NOTA DESAFIANTE WAITING (Luis, 5 Oct): master notes finished in the last week whose nota
 * desafiante has not been played yet. Juegos ICA (and the games card on Home) remind the student,
 * like the Desafíos ICA alerts. Older notes do not count, so nobody gets a pile of old reminders.
 */
export function usePendingChallengeNotes(notes: ClosedMasterNote[] | null, enabled: boolean): ClosedMasterNote[] {
  const recent = useMemo(() => {
    if (!enabled || !notes) return []
    const since = Date.now() - PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000
    return notes.filter((note) => note.totalDurationMs > 0 && note.closedAt && Date.parse(note.closedAt) >= since)
  }, [enabled, notes])
  const ids = recent.map((note) => note.id).join(',')
  const [played, setPlayed] = useState<Set<string> | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const onPlayed = () => setRefresh((value) => value + 1)
    window.addEventListener(CHALLENGE_PLAY_RECORDED_EVENT, onPlayed)
    return () => window.removeEventListener(CHALLENGE_PLAY_RECORDED_EVENT, onPlayed)
  }, [])

  useEffect(() => {
    if (!supabase || !ids) {
      setPlayed(new Set())
      return
    }
    let active = true
    void supabase
      .from('master_note_challenge_plays')
      .select('note_id')
      .in('note_id', ids.split(','))
      .then(({ data, error }) => {
        if (!active || error) return
        setPlayed(new Set((data || []).map((row) => String(row.note_id))))
      })
    return () => {
      active = false
    }
  }, [ids, refresh])

  return useMemo(() => (played === null ? [] : recent.filter((note) => !played.has(note.id))), [played, recent])
}
