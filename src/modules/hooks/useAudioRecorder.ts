import { useCallback, useEffect, useRef, useState } from 'react'

// Records one audio from the microphone (coaching audio tasks, Luis 6 Oct). It only asks for the
// microphone when the person taps «Grabar», can pause and resume like Activación, and stops by
// itself at `maxSeconds` (paused time does not count). `stream` feeds the live waveform.

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export type RecordedAudio = { blob: Blob; url: string; seconds: number }

export type AudioRecorderError = 'unsupported' | 'denied' | 'failed'

export function isAudioRecordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function useAudioRecorder(maxSeconds = 180) {
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [audio, setAudio] = useState<RecordedAudio | null>(null)
  const [error, setError] = useState<AudioRecorderError | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const pausedMsRef = useRef(0)
  const pausedAtRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)

  // Seconds recorded so far, without the paused stretches.
  const recordedSeconds = useCallback(() => {
    const now = Date.now()
    const pausedNow = pausedAtRef.current !== null ? now - pausedAtRef.current : 0
    return Math.max(0, (now - startedAtRef.current - pausedMsRef.current - pausedNow) / 1000)
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording' || typeof recorder.pause !== 'function') return
    recorder.pause()
    pausedAtRef.current = Date.now()
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    recorder.resume()
    if (pausedAtRef.current !== null) pausedMsRef.current += Date.now() - pausedAtRef.current
    pausedAtRef.current = null
    setPaused(false)
  }, [])

  const clear = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setAudio(null)
    setElapsed(0)
  }, [])

  const start = useCallback(async () => {
    if (recording) return
    setError(null)
    if (!isAudioRecordingSupported()) {
      setError('unsupported')
      return
    }
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = micStream
      setStream(micStream)
      const mime = MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ''
      const recorder = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream)
      // The bucket accepts the base type («audio/webm»), not the codec part.
      const baseType = (recorder.mimeType || mime || 'audio/webm').split(';')[0]
      recorderRef.current = recorder
      chunksRef.current = []
      startedAtRef.current = Date.now()
      pausedMsRef.current = 0
      pausedAtRef.current = null
      setPaused(false)
      clear()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const seconds = recordedSeconds()
        pausedAtRef.current = null
        setPaused(false)
        const blob = new Blob(chunksRef.current, { type: baseType })
        chunksRef.current = []
        stopStream()
        setRecording(false)
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob)
          urlRef.current = url
          setAudio({ blob, url, seconds: Math.round(seconds * 10) / 10 })
          setElapsed(seconds)
        }
      }
      recorder.start(300)
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => {
        const seconds = recordedSeconds()
        setElapsed(seconds)
        if (seconds >= maxSeconds) stop()
      }, 250)
    } catch (err) {
      stopStream()
      setRecording(false)
      const name = (err as { name?: string })?.name
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed')
    }
  }, [clear, maxSeconds, recordedSeconds, recording, stop, stopStream])

  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      stopStream()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [stopStream],
  )

  return { recording, paused, stream, elapsed, audio, error, start, stop, pause, resume, clear, maxSeconds }
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
