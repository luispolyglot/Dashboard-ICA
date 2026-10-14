import { create } from 'zustand'
import type { MasterNote } from '../types'

// State of Nota desafiante's «Escuchar todas seguidas» (Luis, 12 Oct), shared by the list screen,
// the small player at the top and the runner in the layout (components/ChallengeNoteSequence).

export type SequenceRequest = {
  /** All the closed notes, oldest first. The voice says each one's place in this list. */
  notes: MasterNote[]
  /** Where to start (index in `notes`). */
  startIndex: number
  nativeLang: string
  token: number
}

type SequenceControls = {
  playNext: () => void
  playPrevious: () => void
  setRepeatEnabled: (value: boolean) => void
  /** Stops the notes and ends «todas seguidas». */
  stop: () => void
}

type SequenceState = {
  request: SequenceRequest | null
  looping: boolean
  loopIds: string[]
  loopIndex: number
  repeatEnabled: boolean
  controls: SequenceControls | null
  /** Where the small player at the top takes you for a note played from Nota desafiante. */
  origin: { noteId: string; path: string } | null
  start: (notes: MasterNote[], startIndex: number, nativeLang: string) => void
  end: () => void
  setOrigin: (origin: { noteId: string; path: string } | null) => void
}

export const useChallengeSequenceStore = create<SequenceState>((set, get) => ({
  request: null,
  looping: false,
  loopIds: [],
  loopIndex: 0,
  repeatEnabled: false,
  controls: null,
  origin: null,
  start: (notes, startIndex, nativeLang) =>
    set({
      request: { notes, startIndex: Math.max(0, Math.min(startIndex, notes.length - 1)), nativeLang, token: (get().request?.token ?? 0) + 1 },
      looping: true,
      loopIds: notes.slice(Math.max(0, startIndex)).map((note) => note.id),
      loopIndex: 0,
    }),
  end: () => set({ request: null, looping: false, loopIds: [], loopIndex: 0, controls: null }),
  setOrigin: (origin) => set({ origin }),
}))

