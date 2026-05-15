import { useEffect, useRef, useState } from 'react'
import type { MasterNote } from '../types'
import {
  createSignedMasterNoteAudioUrl,
  fetchMasterNoteChunks,
} from '../services/masterNotes'

type PlaylistTrack = {
  url: string
  durationSec: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function useMasterNotePlayback() {
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)

  const tokenRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playlistRef = useRef<PlaylistTrack[]>([])
  const currentTrackIndexRef = useRef(0)

  const stop = (): void => {
    tokenRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setPlayingNoteId(null)
    setIsPaused(false)
    setPositionSec(0)
    setDurationSec(0)
  }

  const pause = (): void => {
    if (!audioRef.current || !playingNoteId) return
    if (!audioRef.current.paused) {
      audioRef.current.pause()
      setIsPaused(true)
    }
  }

  const resume = async (): Promise<void> => {
    if (!audioRef.current || !playingNoteId) return
    if (!audioRef.current.paused) return

    try {
      await audioRef.current.play()
      setIsPaused(false)
    } catch {
      setError('No se pudo reanudar la reproducción')
    }
  }

  const togglePause = (): void => {
    if (isPaused) {
      void resume()
      return
    }
    pause()
  }

  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  const getTrackDuration = (index: number): number => {
    const track = playlistRef.current[index]
    if (!track) return 0
    return track.durationSec
  }

  const getTotalDuration = (): number => {
    return playlistRef.current.reduce((sum, _, index) => sum + getTrackDuration(index), 0)
  }

  const getCurrentGlobalTime = (): number => {
    const base = playlistRef.current
      .slice(0, currentTrackIndexRef.current)
      .reduce((sum, _, index) => sum + getTrackDuration(index), 0)
    const current = audioRef.current?.currentTime || 0
    return base + current
  }

  const updateTimeline = (): void => {
    setPositionSec(getCurrentGlobalTime())
    setDurationSec(getTotalDuration())
  }

  const playTrackAt = async (
    trackIndex: number,
    startSec: number,
    token: number,
  ): Promise<void> => {
    if (token !== tokenRef.current) return

    const track = playlistRef.current[trackIndex]
    if (!track) {
      setPlayingNoteId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    const audio = new Audio(track.url)
    audioRef.current = audio
    currentTrackIndexRef.current = trackIndex

    const onEnded = () => {
      if (token !== tokenRef.current) return
      const nextIndex = trackIndex + 1
      if (nextIndex >= playlistRef.current.length) {
        setPlayingNoteId(null)
        setIsPaused(false)
        return
      }
      void playTrackAt(nextIndex, 0, token)
    }

    const onError = () => {
      if (token !== tokenRef.current) return
      setError('No se pudo reproducir la nota maestra')
      setPlayingNoteId(null)
      setIsPaused(false)
    }

    audio.onended = onEnded
    audio.onerror = onError
    audio.ontimeupdate = () => {
      if (token !== tokenRef.current) return
      updateTimeline()
    }
    audio.onloadedmetadata = () => {
      if (token !== tokenRef.current) return
      updateTimeline()
    }

    if (startSec > 0) {
      const setStart = () => {
        const maxStart = Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.max(0, audio.duration - 0.05)
          : startSec
        audio.currentTime = Math.min(startSec, maxStart)
      }

      if (audio.readyState >= 1) {
        setStart()
      } else {
        audio.onloadedmetadata = () => {
          if (token !== tokenRef.current) return
          setStart()
          updateTimeline()
        }
      }
    }

    try {
      await audio.play()
      setIsPaused(false)
    } catch {
      if (token !== tokenRef.current) return
      setError('No se pudo reproducir la nota maestra')
      setPlayingNoteId(null)
      setIsPaused(false)
    }
  }

  const seekBy = (deltaSec: number): void => {
    if (!playingNoteId || !audioRef.current || playlistRef.current.length === 0) return

    const token = tokenRef.current
    const total = getTotalDuration()
    if (total <= 0) return

    const target = clamp(getCurrentGlobalTime() + deltaSec, 0, total)

    let cumulative = 0
    let targetIndex = 0
    let targetOffset = 0

    for (let i = 0; i < playlistRef.current.length; i += 1) {
      const duration = Math.max(getTrackDuration(i), 0)
      if (target <= cumulative + duration || i === playlistRef.current.length - 1) {
        targetIndex = i
        targetOffset = Math.max(0, target - cumulative)
        break
      }
      cumulative += duration
    }

    if (targetIndex === currentTrackIndexRef.current && audioRef.current) {
      audioRef.current.currentTime = targetOffset
      updateTimeline()
      return
    }

    void playTrackAt(targetIndex, targetOffset, token)
  }

  const canPlay = (note: MasterNote, chunkCount = 0): boolean => {
    if (note.state === 'open') {
      return chunkCount > 0 || note.total_duration_ms > 0
    }

    if (note.close_type === 'final') {
      return Boolean(note.final_audio_path)
    }
    return chunkCount > 0 || note.total_duration_ms > 0
  }

  const play = async (note: MasterNote, preloadedChunkCount = 0): Promise<void> => {
    if (playingNoteId === note.id) return

    stop()
    setError(null)

    const tracks: PlaylistTrack[] = []

    if (note.close_type === 'final' && note.final_audio_path) {
      const signedUrl = await createSignedMasterNoteAudioUrl(note.final_audio_path)
      tracks.push({
        url: signedUrl,
        durationSec: Math.max(1, note.total_duration_ms / 1000),
      })
    } else {
      const chunks = await fetchMasterNoteChunks(note.id)
      if (chunks.length === 0 && preloadedChunkCount === 0) {
        setError('No hay audios para reproducir en esta nota maestra')
        return
      }

      for (const chunk of chunks) {
        const signedUrl = await createSignedMasterNoteAudioUrl(chunk.storage_path)
        tracks.push({
          url: signedUrl,
          durationSec: Math.max(1, chunk.duration_ms / 1000),
        })
      }
    }

    if (tracks.length === 0) {
      setError('No hay audios para reproducir en esta nota maestra')
      return
    }

    const token = tokenRef.current
    playlistRef.current = tracks
    currentTrackIndexRef.current = 0
    setDurationSec(tracks.reduce((sum, track) => sum + track.durationSec, 0))
    setPositionSec(0)
    setPlayingNoteId(note.id)
    await playTrackAt(0, 0, token)
  }

  return {
    error,
    clearError: () => setError(null),
    playingNoteId,
    canPlay,
    play,
    stop,
    pause,
    resume,
    togglePause,
    seekBack10: () => seekBy(-10),
    seekForward10: () => seekBy(10),
    isPaused,
    positionSec,
    durationSec,
  }
}
