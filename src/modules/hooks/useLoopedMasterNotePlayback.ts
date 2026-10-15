import { useCallback, useEffect, useRef, useState } from 'react'

type UseLoopedMasterNotePlaybackParams = {
  playingNoteId: string | null
  isPaused?: boolean
  playNoteById: (noteId: string) => Promise<void>
  /** Prepares a note ahead of time (the next one, while the current one plays). Optional. */
  prefetchNoteById?: (noteId: string) => void
  /** Suena entre nota y nota. `index` es la posición (desde 0) de la nota que va a sonar. */
  playTransitionCue: (kind: 'start' | 'step' | 'finish', index?: number) => Promise<unknown>
  pausePlayback?: () => void
  resumePlayback?: () => Promise<void>
  seekBack10?: () => void
  seekForward10?: () => void
  resolveNowPlayingMetadata?: (noteId: string) => {
    title: string
    artist?: string
    album?: string
  } | null
  stopPlayback: () => void
  autoAdvanceDelayMs?: number
}

export function useLoopedMasterNotePlayback({
  playingNoteId,
  isPaused = false,
  playNoteById,
  prefetchNoteById,
  playTransitionCue,
  pausePlayback,
  resumePlayback,
  seekBack10,
  seekForward10,
  resolveNowPlayingMetadata,
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

      await playTransitionCue(cueKind, safeIndex)
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
      // With the phone locked or the app in the background, the next one goes on at once, on every
      // phone (before only on iPhone): Android delays or freezes the timers of a page in the
      // background, and a silent gap can make it stop the sound (alumna con Android, 15 Oct).
      const shouldUseImmediateAutoAdvance = typeof document !== 'undefined' && document.hidden
      const delayBeforeCueMs = shouldUseImmediateAutoAdvance ? 0 : autoAdvanceDelayMs
      void playLoopNoteAt(nextIndex, loopIds, token, 'step', delayBeforeCueMs)
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

  // While a note of the list plays, the next one is prepared, so the change needs no download.
  const prefetchRef = useRef(prefetchNoteById)
  prefetchRef.current = prefetchNoteById
  useEffect(() => {
    const prefetchNoteById = prefetchRef.current
    if (!looping || !playingNoteId || !prefetchNoteById || loopIds.length < 2) return
    const index = loopIds.indexOf(playingNoteId)
    if (index < 0) return
    if (!repeatEnabled && index === loopIds.length - 1) return
    const nextId = loopIds[(index + 1) % loopIds.length]
    if (nextId && nextId !== playingNoteId) prefetchNoteById(nextId)
  }, [looping, playingNoteId, loopIds, repeatEnabled])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const mediaSession = navigator.mediaSession
    const setActionHandlerSafely = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        mediaSession.setActionHandler(action, handler)
      } catch {
        // noop
      }
    }
    const effectiveNoteId = playingNoteId || (looping ? loopIds[loopIndex] || null : null)
    const playbackState: MediaSessionPlaybackState = effectiveNoteId
      ? (isPaused ? 'paused' : 'playing')
      : 'none'

    if (effectiveNoteId) {
      const metadata = resolveNowPlayingMetadata?.(effectiveNoteId)
      if (metadata) {
        mediaSession.metadata = new MediaMetadata({
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
        })
      }
    }
    mediaSession.playbackState = playbackState

    setActionHandlerSafely('play', () => {
      if (!resumePlayback) return
      void resumePlayback()
    })

    setActionHandlerSafely('pause', () => {
      pausePlayback?.()
    })

    setActionHandlerSafely('nexttrack', () => {
      void playNext()
    })

    setActionHandlerSafely('previoustrack', () => {
      void playPrevious()
    })

    setActionHandlerSafely('seekbackward', () => {
      seekBack10?.()
    })

    setActionHandlerSafely('seekforward', () => {
      seekForward10?.()
    })

    return () => {
      setActionHandlerSafely('play', null)
      setActionHandlerSafely('pause', null)
      setActionHandlerSafely('nexttrack', null)
      setActionHandlerSafely('previoustrack', null)
      setActionHandlerSafely('seekbackward', null)
      setActionHandlerSafely('seekforward', null)
    }
  }, [
    isPaused,
    pausePlayback,
    playNext,
    playPrevious,
    loopIds,
    loopIndex,
    looping,
    playingNoteId,
    resolveNowPlayingMetadata,
    resumePlayback,
    seekBack10,
    seekForward10,
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
