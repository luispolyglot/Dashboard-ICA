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

const ORDINALS = [
  'Primera nota maestra',
  'Segunda nota maestra',
  'Tercera nota maestra',
  'Cuarta nota maestra',
  'Quinta nota maestra',
  'Sexta nota maestra',
  'Séptima nota maestra',
  'Octava nota maestra',
  'Novena nota maestra',
  'Décima nota maestra',
]

/** Lo que dice la voz antes de cada nota: «Primera nota maestra», «Segunda nota maestra»… */
export function sequenceAnnouncement(index: number): string {
  return ORDINALS[index] ? t(ORDINALS[index]) : t('Nota maestra {n}', { n: index + 1 })
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
      await speakAndWait(sequenceAnnouncement(startIndex + (index ?? 0)), nativeLang)
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
