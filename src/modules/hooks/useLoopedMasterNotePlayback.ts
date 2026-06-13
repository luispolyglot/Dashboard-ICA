import { useCallback, useEffect, useRef, useState } from 'react'

type UseLoopedMasterNotePlaybackParams = {
  playingNoteId: string | null
  playNoteById: (noteId: string) => Promise<void>
  playTransitionCue: (kind: 'start' | 'step' | 'finish') => Promise<unknown>
  stopPlayback: () => void
  autoAdvanceDelayMs?: number
}

export function useLoopedMasterNotePlayback({
  playingNoteId,
  playNoteById,
  playTransitionCue,
  stopPlayback,
  autoAdvanceDelayMs = 900,
}: UseLoopedMasterNotePlaybackParams) {
  const [looping, setLooping] = useState(false)
  const [loopIds, setLoopIds] = useState<string[]>([])
  const [loopIndex, setLoopIndex] = useState(0)
  const [repeatEnabled, setRepeatEnabled] = useState(true)

  const tokenRef = useRef(0)
  const previousPlayingNoteIdRef = useRef<string | null>(null)
  const suppressAutoAdvanceRef = useRef(false)

  const stopLoop = useCallback((stopCurrent = false): void => {
    tokenRef.current += 1
    setLooping(false)
    setLoopIds([])
    setLoopIndex(0)
    if (stopCurrent) {
      stopPlayback()
    }
  }, [stopPlayback])

  const playLoopNoteAt = useCallback(async (
    index: number,
    ids: string[],
    token: number,
    cueKind: 'start' | 'step' = 'step',
    delayBeforeCueMs = 0,
  ): Promise<void> => {
    if (ids.length === 0) return
    if (token !== tokenRef.current) return

    suppressAutoAdvanceRef.current = true

    try {
      if (delayBeforeCueMs > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, delayBeforeCueMs)
        })
        if (token !== tokenRef.current) return
      }

      const safeIndex = ((index % ids.length) + ids.length) % ids.length
      const noteId = ids[safeIndex]
      if (!noteId) return

      setLoopIndex(safeIndex)

      await playTransitionCue(cueKind)
      if (token !== tokenRef.current) return

      await playNoteById(noteId)
    } finally {
      suppressAutoAdvanceRef.current = false
    }
  }, [playNoteById, playTransitionCue])

  const startLoop = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false

    const token = tokenRef.current + 1
    tokenRef.current = token

    setLooping(true)
    setLoopIds(ids)
    setLoopIndex(0)

    await playLoopNoteAt(0, ids, token, 'start')
    return true
  }, [playLoopNoteAt])

  const playNext = useCallback(async (): Promise<void> => {
    if (!looping || loopIds.length === 0) return
    const token = tokenRef.current
    const nextIndex = (loopIndex + 1) % loopIds.length
    await playLoopNoteAt(nextIndex, loopIds, token, 'step')
  }, [loopIds, loopIndex, looping, playLoopNoteAt])

  const playPrevious = useCallback(async (): Promise<void> => {
    if (!looping || loopIds.length === 0) return
    const token = tokenRef.current
    const prevIndex = (loopIndex - 1 + loopIds.length) % loopIds.length
    await playLoopNoteAt(prevIndex, loopIds, token, 'step')
  }, [loopIds, loopIndex, looping, playLoopNoteAt])

  const replayCurrent = useCallback(async (): Promise<void> => {
    if (!looping || loopIds.length === 0) return
    const token = tokenRef.current
    await playLoopNoteAt(loopIndex, loopIds, token, 'step')
  }, [loopIds, loopIndex, looping, playLoopNoteAt])

  useEffect(() => {
    const prevPlayingNoteId = previousPlayingNoteIdRef.current

    if (suppressAutoAdvanceRef.current) {
      previousPlayingNoteIdRef.current = playingNoteId
      return
    }

    if (
      looping
      && prevPlayingNoteId
      && !playingNoteId
      && loopIds.length > 0
    ) {
      if (!repeatEnabled && loopIndex === loopIds.length - 1) {
        void playTransitionCue('finish')
        setLoopIndex(0)
        previousPlayingNoteIdRef.current = playingNoteId
        return
      }

      const token = tokenRef.current
      const nextIndex = (loopIndex + 1) % loopIds.length
      void playLoopNoteAt(nextIndex, loopIds, token, 'step', autoAdvanceDelayMs)
    }

    previousPlayingNoteIdRef.current = playingNoteId
  }, [
    autoAdvanceDelayMs,
    loopIds,
    loopIndex,
    looping,
    playLoopNoteAt,
    playTransitionCue,
    playingNoteId,
    repeatEnabled,
  ])

  return {
    looping,
    loopIds,
    loopIndex,
    repeatEnabled,
    setRepeatEnabled,
    startLoop,
    stopLoop,
    playNext,
    playPrevious,
    replayCurrent,
  }
}
