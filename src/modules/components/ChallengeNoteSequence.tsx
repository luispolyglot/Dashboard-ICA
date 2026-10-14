import { useEffect, useRef } from 'react'
import { t } from '@/i18n'
import { useLoopedMasterNotePlayback } from '../hooks/useLoopedMasterNotePlayback'
import { speakNatural } from '../services/tts'
import { formatMasterNoteLabel } from '../services/masterNotes'
import { SHARED_MASTER_NOTE_STOPPED_EVENT, useSharedMasterNotePlayback } from './MasterNotePlaybackProvider'
import { useChallengeSequenceStore, type SequenceRequest } from '../stores/challengeSequenceStore'

// NOTA DESAFIANTE: «ESCUCHAR TODAS SEGUIDAS» QUE SIGUE AL CAMBIAR DE PANTALLA (Luis, 12 Oct).
// Before, the list screen had its own player and its own «one after the other» logic, so going to
// Inicio cut the note. Now the notes play in the app's shared player (MasterNotePlaybackProvider),
// and the «one after the other» logic lives here, mounted in the layout only while it runs. The
// list screen just reads this store and sends orders.

// What the voice says before each note, in Spanish for Spanish speakers and in English for anyone
// else (Nahuel, 14 Oct): the text and the voice go in the same language. Before, the text followed
// the app's language (t) while the voice used the native language, so they could not match.
const ORDINALS: Array<{ es: string; en: string }> = [
  { es: 'Primera nota maestra', en: 'First master note' },
  { es: 'Segunda nota maestra', en: 'Second master note' },
  { es: 'Tercera nota maestra', en: 'Third master note' },
  { es: 'Cuarta nota maestra', en: 'Fourth master note' },
  { es: 'Quinta nota maestra', en: 'Fifth master note' },
  { es: 'Sexta nota maestra', en: 'Sixth master note' },
  { es: 'Séptima nota maestra', en: 'Seventh master note' },
  { es: 'Octava nota maestra', en: 'Eighth master note' },
  { es: 'Novena nota maestra', en: 'Ninth master note' },
  { es: 'Décima nota maestra', en: 'Tenth master note' },
]

/** Spanish natives hear Spanish; everyone else, English. */
function announcementLanguage(nativeLang: string): { key: 'es' | 'en'; voiceLang: string } {
  return nativeLang === 'Español' ? { key: 'es', voiceLang: 'Español' } : { key: 'en', voiceLang: 'Inglés' }
}

/**
 * What the voice says before each note: «Primera nota maestra», «Segunda nota maestra»… (or
 * «First master note»…), and the language of the voice that says it.
 */
export function sequenceAnnouncement(index: number, nativeLang: string): { text: string; voiceLang: string } {
  const { key, voiceLang } = announcementLanguage(nativeLang)
  const ordinal = ORDINALS[index]
  const text = ordinal ? ordinal[key] : key === 'es' ? `Nota maestra ${index + 1}` : `Master note ${index + 1}`
  return { text, voiceLang }
}

/** Dice la frase y espera a que termine (como mucho 5 segundos). */
function speakAndWait(text: string, langName: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    window.setTimeout(finish, 5000)
    try {
      speakNatural(text, langName, finish)
    } catch {
      finish()
    }
  })
}

/** Mounted in the layout: runs «todas seguidas» while there is one. */
export function ChallengeSequenceHost() {
  const request = useChallengeSequenceStore((state) => state.request)
  if (!request || request.notes.length === 0) return null
  return <ChallengeSequenceRunner key={request.token} request={request} />
}

function ChallengeSequenceRunner({ request }: { request: SequenceRequest }) {
  const playback = useSharedMasterNotePlayback()
  const { notes, startIndex, nativeLang } = request
  const ids = useRef(notes.slice(startIndex).map((note) => note.id)).current
  const byId = useRef(new Map(notes.map((note) => [note.id, note]))).current
  const playbackRef = useRef(playback)
  playbackRef.current = playback

  const sequence = useLoopedMasterNotePlayback({
    playingNoteId: playback.playingNoteId,
    isPaused: playback.isPaused,
    playNoteById: async (noteId) => {
      const note = byId.get(noteId)
      if (note) await playbackRef.current.play(note)
    },
    playTransitionCue: async (kind, index) => {
      if (kind === 'finish') {
        // The last note ended: «todas seguidas» is over.
        window.setTimeout(() => useChallengeSequenceStore.getState().end(), 0)
        return
      }
      playbackRef.current.stopQuietly()
      // The voice says the note's place among all of them (starting at the 3rd says «Tercera»).
      const announcement = sequenceAnnouncement(startIndex + (index ?? 0), nativeLang)
      await speakAndWait(announcement.text, announcement.voiceLang)
    },
    pausePlayback: playback.pause,
    resumePlayback: playback.resume,
    seekBack10: playback.seekBack10,
    seekForward10: playback.seekForward10,
    resolveNowPlayingMetadata: (noteId) => {
      const note = byId.get(noteId)
      return note ? { title: formatMasterNoteLabel(note.name), artist: t('Nota maestra'), album: 'ICADEMY' } : null
    },
    stopPlayback: () => playbackRef.current.stopQuietly(),
  })
  const sequenceRef = useRef(sequence)
  sequenceRef.current = sequence

  // Start once, one after the other (no loop: after the last one it stops).
  useEffect(() => {
    sequenceRef.current.setRepeatEnabled(false)
    void sequenceRef.current.startLoop(ids)
    return () => sequenceRef.current.stopLoop(false)
  }, [ids])

  // Share the state and the buttons with the list screen and the small player.
  useEffect(() => {
    useChallengeSequenceStore.setState({
      looping: sequence.looping,
      loopIds: sequence.loopIds,
      loopIndex: sequence.loopIndex,
      repeatEnabled: sequence.repeatEnabled,
      controls: {
        playNext: () => void sequenceRef.current.playNext(),
        playPrevious: () => void sequenceRef.current.playPrevious(),
        setRepeatEnabled: (value) => sequenceRef.current.setRepeatEnabled(value),
        stop: () => {
          sequenceRef.current.stopLoop(false)
          playbackRef.current.stopQuietly()
          useChallengeSequenceStore.getState().end()
        },
      },
    })
  }, [sequence.looping, sequence.loopIds, sequence.loopIndex, sequence.repeatEnabled])

  // Someone pressed «stop» somewhere else (the small player, another screen…): it is over.
  useEffect(() => {
    const onStopped = () => {
      sequenceRef.current.stopLoop(false)
      useChallengeSequenceStore.getState().end()
    }
    window.addEventListener(SHARED_MASTER_NOTE_STOPPED_EVENT, onStopped)
    return () => window.removeEventListener(SHARED_MASTER_NOTE_STOPPED_EVENT, onStopped)
  }, [])

  // Another note (not one of these) started in the shared player (Activación, a single note…):
  // «todas seguidas» ends without stopping that note.
  useEffect(() => {
    const playing = playback.playingNoteId
    if (playing && !byId.has(playing)) {
      sequenceRef.current.stopLoop(false)
      useChallengeSequenceStore.getState().end()
    }
  }, [byId, playback.playingNoteId])

  return null
}
