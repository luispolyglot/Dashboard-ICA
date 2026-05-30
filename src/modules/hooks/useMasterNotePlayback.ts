import { useEffect, useRef, useState } from 'react'
import type { MasterNote } from '../types'
import {
  createSignedMasterNoteAudioUrl,
  fetchMasterNoteChunks,
} from '../services/masterNotes'

type PlaybackTrack = {
  url: string
  durationSec: number
}

type UnifiedChunkCacheEntry = {
  url: string
  durationSec: number
  noteUpdatedAt: string
  totalDurationMs: number
  chunkCount: number
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const frameCount = buffer.length
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = frameCount * blockAlign
  const wavBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(wavBuffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = buffer.getChannelData(channel)[frame] || 0
      const clamped = Math.max(-1, Math.min(1, sample))
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      view.setInt16(offset, int16, true)
      offset += bytesPerSample
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

async function mergeAudioBlobsToWav(blobs: Blob[]): Promise<{ blob: Blob; durationSec: number } | null> {
  if (blobs.length === 0) return null

  const AudioContextCtor =
    globalThis.AudioContext
    || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextCtor) {
    const mergedType = blobs.find((blob) => blob.type)?.type || 'audio/mpeg'
    return {
      blob: new Blob(blobs, { type: mergedType }),
      durationSec: 0,
    }
  }

  const context = new AudioContextCtor()

  try {
    const decodedBuffers = await Promise.all(
      blobs.map(async (blob) => {
        const arrayBuffer = await blob.arrayBuffer()
        return context.decodeAudioData(arrayBuffer)
      }),
    )

    if (decodedBuffers.length === 0) {
      return null
    }

    const maxChannels = decodedBuffers.reduce(
      (max, buffer) => Math.max(max, buffer.numberOfChannels),
      1,
    )
    const targetSampleRate = decodedBuffers.reduce(
      (max, buffer) => Math.max(max, buffer.sampleRate),
      context.sampleRate,
    )
    const totalDurationSec = decodedBuffers.reduce((sum, buffer) => sum + buffer.duration, 0)
    const totalLengthFrames = Math.max(1, Math.ceil(totalDurationSec * targetSampleRate))

    const offlineContext = new OfflineAudioContext(maxChannels, totalLengthFrames, targetSampleRate)
    let cursorSec = 0

    for (const decodedBuffer of decodedBuffers) {
      const source = offlineContext.createBufferSource()
      source.buffer = decodedBuffer
      source.connect(offlineContext.destination)
      source.start(cursorSec)
      cursorSec += decodedBuffer.duration
    }

    const rendered = await offlineContext.startRendering()
    return {
      blob: encodeAudioBufferToWav(rendered),
      durationSec: rendered.duration,
    }
  } finally {
    await context.close()
  }
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
  const unifiedChunkCacheRef = useRef<Map<string, UnifiedChunkCacheEntry>>(new Map())

  const clearUnifiedChunkCache = (): void => {
    for (const cachedTrack of unifiedChunkCacheRef.current.values()) {
      URL.revokeObjectURL(cachedTrack.url)
    }
    unifiedChunkCacheRef.current.clear()
  }

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
      clearUnifiedChunkCache()
    }
  }, [])

  const getCurrentDuration = (): number => {
    const audioDuration = audioRef.current?.duration
    if (Number.isFinite(audioDuration) && audioDuration && audioDuration > 0) {
      return Math.max(audioDuration, durationSec)
    }
    return durationSec
  }

  const updateTimeline = (): void => {
    if (!audioRef.current) return
    const nextDuration = getCurrentDuration()
    setPositionSec(audioRef.current.currentTime || 0)
    setDurationSec(nextDuration)
  }

  const playTrack = async (
    track: PlaybackTrack,
    startSec: number,
    token: number,
  ): Promise<void> => {
    if (token !== tokenRef.current) return

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    const audio = new Audio(track.url)
    audioRef.current = audio

    const onEnded = () => {
      if (token !== tokenRef.current) return
      setPositionSec(getCurrentDuration())
      setPlayingNoteId(null)
      setIsPaused(false)
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

  const getUnifiedChunkTrack = async (
    note: MasterNote,
    preloadedChunkCount: number,
  ): Promise<PlaybackTrack | null> => {
    const cachedTrack = unifiedChunkCacheRef.current.get(note.id)
    const canUseCache =
      cachedTrack
      && cachedTrack.noteUpdatedAt === note.updated_at
      && cachedTrack.totalDurationMs === note.total_duration_ms
      && (preloadedChunkCount <= 0 || cachedTrack.chunkCount === preloadedChunkCount)

    if (canUseCache) {
      return {
        url: cachedTrack.url,
        durationSec: cachedTrack.durationSec,
      }
    }

    const chunks = await fetchMasterNoteChunks(note.id)
    if (chunks.length === 0 && preloadedChunkCount === 0) {
      return null
    }

    const chunkUrls = await Promise.all(
      chunks.map((chunk) => createSignedMasterNoteAudioUrl(chunk.storage_path)),
    )

    const chunkBlobs = await Promise.all(
      chunkUrls.map(async (chunkUrl) => {
        const response = await fetch(chunkUrl)
        if (!response.ok) {
          throw new Error('No se pudo descargar uno de los audios de la nota maestra')
        }
        return response.blob()
      }),
    )

    if (chunkBlobs.length === 0) {
      return null
    }

    const mergedAudio = await mergeAudioBlobsToWav(chunkBlobs)
    if (!mergedAudio) {
      return null
    }

    const mergedBlob = mergedAudio.blob
    const mergedUrl = URL.createObjectURL(mergedBlob)
    const chunkDurationSec = chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.duration_ms / 1000), 0)
    const nextDurationSec = mergedAudio.durationSec > 0 ? mergedAudio.durationSec : chunkDurationSec

    if (cachedTrack) {
      URL.revokeObjectURL(cachedTrack.url)
    }

    unifiedChunkCacheRef.current.set(note.id, {
      url: mergedUrl,
      durationSec: nextDurationSec,
      noteUpdatedAt: note.updated_at,
      totalDurationMs: note.total_duration_ms,
      chunkCount: chunks.length,
    })

    return {
      url: mergedUrl,
      durationSec: nextDurationSec,
    }
  }

  const seekBy = (deltaSec: number): void => {
    if (!playingNoteId || !audioRef.current) return

    const total = getCurrentDuration()
    if (total <= 0) return

    const target = clamp(audioRef.current.currentTime + deltaSec, 0, total)
    audioRef.current.currentTime = target
    updateTimeline()
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
    const token = tokenRef.current

    let track: PlaybackTrack | null = null

    try {
      if (note.close_type === 'final' && note.final_audio_path) {
        const signedUrl = await createSignedMasterNoteAudioUrl(note.final_audio_path)
        track = {
          url: signedUrl,
          durationSec: Math.max(1, note.total_duration_ms / 1000),
        }
      } else {
        track = await getUnifiedChunkTrack(note, preloadedChunkCount)
      }
    } catch {
      if (token !== tokenRef.current) return
      setError('No se pudo reproducir la nota maestra')
      return
    }

    if (!track) {
      setError('No hay audios para reproducir en esta nota maestra')
      return
    }

    if (token !== tokenRef.current) return

    setDurationSec(track.durationSec)
    setPositionSec(0)
    setPlayingNoteId(note.id)
    await playTrack(track, 0, token)
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
