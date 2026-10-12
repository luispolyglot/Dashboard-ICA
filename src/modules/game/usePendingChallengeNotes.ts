import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import {
  CHALLENGE_NOTE_SEEN_EVENT,
  CHALLENGE_PLAY_RECORDED_EVENT,
  CHALLENGE_UNLOCKS_CHANGED_EVENT,
  getCachedUnlockedNoteIds,
  getChallengeWeekStamp,
  isChallengeNoteSeen,
  type ChallengeUnlocksChangedDetail,
} from '../services/challengeUnlocks'
import type { ClosedMasterNote } from './useClosedMasterNotes'

/**
 * NOTA DESAFIANTE WAITING (Luis, 12 Oct): a finished master note whose challenge is open this
 * week (the student listened to 80 % of it) and on which the student has not pressed «Jugar»
 * yet. Juegos ICA shows the diana with the count, Home its pill and the menu a dot on «Juegos».
 * Pressing «Jugar» (or finishing the challenge) removes it for the week, even if they leave.
 * Next week, if they unlock the same note again, it comes back once.
 */
export function usePendingChallengeNotes(notes: ClosedMasterNote[] | null, enabled: boolean): ClosedMasterNote[] {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const closed = useMemo(
    () => (enabled && notes ? notes.filter((note) => note.totalDurationMs > 0) : []),
    [enabled, notes],
  )
  const ids = closed.map((note) => note.id).join(',')
  const [serverUnlocked, setServerUnlocked] = useState<Set<string>>(() => new Set())
  const [playedThisWeek, setPlayedThisWeek] = useState<Set<string>>(() => new Set())
  const [refresh, setRefresh] = useState(0)
  const [seenTick, setSeenTick] = useState(0)

  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1)
    // Only the moment a note crosses 80 % matters (listening fires this event constantly).
    const onUnlockChanged = (event: Event) => {
      if ((event as CustomEvent<ChallengeUnlocksChangedDetail>).detail?.justUnlocked) reload()
    }
    const onSeen = () => setSeenTick((value) => value + 1)
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    window.addEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onUnlockChanged)
    window.addEventListener(CHALLENGE_PLAY_RECORDED_EVENT, reload)
    window.addEventListener(CHALLENGE_NOTE_SEEN_EVENT, onSeen)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(CHALLENGE_UNLOCKS_CHANGED_EVENT, onUnlockChanged)
      window.removeEventListener(CHALLENGE_PLAY_RECORDED_EVENT, reload)
      window.removeEventListener(CHALLENGE_NOTE_SEEN_EVENT, onSeen)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !ids || !userId) {
      setServerUnlocked(new Set())
      setPlayedThisWeek(new Set())
      return
    }
    let active = true
    const noteIds = ids.split(',')
    // This week's unlocks (the server knows the ones from other devices too).
    void client
      .rpc('get_my_master_note_challenge_unlocks', { p_note_ids: noteIds })
      .then(({ data, error }) => {
        if (!active || error) return
        const rows = (data || []) as Array<{ note_id: string; unlocked_at: string | null }>
        setServerUnlocked(new Set(rows.filter((row) => row.unlocked_at).map((row) => String(row.note_id))))
      })
    // Challenges already played this week (on any device) do not wait any more.
    void client
      .from('master_note_challenge_plays')
      .select('note_id')
      .in('note_id', noteIds)
      .gte('day', getChallengeWeekStamp())
      .then(({ data, error }) => {
        if (!active || error) return
        setPlayedThisWeek(new Set((data || []).map((row) => String(row.note_id))))
      })
    return () => {
      active = false
    }
  }, [ids, refresh, userId])

  return useMemo(() => {
    // `refresh` and `seenTick` re-read this device's unlocks and «Jugar» presses.
    void refresh
    void seenTick
    const localUnlocked = new Set(getCachedUnlockedNoteIds(userId))
    return closed.filter(
      (note) =>
        (serverUnlocked.has(note.id) || localUnlocked.has(note.id))
        && !playedThisWeek.has(note.id)
        && !isChallengeNoteSeen(userId, note.id),
    )
  }, [closed, playedThisWeek, refresh, seenTick, serverUnlocked, userId])
}
