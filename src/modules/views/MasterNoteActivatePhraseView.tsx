import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckIcon,
  Loader2Icon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
  SquareIcon,
  TimerIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ActivationGuide } from '../components/ActivationGuide'
import { ActivationHowToDialog } from '../components/ActivationHowToDialog'
import { ExplorePhraseTokenModal } from '../components/ExplorePhraseTokenModal'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { InteractivePhraseText } from '../components/InteractivePhraseText'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import { FirstUseTip, useFirstUseTip } from '../components/FirstUseTip'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchPhraseHistoryEntry } from '../services/phraseHistory'
import { buildActivationPairs, inSentence, type ActivationPair } from '../services/activationGuide'
import { loadPhraseChunksForActivation } from '../services/challengeChunks'
import {
  MASTER_NOTE_COMPLETE_DURATION_MS,
  addMasterNoteChunk,
  closeMasterNote,
  fetchMasterNoteById,
  fetchMasterNoteChunks,
  formatMasterNoteLabel,
  rerecordMasterNoteChunk,
} from '../services/masterNotes'
import { MasterNoteProgressBar } from '../components/MasterNoteProgressBar'
import {
  ErrorNote,
  RoundActionButton,
  SquareIconButton,
  formatDuration,
} from '../components/MasterNoteGameUi'
import { DailyLimitNotice } from '../game/DailyLimitNotice'
import { useDailyLimits } from '../game/limits'
import {
  EmptyState,
  GamePage,
  GameProgress,
  IconTile,
  PageTitle,
  Panel,
  PhaseLetter,
  Pill,
  SectionLabel,
  tone,
} from '../game/ui'
import type {
  Lexicard,
  MasterNote,
  MasterNoteChunk,
  PhraseGenerationEntry,
} from '../types'
import { langName, t } from '@/i18n'

type MasterNoteActivatePhraseViewProps = {
  noteId: string
  phraseId: string
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
}

type RecordingDraft = {
  blob: Blob
  url: string
  durationMs: number
  mimeType: string
  sizeBytes: number
}

const MIN_CLOSED_NOTE_DURATION_MS = MASTER_NOTE_COMPLETE_DURATION_MS
const MIN_SAVE_DURATION_MS = 10 * 1000

type PendingLeaveAction =
  | {
      kind: 'path'
      to: string
    }
  | {
      kind: 'back'
    }
  | null

function getPreferredMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm'
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  const supported = candidates.find((mime) =>
    MediaRecorder.isTypeSupported(mime),
  )
  return supported || 'audio/webm'
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

export function MasterNoteActivatePhraseView({
  noteId,
  phraseId,
  targetLang,
  nativeLang,
  cards,
  setCards,
  onWordAdded,
}: MasterNoteActivatePhraseViewProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshCreationDaysFromSource } = useDashboardContext()
  const rerecordMode = searchParams.get('mode') === 'rerecord'
  // Límite diario de activaciones (2, o 4 con Activación ampliada hoy). Regrabar no cuenta.
  const dailyLimits = useDailyLimits()
  // First-use bubble over the mic (Luis, 6 Oct): the last step of the I·C·A walk-through.
  const [recordTipStored, closeRecordTip] = useFirstUseTip('activate-record')
  // First activation (Luis, 9 Oct): first «listen to it», then the mic, then «next part» while recording.
  const [listenTipPending, closeListenTip] = useFirstUseTip('activate-listen')
  const recordTipPending = recordTipStored
  // «Así se activa una frase» (Luis, 9 Oct): the first tap on Activar frase explains the order
  // before recording; the «?» in the guide opens it again while recording.
  const [howtoPending, closeHowto] = useFirstUseTip('activate-howto')
  const [howtoMode, setHowtoMode] = useState<'start' | 'help' | null>(null)
  const activationLimitReached =
    !rerecordMode && dailyLimits.isAtLimit('activations')
  const rerecordChunkId = useMemo(() => {
    const raw = (searchParams.get('chunkId') || '').trim()
    if (!raw || !isUuid(raw)) return null
    return raw
  }, [searchParams])
  const [note, setNote] = useState<MasterNote | null>(null)
  const [phrase, setPhrase] = useState<PhraseGenerationEntry | null>(null)
  const [rerecordChunk, setRerecordChunk] = useState<MasterNoteChunk | null>(
    null,
  )
  const [recordingDraft, setRecordingDraft] = useState<RecordingDraft | null>(
    null,
  )
  const [recording, setRecording] = useState(false)
  const [recordingPaused, setRecordingPaused] = useState(false)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [saving, setSaving] = useState(false)
  const [completingNote, setCompletingNote] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phraseAlreadyActivated, setPhraseAlreadyActivated] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [extractWordsModalOpen, setExtractWordsModalOpen] = useState(false)
  const [exploreModalOpen, setExploreModalOpen] = useState(false)
  const [exploreToken, setExploreToken] = useState('')
  // Activación guiada: trozos de la frase (nota desafiante) y la parte en la que vas al grabar.
  const [phraseChunks, setPhraseChunks] = useState<unknown>(null)
  const [guidePairs, setGuidePairs] = useState<ActivationPair[] | null>(null)
  const [guideStep, setGuideStep] = useState(0)
  const guideRef = useRef<HTMLDivElement | null>(null)
  // When the big mic is below the fold (long phrase on a phone), a floating button starts the
  // recording, so «Activar frase» is always on the first screen (Luis, 9 Oct).
  const micAnchorRef = useRef<HTMLSpanElement | null>(null)
  const [micInView, setMicInView] = useState(true)
  const pendingLeaveRef = useRef<PendingLeaveAction>(null)
  const allowNavigationRef = useRef(false)
  const pageSectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!recording) return

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [recording])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef<number | null>(null)
  const recordingPausedAtRef = useRef<number | null>(null)
  const recordingTotalPausedMsRef = useRef(0)
  const recordingIntervalRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const waveDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const waveFrameRef = useRef<number | null>(null)
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!recording) {
      pendingLeaveRef.current = null
      allowNavigationRef.current = false
      setLeaveDialogOpen(false)
    }
  }, [recording])

  useEffect(() => {
    if (!recording) return

    const onDocumentClickCapture = (event: MouseEvent): void => {
      if (allowNavigationRef.current || leaveDialogOpen) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const target = event.target as Element | null
      if (!target) return
      // Solo ignoramos el propio aviso de "salir durante grabación";
      // los enlaces de otros paneles (p. ej. el perfil en móvil) también se protegen.
      if (target.closest('[data-recording-leave-dialog]')) return
      if (pageSectionRef.current?.contains(target)) return

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      let nextUrl: URL
      try {
        nextUrl = new URL(anchor.href, window.location.href)
      } catch {
        return
      }

      if (nextUrl.origin !== window.location.origin) return

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
      if (nextPath === currentPath) return

      event.preventDefault()
      event.stopPropagation()
      pendingLeaveRef.current = { kind: 'path', to: nextPath }
      setLeaveDialogOpen(true)
    }

    document.addEventListener('click', onDocumentClickCapture, true)
    return () => {
      document.removeEventListener('click', onDocumentClickCapture, true)
    }
  }, [leaveDialogOpen, recording])

  useEffect(() => {
    if (!recording) return

    const markerState = { masterNoteRecordingGuard: true, at: Date.now() }
    window.history.pushState(markerState, '', window.location.href)

    const onPopState = (): void => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false
        return
      }

      pendingLeaveRef.current = { kind: 'back' }
      setLeaveDialogOpen(true)
      window.history.pushState(markerState, '', window.location.href)
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [recording])

  const clearDraft = (): void => {
    setRecordingDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  const stopWave = (): void => {
    if (waveFrameRef.current !== null) {
      window.cancelAnimationFrame(waveFrameRef.current)
      waveFrameRef.current = null
    }
    analyserRef.current = null
    waveDataRef.current = null
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => null)
      audioContextRef.current = null
    }
  }

  const stopRecording = (): void => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
  }

  const getRecordingElapsedMs = (now: number): number => {
    const startedAt = recordingStartedAtRef.current
    if (!startedAt) return 0

    const pausedAt = recordingPausedAtRef.current
    const inFlightPauseMs = pausedAt ? now - pausedAt : 0
    return Math.max(
      0,
      now - startedAt - recordingTotalPausedMsRef.current - inFlightPauseMs,
    )
  }

  const pauseRecording = (): void => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording' || recordingPaused) return
    recorder.pause()
    recordingPausedAtRef.current = Date.now()
    setRecordingPaused(true)
  }

  const resumeRecording = (): void => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'paused' || !recordingPaused) return

    const pausedAt = recordingPausedAtRef.current
    if (pausedAt) {
      recordingTotalPausedMsRef.current += Date.now() - pausedAt
    }
    recordingPausedAtRef.current = null
    recorder.resume()
    setRecordingPaused(false)
  }

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const [foundNote, foundPhrase, noteChunks] = await Promise.all([
          fetchMasterNoteById(noteId, targetLang),
          fetchPhraseHistoryEntry(phraseId),
          fetchMasterNoteChunks(noteId),
        ])
        if (!foundNote || !foundPhrase) {
          setError(t('No se encontró la nota o frase seleccionada'))
          return
        }

        const phraseChunk =
          noteChunks.find((chunk) => chunk.phrase_generation_id === phraseId) ||
          null
        const targetRerecordChunk = rerecordChunkId
          ? noteChunks.find((chunk) => chunk.id === rerecordChunkId) || null
          : null

        const totalDuration = noteChunks.reduce(
          (sum, chunk) => sum + chunk.duration_ms,
          0,
        )

        if (foundNote.state !== 'open' && !rerecordMode) {
          setError(
            t('La nota maestra está cerrada y no admite nuevas activaciones'),
          )
          setRerecordChunk(null)
          setPhraseAlreadyActivated(false)
        } else if (rerecordMode) {
          if (!rerecordChunkId || !targetRerecordChunk) {
            setError(t('No se encontró el audio a regrabar en esta nota maestra'))
            setRerecordChunk(null)
            setPhraseAlreadyActivated(false)
          } else if (targetRerecordChunk.phrase_generation_id !== phraseId) {
            setError(t('El audio seleccionado no corresponde a esta frase'))
            setRerecordChunk(null)
            setPhraseAlreadyActivated(false)
          } else {
            setError(null)
            setRerecordChunk(targetRerecordChunk)
            setPhraseAlreadyActivated(false)
          }
        } else if (phraseChunk) {
          setError(t('Esta frase ya fue activada en esta nota maestra'))
          setRerecordChunk(null)
          setPhraseAlreadyActivated(true)
        } else {
          setError(null)
          setRerecordChunk(null)
          setPhraseAlreadyActivated(false)
        }

        setNote({ ...foundNote, total_duration_ms: totalDuration })
        setPhrase(foundPhrase)
      } catch (err) {
        console.error(err)
        setError(t('No se pudo cargar la activación de frase'))
      } finally {
        setLoading(false)
      }
    }

    void load()

    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop()
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current)
      }
      stopWave()
      if (recordingDraft) URL.revokeObjectURL(recordingDraft.url)
    }
  }, [noteId, phraseId, rerecordChunkId, rerecordMode, targetLang])

  // Los trozos llegan aparte y sin bloquear: mientras no estén, la guía usa su plan B.
  const loadedPhraseId = phrase?.id ?? null
  useEffect(() => {
    setPhraseChunks(null)
    if (!loadedPhraseId) return
    let alive = true
    void loadPhraseChunksForActivation(loadedPhraseId).then((chunks) => {
      if (alive) setPhraseChunks(chunks)
    })
    return () => {
      alive = false
    }
  }, [loadedPhraseId])

  const plannedPairs = useMemo<ActivationPair[] | null>(() => {
    const target = phrase?.generated_phrase?.trim()
    const native = phrase?.translation?.trim()
    if (!target || !native) return null
    return buildActivationPairs({ target, native }, phraseChunks).pairs
  }, [phrase?.generated_phrase, phrase?.translation, phraseChunks])

  const guideActive = recording && Boolean(guidePairs?.length)
  const guideTotal = guidePairs?.length ?? 0
  const nextGuideStep = (): void => {
    setGuideStep((step) => Math.min(step + 1, Math.max(0, guideTotal - 1)))
  }
  const prevGuideStep = (): void => {
    setGuideStep((step) => Math.max(0, step - 1))
  }

  // Tocar en cualquier sitio (o la flecha derecha) pasa a la siguiente parte.
  useEffect(() => {
    if (!guideActive || recordingPaused || leaveDialogOpen || howtoMode) return
    const ignore = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      Boolean(target.closest('button, a, input, textarea, select, audio, [role="dialog"], [role="note"]'))
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0 || ignore(event.target)) return
      nextGuideStep()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowRight' || ((event.key === ' ' || event.key === 'Enter') && !ignore(event.target))) {
        event.preventDefault()
        nextGuideStep()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        prevGuideStep()
      }
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideActive, recordingPaused, leaveDialogOpen, guideTotal, howtoMode])

  // En el móvil, al empezar a grabar la guía sube arriba para ver las dos frases y el micro.
  useEffect(() => {
    if (!guideActive) return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    const frame = window.requestAnimationFrame(() => {
      guideRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [guideActive])

  useEffect(() => {
    const anchor = micAnchorRef.current
    if (!anchor || recording || typeof IntersectionObserver === 'undefined') {
      setMicInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setMicInView(entry.isIntersecting && entry.intersectionRatio >= 0.6),
      // The phone's bottom bar covers the last ~90 px.
      { rootMargin: '0px 0px -90px 0px', threshold: [0, 0.3, 0.6, 0.9, 1] },
    )
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [loading, recording, recordingDraft, phrase?.id])

  const rerecordDurationMs = rerecordChunk?.duration_ms || 0
  const effectiveNoteDurationMs = Math.max(
    0,
    (note?.total_duration_ms || 0) - (rerecordMode ? rerecordDurationMs : 0),
  )
  const isOpenNote = note?.state === 'open'
  // Lo que se está grabando ahora (o el borrador sin guardar) suma en la barra de progreso.
  const pendingRecordingMs = recording
    ? recordingElapsedMs
    : recordingDraft?.durationMs || 0
  const draftCompletesNote =
    isOpenNote &&
    !!recordingDraft &&
    effectiveNoteDurationMs + recordingDraft.durationMs >=
      MASTER_NOTE_COMPLETE_DURATION_MS
  const isClosedRerecord =
    rerecordMode && note?.state === 'closed' && Boolean(rerecordChunk)
  const canRecord =
    !!note &&
    (rerecordMode || note.state === 'open') &&
    !phraseAlreadyActivated &&
    (!rerecordMode || Boolean(rerecordChunk)) &&
    (!activationLimitReached || Boolean(recordingDraft))

  const isDraftTooShort =
    !!recordingDraft && recordingDraft.durationMs < MIN_SAVE_DURATION_MS
  const closedRerecordPreviewTotalMs =
    isClosedRerecord && recordingDraft && note && rerecordChunk
      ? Math.max(
          0,
          note.total_duration_ms -
            rerecordChunk.duration_ms +
            recordingDraft.durationMs,
        )
      : null
  const breaksClosedMinTotal =
    closedRerecordPreviewTotalMs !== null &&
    closedRerecordPreviewTotalMs < MIN_CLOSED_NOTE_DURATION_MS

  const startWave = (stream: MediaStream): void => {
    try {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      const waveBuffer = new ArrayBuffer(analyser.frequencyBinCount)
      waveDataRef.current = new Uint8Array(waveBuffer)

      const draw = () => {
        waveFrameRef.current = window.requestAnimationFrame(draw)

        const canvas = waveCanvasRef.current
        const data = waveDataRef.current
        const node = analyserRef.current
        if (!canvas || !data || !node) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        const displayWidth = Math.max(1, Math.floor(canvas.clientWidth))
        const displayHeight = Math.max(1, Math.floor(canvas.clientHeight))
        const targetWidth = Math.floor(displayWidth * dpr)
        const targetHeight = Math.floor(displayHeight * dpr)

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth
          canvas.height = targetHeight
        }

        const width = canvas.width
        const height = canvas.height
        node.getByteFrequencyData(data)

        ctx.clearRect(0, 0, width, height)

        // Barras redondeadas del color de la A (el lienzo lleva `color: var(--ica-a)`), centradas.
        const barColor = window.getComputedStyle(canvas).color || '#ef4444'
        const barCount = Math.min(48, data.length)
        const gap = 3 * dpr
        const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount)
        ctx.fillStyle = barColor
        for (let i = 0; i < barCount; i += 1) {
          const value = data[i] / 255
          const barHeight = Math.max(4 * dpr, value * height)
          const x = i * (barWidth + gap)
          const y = (height - barHeight) / 2
          const radius = Math.min(barWidth / 2, barHeight / 2)
          ctx.beginPath()
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, barWidth, barHeight, radius)
          } else {
            ctx.rect(x, y, barWidth, barHeight)
          }
          ctx.fill()
        }
      }

      draw()
    } catch (err) {
      console.error(err)
    }
  }

  const startRecording = async (): Promise<void> => {
    if (recording || !canRecord) return
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError(t('No se puede usar micrófono en este dispositivo'))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeType = getPreferredMimeType()
      const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      recordedChunksRef.current = []
      recordingStartedAtRef.current = Date.now()
      recordingPausedAtRef.current = null
      recordingTotalPausedMsRef.current = 0
      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream
      // La guía se fija al empezar: no cambia a mitad de la grabación aunque lleguen los trozos.
      setGuidePairs(plannedPairs)
      setGuideStep(0)
      setRecording(true)
      setRecordingPaused(false)
      setRecordingElapsedMs(0)
      setError(null)
      startWave(stream)

      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current)
      }
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingElapsedMs(getRecordingElapsedMs(Date.now()))
      }, 200)

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const startedAt = recordingStartedAtRef.current
        const mimeType = recorder.mimeType || preferredMimeType
        if (startedAt) {
          const durationMs = getRecordingElapsedMs(Date.now())
          const blob = new Blob(recordedChunksRef.current, { type: mimeType })
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob)
            setRecordingDraft((prev) => {
              if (prev) URL.revokeObjectURL(prev.url)
              return {
                blob,
                url,
                durationMs,
                mimeType,
                sizeBytes: blob.size,
              }
            })
          }
        }

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        recordingStartedAtRef.current = null
        recordingPausedAtRef.current = null
        recordingTotalPausedMsRef.current = 0
        recordedChunksRef.current = []
        setRecording(false)
        setRecordingPaused(false)
        if (recordingIntervalRef.current !== null) {
          window.clearInterval(recordingIntervalRef.current)
          recordingIntervalRef.current = null
        }
        setRecordingElapsedMs(0)
        stopWave()
      }

      recorder.start()
    } catch (err) {
      console.error(err)
      setError(t('No se pudo iniciar la grabación'))
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      recordingPausedAtRef.current = null
      recordingTotalPausedMsRef.current = 0
      if (recordingIntervalRef.current !== null) {
        window.clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
      stopWave()
      setRecording(false)
      setRecordingPaused(false)
      setRecordingElapsedMs(0)
    }
  }

  const requestStartRecording = (): void => {
    if (recordTipPending) closeRecordTip()
    if (howtoPending && plannedPairs) {
      setHowtoMode('start')
      return
    }
    void startRecording()
  }

  const confirmHowto = (): void => {
    const mode = howtoMode
    closeHowto()
    setHowtoMode(null)
    if (mode === 'start') void startRecording()
  }

  const handleSaveChunk = async (): Promise<void> => {
    if (!recordingDraft || !note || !phrase || saving) return
    if (breaksClosedMinTotal) {
      setError(t('Una nota cerrada no puede quedar por debajo de 3:00'))
      return
    }

    setSaving(true)
    try {
      let nextTotalMs: number
      if (rerecordMode) {
        if (!rerecordChunk) {
          throw new Error('No se encontró el chunk a regrabar')
        }

        const result = await rerecordMasterNoteChunk({
          noteId: note.id,
          chunkId: rerecordChunk.id,
          phraseGenerationId: phrase.id,
          audioBlob: recordingDraft.blob,
          mimeType: recordingDraft.mimeType,
          durationMs: recordingDraft.durationMs,
        })
        nextTotalMs = result.totalDurationMs
      } else {
        const result = await addMasterNoteChunk({
          noteId: note.id,
          phraseGenerationId: phrase.id,
          audioBlob: recordingDraft.blob,
          mimeType: recordingDraft.mimeType,
          durationMs: recordingDraft.durationMs,
        })
        nextTotalMs = result.totalDurationMs
      }

      await refreshCreationDaysFromSource()

      const noteUrl = `${DASHBOARD_ROUTES.masterNotes}/note/${note.id}`

      // La nota se completa sola al guardar la grabación que la lleva a 3:00 o más.
      // Nunca cortamos a mitad de grabación: si estaba en 2:50 y graba 0:30, queda en 3:20.
      if (
        note.state === 'open' &&
        nextTotalMs >= MASTER_NOTE_COMPLETE_DURATION_MS
      ) {
        setCompletingNote(true)
        try {
          const closeResult = await closeMasterNote(note.id)
          const params = new URLSearchParams({ completed: '1' })
          if (closeResult.coachingNotificationStatus === 'sent') {
            params.set('coach', '1')
          }
          navigate(`${noteUrl}?${params.toString()}`)
          return
        } catch (closeError) {
          // El audio ya está guardado; en el detalle queda el botón para completarla.
          console.error(closeError)
        } finally {
          setCompletingNote(false)
        }
      }

      navigate(rerecordMode ? `${noteUrl}?rerecordUpdated=1` : noteUrl)
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error &&
        (err.message.includes('CLOSED_NOTE_MIN_TOTAL_3_00') ||
          err.message.includes('CLOSED_NOTE_MIN_TOTAL_3_30'))
          ? t('Una nota cerrada no puede quedar por debajo de 3:00')
          : null
      setError(
        message ||
          (rerecordMode
            ? t('No se pudo guardar la regrabación en la nota maestra')
            : t('No se pudo guardar el audio en la nota maestra')),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleOpenExploreModal = (token: string): void => {
    if (!phrase?.generated_phrase) return
    setExploreToken(token)
    setExploreModalOpen(true)
  }

  const handleKeepRecording = (): void => {
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
  }

  const handleLeaveAnyway = (): void => {
    const pendingLeave = pendingLeaveRef.current
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
    if (!pendingLeave) return

    allowNavigationRef.current = true
    if (pendingLeave.kind === 'path') {
      navigate(pendingLeave.to)
      return
    }

    navigate(-1)
  }

  if (loading) {
    return (
      <section
        ref={pageSectionRef}
        className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pt-2 pb-8 lg:py-8'
      >
        <p className='sr-only'>{t('Cargando activación...')}</p>
        <div className='flex items-center gap-3' aria-hidden='true'>
          <div className='size-12 animate-pulse rounded-2xl bg-muted' />
          <div className='h-8 w-48 animate-pulse rounded-xl bg-muted' />
        </div>
        <div
          className='h-52 animate-pulse rounded-3xl bg-muted'
          aria-hidden='true'
        />
        <div
          className='h-72 animate-pulse rounded-3xl bg-muted'
          aria-hidden='true'
        />
      </section>
    )
  }

  if (!note || !phrase) {
    return (
      <GamePage>
        <EmptyState
          icon={
            <IconTile tone='bad' size={64}>
              <MicIcon className='size-8' strokeWidth={2.4} />
            </IconTile>
          }
          title={t('No se pudo abrir la activación.')}
          text={error || undefined}
        />
      </GamePage>
    )
  }

  const a = tone('a')
  const activationsMax = dailyLimits.limits.activations
  const activationsDone = Math.min(dailyLimits.used.activations, activationsMax)
  const isLive = recording && !recordingPaused
  const saveLabel = completingNote
    ? t('Completando nota...')
    : saving
      ? t('Guardando...')
      : draftCompletesNote
        ? t('Guardar y completar nota')
        : rerecordMode
          ? t('Guardar regrabación')
          : t('Guardar audio')

  // Texto bajo el micro según el momento de la grabación.
  const micTitle = recording
    ? recordingPaused
      ? t('Grabación pausada')
      : t('Grabando…')
    : recordingDraft
      ? t('Escucha tu grabación')
      : rerecordMode
        ? t('Regrabar frase')
        : t('Activar frase')
  const micText = recording
    ? t('Toca el cuadrado para terminar.')
    : recordingDraft
      ? t('Si no te convence, toca el micro y grábala otra vez.')
      : canRecord
        ? plannedPairs && plannedPairs.length > 1
          ? t('Toca el micro. Te guiamos parte por parte.')
          : t('Toca el micro y di la frase en voz alta.')
        : null

  return (
    <>
      <GamePage wide>
        <PageTitle
          icon={<PhaseLetter letter='A' size={46} />}
          subtitle={t('Nota: {note}', { note: formatMasterNoteLabel(note.name) })}
        >
          {rerecordMode ? t('Regrabar frase') : t('Activar frase')}
        </PageTitle>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {/* En ordenador: la frase a la izquierda y el grabador a la derecha */}
        <div className='grid gap-6 lg:grid-cols-2 lg:items-start'>
          {/* En móvil esta columna se deshace: frase, grabador y al final "Extraer" */}
          <div className='contents lg:flex lg:flex-col lg:gap-4'>
            {/* La frase como se dice: tu idioma y después el que aprendes, parte por parte.
                Antes de grabar ya se ve así (Luis, 9 Oct); al grabar, la parte en curso avanza con un toque. */}
            {(guideActive && guidePairs) || plannedPairs ? (
              <ActivationGuide
                ref={guideRef}
                mode={guideActive ? 'live' : 'preview'}
                pairs={
                  guideActive && guidePairs
                    ? guidePairs
                    : [{ target: phrase.generated_phrase || '', native: phrase.translation || '' }]
                }
                step={guideActive ? guideStep : 0}
                nativeLang={nativeLang}
                targetLang={targetLang}
                paused={recordingPaused}
                onNext={nextGuideStep}
                onPrev={prevGuideStep}
                onHelp={() => setHowtoMode('help')}
                onTokenClick={handleOpenExploreModal}
                footer={
                  <>
                    {phrase.generated_phrase ? (
                      <RomanizationHint text={phrase.generated_phrase} language={targetLang} />
                    ) : null}
                    {phrase.generated_phrase ? (
                      <div onClickCapture={() => (listenTipPending ? closeListenTip() : undefined)}>
                        <SpeakButton text={phrase.generated_phrase} langName={targetLang} color='#3B82F6' className='mt-3' />
                      </div>
                    ) : null}
                    {listenTipPending && phrase.generated_phrase ? (
                      <ListenHint
                        text={t('Escúchala antes: así sabrás cómo se dice bien en {lang}.', { lang: inSentence(langName(targetLang)) })}
                        onClose={closeListenTip}
                      />
                    ) : null}
                  </>
                }
              />
            ) : (
            /* La frase, grande y con palabras pulsables */
            <Panel className='p-5'>
              <SectionLabel>{t('Di esta frase en {lang}', { lang: langName(targetLang) })}</SectionLabel>
              {phrase.generated_phrase ? (
                <InteractivePhraseText
                  text={phrase.generated_phrase}
                  language={targetLang}
                  onTokenClick={handleOpenExploreModal}
                  className='m-0 font-display text-[1.7rem] leading-snug font-black tracking-tight lg:text-3xl'
                />
              ) : (
                <p className='m-0 font-display text-[1.7rem] leading-snug font-black tracking-tight'>
                  {t('Sin frase')}
                </p>
              )}
              {phrase.generated_phrase && (
                <RomanizationHint
                  text={phrase.generated_phrase}
                  language={targetLang}
                />
              )}
              <p className='m-0 mt-2 text-lg leading-snug font-semibold text-muted-foreground'>
                {phrase.translation || t('Sin traducción')}
              </p>
              {phrase.source_words && phrase.source_words.length > 0 && (
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {phrase.source_words.map((word) => (
                    <Pill key={word} tone='i'>
                      {word}
                    </Pill>
                  ))}
                </div>
              )}
              {phrase.generated_phrase && (
                <SpeakButton
                  text={phrase.generated_phrase}
                  langName={targetLang}
                  color='#3B82F6'
                  disabled={recording && !recordingPaused}
                />
              )}
              {phrase.generated_phrase ? (
                <p className='m-0 mt-3 text-xs font-semibold text-muted-foreground'>
                  {t('Toca una palabra para explorarla.')}
                </p>
              ) : null}
            </Panel>
            )}
            {phrase.generated_phrase && !recording && (
              <Button
                type='button'
                size='lg'
                variant='outline'
                className='order-last w-full lg:order-none'
                onClick={() => setExtractWordsModalOpen(true)}
              >
                <SparklesIcon className='size-4.5' strokeWidth={2.4} />
                {t('Extraer nuevas palabras')}
              </Button>
            )}
          </div>

          {/* Grabador: progreso de la nota y el micro grande */}
          <Panel tone='a' className='p-5 lg:sticky lg:top-4'>
            {isOpenNote ? (
              <MasterNoteProgressBar
                noteName={note.name}
                savedMs={effectiveNoteDurationMs}
                pendingMs={pendingRecordingMs}
                recording={isLive}
                showName={false}
              />
            ) : (
              <div className='flex flex-wrap items-center gap-1.5'>
                <Pill tone='gold'>{t('Nota cerrada')}</Pill>
                <span className='text-sm font-bold text-muted-foreground tabular-nums'>
                  {t('Acumulado: {time}', { time: formatDuration(note.total_duration_ms) })}
                </span>
              </div>
            )}
            {rerecordMode && rerecordChunk ? (
              <p className='m-0 mt-2 text-xs font-bold text-muted-foreground tabular-nums'>
                {t('Audio actual: {time}', { time: formatDuration(rerecordChunk.duration_ms) })}
              </p>
            ) : null}
            {isClosedRerecord ? (
              <p className='m-0 mt-1 text-xs font-semibold text-muted-foreground'>
                {t('Regla: al regrabar, el total debe mantenerse en al menos 3:00.')}
              </p>
            ) : null}

            <div className='mt-7 flex flex-col items-center text-center'>
              <div className='flex items-center justify-center gap-5'>
                {recording ? (
                  <SquareIconButton
                    onClick={recordingPaused ? resumeRecording : pauseRecording}
                    ariaLabel={
                      recordingPaused
                        ? t('Reanudar grabación')
                        : t('Pausar grabación')
                    }
                    className='size-13'
                  >
                    {recordingPaused ? (
                      <PlayIcon
                        className='ml-0.5 size-5 fill-current'
                        strokeWidth={2.4}
                      />
                    ) : (
                      <PauseIcon
                        className='size-5 fill-current'
                        strokeWidth={2.4}
                      />
                    )}
                  </SquareIconButton>
                ) : null}
                <span className='relative' ref={micAnchorRef}>
                {recordTipPending && !recording && canRecord && !recordingDraft && micInView ? (
                  <FirstUseTip align='center' onClose={closeRecordTip}>
                    {t('Cuando estés listo, toca aquí para empezar a grabar. Te guiaremos parte por parte.')}
                  </FirstUseTip>
                ) : null}
                <RoundActionButton
                  size={112}
                  onClick={
                    recording
                      ? stopRecording
                      : requestStartRecording
                  }
                  disabled={!recording && !canRecord}
                  ariaLabel={
                    recording
                      ? t('Detener grabación')
                      : rerecordMode
                        ? t('Regrabar frase')
                        : t('Activar frase')
                  }
                  live={isLive}
                >
                  {recording ? (
                    <SquareIcon
                      className='size-10 fill-current'
                      strokeWidth={2.4}
                    />
                  ) : (
                    <MicIcon className='size-13' strokeWidth={2.4} />
                  )}
                </RoundActionButton>
                </span>
                {recording ? (
                  <span className='size-13 shrink-0' aria-hidden='true' />
                ) : null}
              </div>

              <p className='m-0 mt-6 text-xl font-black tracking-tight'>
                {micTitle}
              </p>
              {recording ? (
                <p
                  className='m-0 mt-1 text-4xl leading-none font-black tabular-nums'
                  style={{ color: a.ink }}
                >
                  {formatDuration(recordingElapsedMs)}
                </p>
              ) : null}
              {/* Mientras no llegue a 10 s: aviso en dorado (destaca sobre el rojo de la grabación) */}
              {recording && recordingElapsedMs < MIN_SAVE_DURATION_MS ? (
                <MinDurationHint
                  text={t('Mínimo 10 s para guardar · faltan {n} s', {
                    n: Math.max(1, Math.ceil((MIN_SAVE_DURATION_MS - recordingElapsedMs) / 1000)),
                  })}
                  className='mt-3'
                />
              ) : null}
              {micText ? (
                <p className='m-0 mt-1.5 max-w-xs text-sm font-semibold text-muted-foreground'>
                  {micText}
                </p>
              ) : null}
              {recording && rerecordMode ? (
                <p className='m-0 mt-1 text-xs font-bold text-muted-foreground tabular-nums'>
                  {t('Duración actual de esta toma: {time}', { time: formatDuration(recordingElapsedMs) })}
                </p>
              ) : null}
            </div>

            {recording && (
              <canvas
                ref={waveCanvasRef}
                width={600}
                height={72}
                className='mt-5 h-16 w-full'
                style={{
                  color: 'var(--ica-a)',
                  opacity: recordingPaused ? 0.35 : 1,
                }}
                aria-hidden='true'
              />
            )}

            {activationLimitReached && !recording && !recordingDraft && (
              <DailyLimitNotice
                kind='activations'
                state={dailyLimits}
                className='mt-5'
              />
            )}

            {/* Borrador: escucharlo y guardarlo */}
            {recordingDraft && !recording && (
              <div className='mt-6 rounded-2xl border-2 border-border bg-card p-4 dark:bg-background/40'>
                <div className='flex items-center justify-between gap-3'>
                  <p className='ica-label m-0'>{t('Tu grabación')}</p>
                  <span className='text-xs font-extrabold text-muted-foreground tabular-nums'>
                    {formatDuration(recordingDraft.durationMs)}
                  </span>
                </div>
                <audio
                  controls
                  src={recordingDraft.url}
                  className='mt-3 h-11 w-full dark:[color-scheme:dark]'
                />
                <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
                  {t('Para guardar, el audio debe durar al menos 0:10.')}
                </p>
                {isDraftTooShort && (
                  <MinDurationHint text={t('Mínimo 10 s para guardar. Graba otra vez un poco más largo.')} className='mt-3' />
                )}
                {breaksClosedMinTotal && (
                  <ErrorNote className='mt-3'>
                    {t('Esta regrabación dejaría la nota cerrada debajo de 3:00.')}
                  </ErrorNote>
                )}
                {closedRerecordPreviewTotalMs !== null && (
                  <p className='m-0 mt-2 text-xs font-bold text-muted-foreground tabular-nums'>
                    {t('Total estimado tras guardar: {time}', { time: formatDuration(closedRerecordPreviewTotalMs) })}
                  </p>
                )}
                <Button
                  type='button'
                  size='xl'
                  variant={draftCompletesNote ? 'success' : 'a'}
                  className='mt-4 w-full'
                  onClick={() => void handleSaveChunk()}
                  disabled={saving || isDraftTooShort || breaksClosedMinTotal}
                >
                  {saving ? (
                    <Loader2Icon
                      className='size-5 animate-spin'
                      strokeWidth={2.6}
                    />
                  ) : (
                    <CheckIcon className='size-5' strokeWidth={3} />
                  )}
                  {saveLabel}
                </Button>
                {!saving && (
                  <Button
                    type='button'
                    size='lg'
                    variant='ghost'
                    className='mt-2 w-full text-muted-foreground'
                    onClick={clearDraft}
                  >
                    <Trash2Icon className='size-4.5' strokeWidth={2.4} />
                    {t('Descartar')}
                  </Button>
                )}
              </div>
            )}
          </Panel>
        </div>
      </GamePage>

      {/* Barra fija en el móvil cuando el micro grande no se ve (frase larga) */}
      {!recording && canRecord && !recordingDraft && !micInView ? (
        <>
          <div className='h-32 lg:hidden' aria-hidden='true' />
          <div className='fixed inset-x-0 bottom-[calc(86px+env(safe-area-inset-bottom))] z-30 border-t-2 border-border bg-card px-4 pt-3 pb-3 md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden dark:bg-background'>
            <div className='mx-auto w-full max-w-sm'>
              {recordTipPending ? (
                <p role='note' className='m-0 mb-2 flex items-start gap-2 text-[13px] leading-snug font-bold' style={{ color: 'var(--ica-i-ink)' }}>
                  <span className='min-w-0 flex-1'>
                    {t('Cuando estés listo, toca aquí para empezar a grabar. Te guiaremos parte por parte.')}
                  </span>
                  <button
                    type='button'
                    onClick={closeRecordTip}
                    aria-label={t('Entendido')}
                    className='-mt-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full opacity-70'
                  >
                    <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
                  </button>
                </p>
              ) : null}
              <Button
                type='button'
                size='xl'
                variant='a'
                className='w-full'
                onClick={requestStartRecording}
              >
                <MicIcon className='size-5' strokeWidth={2.6} />
                {rerecordMode ? t('Regrabar frase') : t('Activar frase')}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <ExtractWordsToVaultModal
        open={extractWordsModalOpen}
        onOpenChange={setExtractWordsModalOpen}
        text={phrase.generated_phrase || ''}
        translation={phrase.translation || ''}
        seedWords={phrase.source_words || []}
        targetLang={targetLang}
        nativeLang={nativeLang}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />

      <ExplorePhraseTokenModal
        open={exploreModalOpen}
        onOpenChange={setExploreModalOpen}
        token={exploreToken}
        phrase={phrase.generated_phrase || ''}
        phraseTranslation={phrase.translation || ''}
        targetLang={targetLang}
        nativeLang={nativeLang}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />

      <ActivationHowToDialog
        open={howtoMode !== null}
        onOpenChange={(open) => {
          if (!open) setHowtoMode(null)
        }}
        pair={((guideActive && guidePairs) || plannedPairs)?.[0] ?? null}
        multiplePairs={(((guideActive && guidePairs) || plannedPairs)?.length ?? 0) > 1}
        nativeLang={nativeLang}
        targetLang={targetLang}
        startsRecording={howtoMode === 'start'}
        onConfirm={confirmHowto}
      />

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleKeepRecording()
        }}
      >
        <DialogContent
          data-recording-leave-dialog
          className='text-center sm:max-w-sm'
        >
          <DialogHeader className='items-center text-center sm:text-center'>
            <IconTile tone='a' solid size={64} className='mb-1'>
              <MicIcon className='size-8' strokeWidth={2.4} />
            </IconTile>
            <DialogTitle className='pr-0 font-display text-2xl font-black tracking-tight'>
              {t('Salir durante grabación')}
            </DialogTitle>
            <DialogDescription className='text-base font-semibold text-balance'>
              {t('Hay una grabación en curso. Si sales ahora, se perderá.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='flex-col gap-3 sm:flex-col'>
            <Button
              type='button'
              size='xl'
              variant='a'
              className='w-full'
              onClick={handleKeepRecording}
            >
              {t('Seguir grabando')}
            </Button>
            <Button
              type='button'
              size='lg'
              variant='destructive'
              className='w-full'
              onClick={handleLeaveAnyway}
            >
              {t('Salir igual')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Aviso de duración mínima: dorado, con reloj, para que destaque sobre el rojo de la grabación. */
function MinDurationHint({ text, className }: { text: string; className?: string }) {
  return (
    <p
      role='status'
      className={`m-0 inline-flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-extrabold ${className ?? ''}`}
      style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)', borderColor: 'var(--ica-gold)' }}
    >
      <TimerIcon className='size-4 shrink-0' strokeWidth={2.8} aria-hidden='true' />
      {text}
    </p>
  )
}

/** First-use hint under Escuchar: small and in the flow, so it covers nothing (Luis, 9 Oct). */
function ListenHint({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <p
      role='note'
      className='m-0 mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug font-bold'
      style={{ background: 'var(--ica-i-soft)', color: 'var(--ica-i-ink)' }}
    >
      <span className='min-w-0 flex-1'>{text}</span>
      <button
        type='button'
        onClick={onClose}
        aria-label={t('Entendido')}
        className='-mt-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full opacity-70'
      >
        <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
      </button>
    </p>
  )
}
