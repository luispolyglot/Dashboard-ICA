import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import type { MasterNote } from '../types'
import {
  createSignedMasterNoteAudioUrl,
  fetchMasterNoteChunks,
} from '../services/masterNotes'
import {
  getOfflineClosedMasterNoteAudio,
  upsertOfflineClosedMasterNoteAudio,
} from '../services/masterNotesOfflineStore'
import {
  enqueueMasterNoteListeningDelta,
  flushPendingMasterNoteListeningDeltas,
  getUtcDayStamp,
} from '../services/masterNoteListeningMetrics'

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

type OfflineTrackCacheEntry = {
  url: string
  durationSec: number
  noteUpdatedAt: string
  totalDurationMs: number
  closeType: 'final' | 'temporal'
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
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
  const { user } = useAuth()
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [positionSec, setPositionSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [debugEvents, setDebugEvents] = useState<string[]>([])

  const tokenRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const unifiedChunkCacheRef = useRef<Map<string, UnifiedChunkCacheEntry>>(new Map())
  const offlineTrackCacheRef = useRef<Map<string, OfflineTrackCacheEntry>>(new Map())
  const currentTrackMetaRef = useRef<{
    targetLang: string
    nativeLang: string
  } | null>(null)
  const listeningLastTickAtRef = useRef<number | null>(null)
  const listeningBufferedSecondsRef = useRef(0)
  const listeningFlushIntervalRef = useRef<number | null>(null)

  const clearUnifiedChunkCache = (): void => {
    for (const cachedTrack of unifiedChunkCacheRef.current.values()) {
      URL.revokeObjectURL(cachedTrack.url)
    }
    unifiedChunkCacheRef.current.clear()
  }

  const clearOfflineTrackCache = (): void => {
    for (const cachedTrack of offlineTrackCacheRef.current.values()) {
      URL.revokeObjectURL(cachedTrack.url)
    }
    offlineTrackCacheRef.current.clear()
  }

  const pushDebugEvent = (message: string, error?: unknown): void => {
    const timestamp = new Date().toISOString()
    const details = error ? ` | ${stringifyUnknownError(error)}` : ''
    setDebugEvents((prev) => [...prev, `${timestamp} | ${message}${details}`].slice(-80))
  }

  const getOrCreateAudioElement = (): HTMLAudioElement => {
    if (audioRef.current) {
      return audioRef.current
    }

    const created = new Audio()
    audioRef.current = created
    return created
  }

  const stop = (): void => {
    checkpointListening(true)
    stopListeningTicker()
    tokenRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingNoteId(null)
    setIsPaused(false)
    setPositionSec(0)
    setDurationSec(0)
  }

  const pause = (): void => {
    if (!audioRef.current || !playingNoteId) return
    if (!audioRef.current.paused) {
      checkpointListening(true)
      stopListeningTicker()
      audioRef.current.pause()
      setIsPaused(true)
    }
  }

  const resume = async (): Promise<void> => {
    if (!audioRef.current || !playingNoteId) return
    if (!audioRef.current.paused) return

    try {
      await audioRef.current.play()
      startListeningTicker()
      setIsPaused(false)
    } catch (err) {
      pushDebugEvent('No se pudo reanudar audio', err)
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
    const onVisibilityChange = () => {
      if (document.hidden) {
        checkpointListening(true)
      }
    }

    const onPageHide = () => {
      checkpointListening(true)
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide)
    }

    return () => {
      checkpointListening(true)
      stopListeningTicker()
      stop()

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.onended = null
        audioRef.current.onerror = null
        audioRef.current.ontimeupdate = null
        audioRef.current.onloadedmetadata = null
        audioRef.current.src = ''
        audioRef.current = null
      }

      clearUnifiedChunkCache()
      clearOfflineTrackCache()

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide)
      }
    }
  }, [user?.id])

  const flushListeningAsync = async (): Promise<void> => {
    if (!user?.id) return
    await flushPendingMasterNoteListeningDeltas(user.id)
  }

  useEffect(() => {
    if (!user?.id) return
    void flushPendingMasterNoteListeningDeltas(user.id).catch(() => {})
  }, [user?.id])

  const commitListeningDelta = (forceFlush = false): void => {
    const currentUserId = user?.id
    const meta = currentTrackMetaRef.current
    if (!currentUserId || !meta) {
      listeningBufferedSecondsRef.current = 0
      return
    }

    const wholeSeconds = Math.floor(listeningBufferedSecondsRef.current)
    listeningBufferedSecondsRef.current -= wholeSeconds

    if (wholeSeconds <= 0) {
      if (forceFlush) {
        void flushListeningAsync().catch(() => {})
      }
      return
    }

    enqueueMasterNoteListeningDelta({
      userId: currentUserId,
      day: getUtcDayStamp(),
      targetLang: meta.targetLang,
      nativeLang: meta.nativeLang,
      deltaSeconds: wholeSeconds,
    })

    if (forceFlush || wholeSeconds >= 15) {
      void flushListeningAsync().catch(() => {})
    }
  }

  const checkpointListening = (forceFlush = false): void => {
    if (!audioRef.current || audioRef.current.paused) {
      commitListeningDelta(forceFlush)
      listeningLastTickAtRef.current = null
      return
    }

    const now = Date.now()
    const last = listeningLastTickAtRef.current
    listeningLastTickAtRef.current = now

    if (last !== null) {
      const deltaSec = clamp((now - last) / 1000, 0, 15)
      listeningBufferedSecondsRef.current += deltaSec
    }

    commitListeningDelta(forceFlush)
  }

  const stopListeningTicker = (): void => {
    if (listeningFlushIntervalRef.current !== null) {
      window.clearInterval(listeningFlushIntervalRef.current)
      listeningFlushIntervalRef.current = null
    }
    listeningLastTickAtRef.current = null
  }

  const startListeningTicker = (): void => {
    if (!audioRef.current || audioRef.current.paused) return
    if (listeningFlushIntervalRef.current !== null) return

    listeningLastTickAtRef.current = Date.now()
    listeningFlushIntervalRef.current = window.setInterval(() => {
      checkpointListening(false)
    }, 10_000)
  }

  const getOfflineClosedTrack = async (note: MasterNote): Promise<PlaybackTrack | null> => {
    if (note.state !== 'closed') return null

    const cachedTrack = offlineTrackCacheRef.current.get(note.id)
    const canUseCache =
      cachedTrack
      && cachedTrack.noteUpdatedAt === note.updated_at
      && cachedTrack.totalDurationMs === note.total_duration_ms
      && cachedTrack.closeType === note.close_type

    if (canUseCache) {
      return {
        url: cachedTrack.url,
        durationSec: cachedTrack.durationSec,
      }
    }

    const blob = await getOfflineClosedMasterNoteAudio(note)
    if (!blob) return null

    const blobUrl = URL.createObjectURL(blob)
    const nextDurationSec = Math.max(1, note.total_duration_ms / 1000)

    if (cachedTrack) {
      URL.revokeObjectURL(cachedTrack.url)
    }

    offlineTrackCacheRef.current.set(note.id, {
      url: blobUrl,
      durationSec: nextDurationSec,
      noteUpdatedAt: note.updated_at,
      totalDurationMs: note.total_duration_ms,
      closeType: note.close_type,
    })

    return {
      url: blobUrl,
      durationSec: nextDurationSec,
    }
  }

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

    const audio = getOrCreateAudioElement()
    audio.pause()
    audio.currentTime = 0
    audio.onended = null
    audio.onerror = null
    audio.ontimeupdate = null
    audio.onloadedmetadata = null
    audio.src = track.url

    const onEnded = () => {
      if (token !== tokenRef.current) return
      checkpointListening(true)
      stopListeningTicker()
      setPositionSec(getCurrentDuration())
      setPlayingNoteId(null)
      setIsPaused(false)
    }

    const onError = () => {
      if (token !== tokenRef.current) return
      checkpointListening(true)
      stopListeningTicker()
      const mediaErrorCode = audio.error?.code
      pushDebugEvent(
        `HTMLAudioElement lanzó error durante reproducción${mediaErrorCode ? ` (code ${mediaErrorCode})` : ''}`,
      )
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
      startListeningTicker()
      setIsPaused(false)
    } catch (err) {
      if (token !== tokenRef.current) return
      pushDebugEvent('audio.play() rechazado', err)
      setError('No se pudo reproducir la nota maestra')
      setPlayingNoteId(null)
      setIsPaused(false)
    }
  }

  const playTransitionCue = async (cueSource: string | Blob): Promise<boolean> => {
    stop()
    currentTrackMetaRef.current = null
    setError(null)
    const token = tokenRef.current

    const cueUrl = typeof cueSource === 'string'
      ? cueSource
      : URL.createObjectURL(cueSource)
    const shouldRevokeCueUrl = typeof cueSource !== 'string'

    const audio = getOrCreateAudioElement()
    audio.pause()
    audio.currentTime = 0
    audio.onended = null
    audio.onerror = null
    audio.ontimeupdate = null
    audio.onloadedmetadata = null
    audio.src = cueUrl

    setPlayingNoteId(null)
    setIsPaused(false)
    setPositionSec(0)
    setDurationSec(0)

    return await new Promise<boolean>((resolve) => {
      let settled = false

      const settle = (value: boolean): void => {
        if (settled) return
        settled = true
        audio.onended = null
        audio.onerror = null
        audio.ontimeupdate = null
        audio.onloadedmetadata = null
        if (shouldRevokeCueUrl) {
          URL.revokeObjectURL(cueUrl)
        }
        resolve(value)
      }

      audio.onloadedmetadata = () => {
        if (token !== tokenRef.current) {
          settle(false)
          return
        }
        updateTimeline()
      }

      audio.onended = () => {
        if (token !== tokenRef.current) {
          settle(false)
          return
        }
        setPositionSec(getCurrentDuration())
        settle(true)
      }

      audio.onerror = () => {
        if (token !== tokenRef.current) {
          settle(false)
          return
        }

        const mediaErrorCode = audio.error?.code
        pushDebugEvent(
          `Cue de transición lanzó error${mediaErrorCode ? ` (code ${mediaErrorCode})` : ''}`,
        )
        settle(false)
      }

      void audio.play().then(() => {
        if (token !== tokenRef.current) {
          settle(false)
          return
        }
        setIsPaused(false)
      }).catch((err) => {
        if (token !== tokenRef.current) {
          settle(false)
          return
        }
        pushDebugEvent('audio.play() del cue fue rechazado', err)
        settle(false)
      })
    })
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

    if (note.state === 'closed') {
      void upsertOfflineClosedMasterNoteAudio(note, mergedBlob).catch(() => {})
    }

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
      track = await getOfflineClosedTrack(note)

      if (!track) {
        if (note.close_type === 'final' && note.final_audio_path) {
          const signedUrl = await createSignedMasterNoteAudioUrl(note.final_audio_path)
          track = {
            url: signedUrl,
            durationSec: Math.max(1, note.total_duration_ms / 1000),
          }

          if (note.state === 'closed') {
            void (async () => {
              try {
                const response = await fetch(signedUrl)
                if (!response.ok) return
                const blob = await response.blob()
                await upsertOfflineClosedMasterNoteAudio(note, blob)
              } catch {
                // noop
              }
            })()
          }
        } else {
          track = await getUnifiedChunkTrack(note, preloadedChunkCount)
        }
      }
    } catch (err) {
      if (token !== tokenRef.current) return
      pushDebugEvent('Fallo al resolver pista de reproducción', err)
      setError('No se pudo reproducir la nota maestra')
      return
    }

    if (!track) {
      pushDebugEvent('No se encontró track reproducible para la nota')
      setError('No hay audios para reproducir en esta nota maestra')
      return
    }

    if (token !== tokenRef.current) return

    setDurationSec(track.durationSec)
    setPositionSec(0)
    setPlayingNoteId(note.id)
    currentTrackMetaRef.current =
      note.target_lang && note.native_lang
        ? {
            targetLang: note.target_lang,
            nativeLang: note.native_lang,
          }
        : null
    await playTrack(track, 0, token)
  }

  return {
    error,
    clearError: () => setError(null),
    playingNoteId,
    canPlay,
    play,
    playTransitionCue,
    stop,
    pause,
    resume,
    togglePause,
    seekBack10: () => seekBy(-10),
    seekForward10: () => seekBy(10),
    isPaused,
    positionSec,
    durationSec,
    debugEvents,
    clearDebugEvents: () => setDebugEvents([]),
  }
}
