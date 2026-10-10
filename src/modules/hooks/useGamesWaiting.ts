import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useChallengeEnabled } from '../services/challengeChunks'
import { useClosedMasterNotes } from '../game/useClosedMasterNotes'
import { usePendingChallengeNotes } from '../game/usePendingChallengeNotes'
import { CHALLENGE_NOTE_MIN_CLOSED_NOTES } from '../game/rules'
import { DASHBOARD_ROUTES } from '../routes/paths'

/** The PreguntICA state is asked again on a screen change at most this often. */
const PREGUNTICA_REFRESH_MS = 60_000

/**
 * Something waiting in Juegos besides the Desafíos ICA (they have their own number): a nota
 * desafiante to play (a master note finished this week) or a PreguntICA ready. The «Juegos»
 * button of the menu gets a dot (Luis, 8 Oct).
 */
export function useGamesWaiting(targetLang?: string, nativeLang?: string): boolean {
  const { pathname } = useLocation()
  const challengeNoteEnabled = useChallengeEnabled()
  const { notes: closedNoteList } = useClosedMasterNotes(targetLang, nativeLang)
  const pendingNotes = usePendingChallengeNotes(
    closedNoteList,
    challengeNoteEnabled && (closedNoteList?.length ?? 0) >= CHALLENGE_NOTE_MIN_CLOSED_NOTES,
  )
  const [pregunticaReady, setPregunticaReady] = useState(false)
  const lastAsk = useRef<{ at: number; key: string; path: string } | null>(null)

  useEffect(() => {
    if (!targetLang || !nativeLang) return
    const key = `${targetLang}|${nativeLang}`
    const previous = lastAsk.current
    // Coming back from PreguntICA, or after a while, or with another language: ask again.
    const leftPreguntica = previous?.path.startsWith(DASHBOARD_ROUTES.preguntica) && !pathname.startsWith(DASHBOARD_ROUTES.preguntica)
    if (previous && previous.key === key && !leftPreguntica && Date.now() - previous.at < PREGUNTICA_REFRESH_MS) {
      lastAsk.current = { ...previous, path: pathname }
      return
    }
    lastAsk.current = { at: Date.now(), key, path: pathname }
    let active = true
    void import('../services/preguntica')
      .then(({ fetchPregunticaWeekStatus }) => fetchPregunticaWeekStatus({ targetLang, nativeLang }))
      .then((status) => {
        if (active) setPregunticaReady(Boolean(status?.isUnlocked && !status.completedAt))
      })
      .catch(() => {
        if (active) setPregunticaReady(false)
      })
    return () => {
      active = false
    }
  }, [nativeLang, pathname, targetLang])

  return pendingNotes.length > 0 || pregunticaReady
}
