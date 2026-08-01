import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { AppConfig, Lexicard } from '../types'
import {
  completePregunticaAttempt,
  fetchLatestPregunticaAttempt,
  fetchPregunticaTokenSummary,
  fetchPregunticaWeekStatus,
  preparePregunticaAttempt,
  processPregunticaAttemptAudio,
  redeemPregunticaTokensForWeek,
  refreshPregunticaSuggestions,
  uploadPregunticaAttemptAudio,
  type PregunticaAttempt,
  type PregunticaFeedback,
  type PregunticaWeekStatus,
  type PregunticaTokenSummary,
  type PregunticaWordSuggestion,
} from '../services/preguntica'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { AddIcaSuggestionModal } from '../components/AddIcaSuggestionModal'
import { SpeakButton } from '../components/SpeakButton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CircleHelpIcon, EyeIcon, EyeOffIcon } from 'lucide-react'

type PregunticaViewProps = {
  config: AppConfig
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
}

type PendingLeaveAction =
  | { kind: 'back' }
  | { kind: 'path'; to: string }
  | null

const WORD_MODE_OPTIONS = [
  { key: 'mixed', label: 'Aleatorio' },
  { key: 'vital', label: 'Vital' },
  { key: 'frequent', label: 'Frecuente' },
  { key: 'occasional', label: 'Ocasional' },
  { key: 'rare', label: 'Raro' },
]

const WORD_MODE_DOT: Record<string, string> = {
  mixed: 'bg-violet-400',
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
}

const WORD_MODE_BADGE: Record<string, string> = {
  mixed: 'border-violet-300/60 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  vital: 'border-blue-300/60 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  frequent: 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  occasional: 'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rare: 'border-orange-300/60 bg-orange-500/10 text-orange-700 dark:text-orange-300',
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

const LIVE_BARS_COUNT = 36
const MAX_ANALYSIS_ATTEMPTS = 3

function getMinCharactersByLevel(level: string | undefined): number {
  const normalized = (level || 'A2').trim().toUpperCase()
  if (['0', 'A0', 'LEVEL0', 'PRE-A1', 'PREA1'].includes(normalized)) return 30
  if (normalized === 'A1') return 40
  if (normalized === 'A2') return 55
  if (normalized === 'B1') return 70
  if (normalized === 'B2') return 85
  return 100
}

function parseDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(Date.UTC(year, month - 1, day))
}

function getCountdownLabel(status: PregunticaWeekStatus | null): string {
  if (!status?.weekEnd) return '-'
  const endDate = parseDateOnly(status.weekEnd)
  if (!endDate) return '-'

  const diffMs = Math.max(0, endDate.getTime() - Date.now())
  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${days} días ${hours} horas ${minutes} min ${seconds} seg`
}

function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function normalizeForWordMatch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textIncludesWord(text: string, word: string): boolean {
  const normalizedText = normalizeForWordMatch(text)
  const normalizedWord = normalizeForWordMatch(word)
  if (!normalizedText || !normalizedWord) return false

  if (normalizedWord.includes(' ')) {
    return normalizedText.includes(normalizedWord)
  }

  const tokens = new Set(normalizedText.split(' '))
  return tokens.has(normalizedWord)
}

function normalizeCorrectionValue(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSameCorrection(original: string, suggestion: string): boolean {
  return normalizeCorrectionValue(original) === normalizeCorrectionValue(suggestion)
}

export function PregunticaView({
  config,
  cards,
  setCards,
  onWordAdded,
}: PregunticaViewProps) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<PregunticaWeekStatus | null>(null)
  const [tokenSummary, setTokenSummary] = useState<PregunticaTokenSummary | null>(null)
  const [attempt, setAttempt] = useState<PregunticaAttempt | null>(null)
  const [feedback, setFeedback] = useState<PregunticaFeedback | null>(null)
  const [latestTranscript, setLatestTranscript] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PregunticaWordSuggestion[]>([])
  const [mode, setMode] = useState('mixed')
  const [questionText, setQuestionText] = useState('')
  const [questionTranslation, setQuestionTranslation] = useState<string | null>(null)
  const [icaWords, setIcaWords] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [countdownLabel, setCountdownLabel] = useState('-')
  const [plusModalOpen, setPlusModalOpen] = useState(false)
  const [selectedStartMode, setSelectedStartMode] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedDurationMs, setRecordedDurationMs] = useState(0)
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [analysisAttemptsUsed, setAnalysisAttemptsUsed] = useState(0)
  const [analysisReady, setAnalysisReady] = useState(false)
  const [step4JustEnabled, setStep4JustEnabled] = useState(false)
  const [questionWasPlayed, setQuestionWasPlayed] = useState(false)
  const [listenCount, setListenCount] = useState(0)
  const [questionVisible, setQuestionVisible] = useState(false)
  const [translationVisible, setTranslationVisible] = useState(false)
  const [showIcaWordTranslations, setShowIcaWordTranslations] = useState(false)
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<PregunticaWordSuggestion | null>(null)
  const [addedSuggestionWords, setAddedSuggestionWords] = useState<string[]>([])
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const pendingLeaveRef = useRef<PendingLeaveAction>(null)
  const allowNavigationRef = useRef(false)
  const pageSectionRef = useRef<HTMLElement | null>(null)

  const hasAttemptInProgress = Boolean(attempt && attempt.status !== 'completed')
  const hasAnalyzedProgress = Boolean(
    feedback || (attempt && Number(attempt.retryCount || 0) > 0) || analysisAttemptsUsed > 0,
  )
  const shouldGuardLeave = hasAttemptInProgress && hasAnalyzedProgress

  useEffect(() => {
    if (!isRecording) return

    const timer = window.setInterval(() => {
      const startedAt = startedAtRef.current
      if (!startedAt) return
      setRecordingElapsedMs(Math.max(0, Date.now() - startedAt))
    }, 100)

    return () => {
      window.clearInterval(timer)
    }
  }, [isRecording])

  useEffect(() => {
    if (!analysisReady) return
    setStep4JustEnabled(true)
    const timer = window.setTimeout(() => {
      setStep4JustEnabled(false)
    }, 520)
    return () => {
      window.clearTimeout(timer)
    }
  }, [analysisReady])

  useEffect(() => {
    if (shouldGuardLeave) return
    pendingLeaveRef.current = null
    allowNavigationRef.current = false
    setLeaveDialogOpen(false)
  }, [shouldGuardLeave])

  useEffect(() => {
    if (!shouldGuardLeave) return

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [shouldGuardLeave])

  useEffect(() => {
    if (!shouldGuardLeave) return

    const onDocumentClickCapture = (event: MouseEvent): void => {
      if (allowNavigationRef.current || leaveDialogOpen) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as Element | null
      if (!target) return
      if (target.closest('[role="dialog"]')) return
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
  }, [leaveDialogOpen, shouldGuardLeave])

  useEffect(() => {
    if (!shouldGuardLeave) return

    const markerState = { pregunticaLeaveGuard: true, at: Date.now() }
    window.history.pushState(markerState, '', window.location.href)

    const onPopState = (): void => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false
        return
      }

      if (leaveDialogOpen) {
        window.history.pushState(markerState, '', window.location.href)
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
  }, [leaveDialogOpen, shouldGuardLeave])

  useEffect(() => {
    if (!attempt || attempt.status === 'completed') return
    const storageKey = `preguntica-info-shown:${attempt.id}`
    const wasShown = window.localStorage.getItem(storageKey) === '1'
    if (wasShown) return
    setInfoModalOpen(true)
    window.localStorage.setItem(storageKey, '1')
  }, [attempt])

  const wordTranslationMap = useMemo(() => {
    const map = new Map<string, string>()
    cards.forEach((card) => {
      const key = normalizeComparableText(card.target)
      if (!key || map.has(key)) return
      map.set(key, card.native || '')
    })
    return map
  }, [cards])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const [weekStatus, tokens] = await Promise.all([
          fetchPregunticaWeekStatus({
            targetLang: config.targetLang,
            nativeLang: config.nativeLang,
          }),
          fetchPregunticaTokenSummary(),
        ])
        if (!active) return

        setStatus(weekStatus)
        setTokenSummary(tokens)

        if (weekStatus?.weekId) {
          const latest = await fetchLatestPregunticaAttempt(weekStatus.weekId)
          if (!active) return
          setAttempt(latest)
          if (latest?.questionText) setQuestionText(latest.questionText)
          setQuestionTranslation(latest?.questionTranslation || null)
          if (latest?.icaWords?.length) setIcaWords(latest.icaWords)
          setAnalysisAttemptsUsed(latest?.retryCount || 0)
          setAnalysisReady(false)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar PreguntICA')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    setCountdownLabel(getCountdownLabel(status))
    const timer = window.setInterval(() => {
      setCountdownLabel(getCountdownLabel(status))
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [status])

  useEffect(() => {
    if (loading) return
    if (!status) return
    if (status.isUnlocked) return
    navigate(DASHBOARD_ROUTES.gamesIca, { replace: true })
  }, [loading, navigate, status])

  async function refreshStatus() {
    const [weekStatus, tokens] = await Promise.all([
      fetchPregunticaWeekStatus({
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
      }),
      fetchPregunticaTokenSummary(),
    ])
    setStatus(weekStatus)
    setTokenSummary(tokens)
  }

  async function startAttemptWorkflow(selectedMode: string) {
    const created = await preparePregunticaAttempt({
      wordMode: selectedMode,
      targetLang: config.targetLang,
      nativeLang: config.nativeLang,
      level: config.level || 'A2',
      excludeQuestionId: attempt?.questionId || null,
    })

    setAttempt(created)
    setQuestionText(created.questionText || '')
    setQuestionTranslation(created.questionTranslation || null)
    setIcaWords(created.icaWords)
    setQuestionWasPlayed(false)
    setListenCount(0)
    setQuestionVisible(false)
    setTranslationVisible(false)
    setShowIcaWordTranslations(false)
    setFeedback(null)
    setLatestTranscript(null)
    setSuggestions([])
    setRecordedBlob(null)
    setRecordedDurationMs(0)
    setRecordingElapsedMs(0)
    setAnalysisAttemptsUsed(0)
    setAnalysisReady(false)
    setSelectedStartMode(null)
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl)
      setRecordedUrl(null)
    }

    await refreshStatus()
  }

  async function handleStartAttempt(selectedMode: string) {
    if (!canStartAttempt) {
      toast.error('Todavía no puedes iniciar una nueva PreguntICA')
      return
    }

    setWorking(true)
    try {
      await startAttemptWorkflow(selectedMode)
      setMode(selectedMode)
      toast.success('Intento PreguntICA iniciado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el intento')
    } finally {
      setWorking(false)
    }
  }

  async function handleRedeemAndRetry() {
    if (!status?.weekStart) {
      toast.error('No se encontró la semana para canjear fichas')
      return
    }
    if (!selectedStartMode) {
      toast.error('Selecciona un tipo de palabras para continuar')
      return
    }

    setWorking(true)
    try {
      await redeemPregunticaTokensForWeek(status.weekStart, {
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
      })
      await startAttemptWorkflow(selectedStartMode)
      setMode(selectedStartMode)
      setPlusModalOpen(false)
      setSelectedStartMode(null)
      toast.success('Canje realizado. PreguntICA + iniciada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo canjear fichas')
    } finally {
      setWorking(false)
    }
  }

  function stopMicStream() {
    if (!mediaStreamRef.current) return
    mediaStreamRef.current.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }

  async function handleStartRecording() {
    if (isRecording) return

    if (typeof MediaRecorder === 'undefined') {
      toast.error('Tu dispositivo no soporta grabación de audio')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const mime = MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = recorder
      chunksRef.current = []
      startedAtRef.current = Date.now()
      setRecordingElapsedMs(0)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const duration = Math.max(0, Date.now() - (startedAtRef.current || Date.now()))
        const blob = new Blob(chunksRef.current, { type: mime })
        if (blob.size > 0) {
          if (recordedUrl) URL.revokeObjectURL(recordedUrl)
          const nextUrl = URL.createObjectURL(blob)
          setRecordedBlob(blob)
          setRecordedDurationMs(duration)
          setRecordingElapsedMs(duration)
          setRecordedUrl(nextUrl)
          setAnalysisReady(true)
        }
        chunksRef.current = []
        setIsRecording(false)
        stopMicStream()
      }

      recorder.start(300)
      setIsRecording(true)
    } catch {
      stopMicStream()
      toast.error('No se pudo iniciar la grabación')
    }
  }

  function handleStopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }

  async function handleAnalyze() {
    if (!attempt) return
    if (!recordedBlob) {
      toast.error('Primero debes grabar tu respuesta')
      return
    }
    if (!analysisReady) {
      toast.error('Graba un nuevo audio para volver a analizar')
      return
    }
    if (analysisAttemptsUsed >= MAX_ANALYSIS_ATTEMPTS) {
      toast.error('Ya usaste los 3 análisis disponibles')
      return
    }

    setWorking(true)
    setIsAnalyzing(true)

    try {
      const audio = await uploadPregunticaAttemptAudio({
        attemptId: attempt.id,
        audioBlob: recordedBlob,
        mimeType: recordedBlob.type || 'audio/webm',
        durationMs: recordedDurationMs,
      })

      const processed = await processPregunticaAttemptAudio({
        attemptId: attempt.id,
        audioId: audio.id,
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
        level: config.level || 'A2',
        icaWords,
      })

      if (!processed.ok) {
        if (processed.error === 'ANALYSIS_LIMIT_REACHED') {
          setAnalysisAttemptsUsed(processed.retriesUsed || MAX_ANALYSIS_ATTEMPTS)
          setAnalysisReady(false)
          toast.error('Ya usaste los 3 análisis disponibles')
          return
        }

        if (processed.error === 'EMPTY_TRANSCRIPTION') {
          setAnalysisReady(false)
          toast.error('No se detectó voz en el audio. Vuelve a grabar y prueba de nuevo.')
          return
        }

        if (processed.error === 'INVALID_RESPONSE_LENGTH') {
          setAnalysisReady(false)
          toast.error(
            `Tu respuesta debe tener entre ${processed.min || minCharactersRequired} y ${processed.max || 1200} caracteres.`,
          )
          return
        }

        toast.error('No se pudo analizar la respuesta. Graba de nuevo e inténtalo otra vez.')
        return
      }

      setFeedback(processed.analysis || null)
      setLatestTranscript(processed.transcript || null)
      setSuggestions(processed.analysis?.suggestedIcaWords || [])
      setAddedSuggestionWords([])
      setAttempt((current) =>
        current
          ? {
              ...current,
              transcriptText: processed.transcript || current.transcriptText,
              responseCharCount:
                processed.responseCharCount ?? current.responseCharCount,
              retryCount: processed.retriesUsed ?? current.retryCount,
            }
          : current,
      )
      setAnalysisAttemptsUsed((current) =>
        processed.retriesUsed || Math.min(MAX_ANALYSIS_ATTEMPTS, current + 1),
      )
      setAnalysisReady(false)
      toast.success('Análisis completado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo analizar la respuesta')
    } finally {
      setWorking(false)
      setIsAnalyzing(false)
    }
  }

  async function handleRefreshSuggestions() {
    if (!attempt) return

    setWorking(true)
    try {
      const result = await refreshPregunticaSuggestions({
        attemptId: attempt.id,
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
        level: config.level || 'A2',
        icaWords,
        currentSuggestions: suggestions.map((item) => item.word),
      })

      if (!result.ok) {
        toast.error('Ya usaste todos los refresh de sugerencias')
        return
      }

      setSuggestions(result.suggestions || [])
      setAddedSuggestionWords([])
      setAttempt((current) =>
        current
          ? {
              ...current,
              suggestionsRefreshCount: result.refreshIndex || current.suggestionsRefreshCount,
            }
          : current,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo refrescar sugerencias')
    } finally {
      setWorking(false)
    }
  }

  async function handleCompleteAttempt() {
    if (!attempt) return

    setWorking(true)
    try {
      await completePregunticaAttempt(attempt.id)
      await refreshStatus()
      toast.success('PreguntICA completada esta semana')
      navigate(DASHBOARD_ROUTES.gamesIca)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cerrar el intento')
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <section className='mx-auto w-full max-w-4xl px-4 pb-24 pt-8'>
        <p className='text-sm text-muted-foreground'>Cargando PreguntICA...</p>
      </section>
    )
  }

  const locked = !status?.isUnlocked
  const hasCompletedWeek = Boolean(status?.completedAt)
  const hasActiveAttempt = Boolean(attempt && attempt.status !== 'completed')
  const activeAttempt = hasActiveAttempt ? attempt : null
  const canStartAttempt = Boolean(status?.canStart)
  const tokenBalance = tokenSummary?.balance ?? 0
  const hasRedeemableTokens = tokenBalance >= 1
  const showAttemptSteps = hasActiveAttempt
  const ctaDisabled =
    working || hasActiveAttempt || locked || (!hasCompletedWeek && !canStartAttempt)
  const transcriptForFeedback = latestTranscript || activeAttempt?.transcriptText || ''
  const currentStepMode = activeAttempt?.wordMode || mode
  const currentStepModeLabel =
    WORD_MODE_OPTIONS.find((option) => option.key === currentStepMode)?.label || 'Aleatorio'
  const step2Enabled = Boolean(activeAttempt)
  const step2Completed = step2Enabled && questionWasPlayed
  const step3Enabled = Boolean(activeAttempt) && questionWasPlayed
  const step3Completed = Boolean(recordedBlob)
  const step4Enabled = Boolean(recordedBlob || feedback)
  const step4Completed = Boolean(feedback)
  const isPlusAttempt = activeAttempt?.attemptKind === 'token_unlock'
  const analysisAttemptsLeft = Math.max(0, MAX_ANALYSIS_ATTEMPTS - analysisAttemptsUsed)
  const minCharactersRequired = getMinCharactersByLevel(config.level)
  const canAnalyzeCurrentAudio =
    analysisReady && analysisAttemptsLeft > 0 && !working
  const questionRevealReady = step2Enabled && questionWasPlayed && !questionVisible
  const translationRevealReady =
    step2Enabled && questionVisible && Boolean(questionTranslation) && !translationVisible

  const questionRevealLabel = !step2Enabled
    ? 'Inicia una PreguntICA'
    : !questionWasPlayed
      ? '🔒 Escúchala primero para poder leerla'
      : questionVisible
        ? ''
        : '👁 Toca aquí para mostrar la pregunta'

  const translationRevealLabel = !step2Enabled
    ? 'Inicia una PreguntICA'
    : !questionVisible
      ? '🔒 Se desbloquea tras mostrar la pregunta'
      : !questionTranslation
        ? 'Sin traducción'
        : translationVisible
          ? ''
          : '👁 Toca aquí para mostrar la traducción'

  const step2Tone = step2Completed
    ? 'border-emerald-300/50 bg-background'
    : step2Enabled
      ? 'border-blue-300/60 bg-blue-50/80 dark:border-blue-500/40 dark:bg-blue-950/35'
      : 'border-border bg-slate-100/75 opacity-45 dark:bg-slate-900/70'

  const step3Tone = step3Completed
    ? 'border-emerald-300/50 bg-background'
    : step3Enabled
      ? 'border-blue-300/60 bg-blue-50/80 dark:border-blue-500/40 dark:bg-blue-950/35'
      : 'border-border bg-slate-100/75 opacity-45 dark:bg-slate-900/70'

  const step4Tone = step4Enabled
    ? `${step4Completed ? 'border-emerald-300/50' : 'border-blue-300/60 dark:border-blue-500/40'} bg-blue-50/80 dark:bg-blue-950/35`
    : 'border-border bg-slate-100/75 opacity-45 dark:bg-slate-900/70'

  const icaUsage = icaWords.map((word) => ({
    word,
    used: textIncludesWord(transcriptForFeedback, word),
  }))
  const usedIcaCount = icaUsage.filter((item) => item.used).length

  const existingCardWords = new Set(cards.map((card) => normalizeComparableText(card.target)))
  const addedSuggestionSet = new Set(addedSuggestionWords.map(normalizeComparableText))

  function isSuggestionAdded(word: string): boolean {
    const key = normalizeComparableText(word)
    return existingCardWords.has(key) || addedSuggestionSet.has(key)
  }

  function handleOpenSuggestionModal(suggestion: PregunticaWordSuggestion) {
    if (isSuggestionAdded(suggestion.word)) return
    setSelectedSuggestion(suggestion)
    setSuggestionModalOpen(true)
  }

  function handleStartMenuSelect(nextMode: string) {
    if (hasCompletedWeek) {
      setSelectedStartMode(nextMode)
      setPlusModalOpen(true)
      return
    }

    void handleStartAttempt(nextMode)
  }

  function handleCancelLeave() {
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
  }

  async function handleConfirmLeave() {
    const pendingLeave = pendingLeaveRef.current
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
    if (!pendingLeave || !attempt) return

    setWorking(true)
    try {
      await completePregunticaAttempt(attempt.id)
      toast.success('PreguntICA finalizada antes de salir')
      allowNavigationRef.current = true
      if (pendingLeave.kind === 'back') {
        window.history.back()
        return
      }
      navigate(pendingLeave.to)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo finalizar la PreguntICA')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section ref={pageSectionRef} className='mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:pb-10'>
      <style>{`@keyframes preguntica-wave-mid { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1.6); } } @keyframes preguntica-step-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } @keyframes preguntica-feedback-in { from { opacity: 0; transform: translateY(10px) scale(0.995); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <div className='rounded-[24px] border border-border bg-[linear-gradient(160deg,hsl(var(--background)),hsl(var(--muted)/0.35))] p-6'>
        <div className='mb-3 flex justify-end'>
          <div className='flex items-center gap-2'>
            {hasActiveAttempt && (
              <button
                type='button'
                onClick={() => setInfoModalOpen(true)}
                className='inline-flex items-center gap-1 rounded-lg border border-sky-300/60 bg-sky-50/90 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-200'
              >
                <CircleHelpIcon className='size-3.5' />
                Ver guía
              </button>
            )}
            <button
              type='button'
              onClick={() => {
                if (!shouldGuardLeave) {
                  navigate(DASHBOARD_ROUTES.pregunticaHistory)
                  return
                }
                pendingLeaveRef.current = { kind: 'path', to: DASHBOARD_ROUTES.pregunticaHistory }
                setLeaveDialogOpen(true)
              }}
              className='rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100'
            >
              Ver historial completo
            </button>
          </div>
        </div>
        <p className='text-xs font-semibold tracking-[0.2em] text-slate-500'>PREGUNTICA</p>
        <h1 className='mt-2 font-serif text-3xl font-bold text-slate-700 dark:text-slate-100'>
          Tu reto semanal de expresión
        </h1>
        <div className='mt-5 flex flex-wrap items-end justify-between gap-3'>
          <p className='text-sm text-slate-500'>
            {hasCompletedWeek
              ? '✅ Reto completado. Tu intento quedó guardado en el historial.'
              : `Cuenta atrás: ${countdownLabel}`}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={ctaDisabled} className='text-sm font-semibold'>
                {hasCompletedWeek ? 'Iniciar PreguntICA +' : 'Iniciar PreguntICA'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              {WORD_MODE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={`start-mode-${option.key}`}
                  onClick={() => handleStartMenuSelect(option.key)}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${WORD_MODE_DOT[option.key]}`} />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showAttemptSteps && (
      <div className='mt-4 space-y-4' style={{ animation: 'preguntica-step-in 0.55s ease' }}>
          <div className={`rounded-2xl border p-4 transition-all duration-500 ${step2Tone}`}>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm font-semibold'>1) Escucha y descubre la pregunta</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${step2Completed ? 'border-emerald-300/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                {step2Completed ? '✓ Completado' : questionVisible ? 'Pregunta revelada' : 'Pendiente de escucha'}
              </span>
            </div>
            <p className='mt-2 text-xs text-muted-foreground'>
              Primero entrena el oído: la pregunta se muestra escrita después de escucharla
              al menos una vez.
            </p>
            {!step2Enabled && (
              <p className='mt-2 text-xs text-muted-foreground'>Inicia una PreguntICA para habilitar este paso.</p>
            )}
            <div className='mt-3 flex flex-wrap gap-2'>
              <SpeakButton
                text={questionText}
                langName={config.targetLang}
                color='#3B82F6'
                label='Escuchar pregunta'
                variant='cta'
                disabled={!step2Enabled || !questionText || working}
                onPlayingChange={(isPlaying) => {
                  if (isPlaying) {
                    setQuestionWasPlayed(true)
                    return
                  }
                  setListenCount((current) => current + 1)
                }}
                className='mt-0'
              />
            </div>

            <p className='mt-2 text-xs text-muted-foreground'>
              {listenCount > 0
                ? `Escuchada ${listenCount} ${listenCount === 1 ? 'vez' : 'veces'}.`
                : 'Aún no has escuchado la pregunta.'}
            </p>

            <button
              type='button'
              onClick={() => {
                if (!step2Enabled || !questionWasPlayed || questionVisible) return
                setQuestionVisible(true)
              }}
              disabled={!step2Enabled || !questionWasPlayed || questionVisible}
              className={`mt-4 w-full rounded-xl border border-dashed bg-background/90 p-3 text-left transition-all duration-500 disabled:cursor-not-allowed ${
                questionRevealReady
                  ? 'border-sky-300 bg-sky-50/40 animate-pulse dark:border-sky-500/60 dark:bg-sky-950/25'
                  : 'border-border'
              }`}
            >
              <div className='flex items-center justify-between gap-2'>
                <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                  Pregunta · {config.targetLang}
                </p>
              </div>
              <div className='relative mt-1 min-h-10'>
                <p
                  className={`text-sm text-foreground transition-all duration-500 ${questionVisible ? 'blur-0 opacity-100' : 'select-none blur-sm opacity-70'}`}
                >
                  {questionText || 'Pregunta pendiente de generar'}
                </p>
                {!questionVisible && questionRevealLabel && (
                  <div className='absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground'>
                    {questionRevealLabel}
                  </div>
                )}
              </div>
            </button>

            <button
              type='button'
              onClick={() => {
                if (!step2Enabled || !questionVisible || !questionTranslation || translationVisible) return
                setTranslationVisible(true)
              }}
              disabled={!step2Enabled || !questionVisible || !questionTranslation || translationVisible}
              className={`mt-2 w-full rounded-xl border border-dashed bg-background/90 p-3 text-left text-sm transition-all duration-500 disabled:cursor-not-allowed ${
                translationRevealReady
                  ? 'border-sky-300 bg-sky-50/40 animate-pulse dark:border-sky-500/60 dark:bg-sky-950/25'
                  : 'border-border'
              }`}
            >
              <div className='flex items-center justify-between gap-2'>
                <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                  Traducción (español)
                </p>
              </div>
              <div className='relative mt-1 min-h-9'>
                <p
                  className={`text-foreground/80 transition-all duration-500 ${questionVisible && translationVisible && questionTranslation ? 'blur-0 opacity-100' : 'select-none blur-sm opacity-70'}`}
                >
                  {questionTranslation || 'Traducción no disponible'}
                </p>
                {!translationVisible && translationRevealLabel && (
                  <div className='absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground'>
                    {translationRevealLabel}
                  </div>
                )}
              </div>
            </button>

            <div className='mt-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <p className='text-xs font-semibold text-muted-foreground'>Palabras ICA objetivo</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${WORD_MODE_BADGE[currentStepMode] || 'border-border bg-muted/40 text-muted-foreground'}`}
                >
                  Modo: {currentStepModeLabel}
                </span>
              </div>
              {questionWasPlayed ? (
                <div className='mt-2'>
                  <button
                    type='button'
                    onClick={() => setShowIcaWordTranslations((current) => !current)}
                    className='inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:bg-muted/40'
                  >
                    {showIcaWordTranslations ? <EyeOffIcon className='size-3' /> : <EyeIcon className='size-3' />}
                    {showIcaWordTranslations ? 'Ocultar traducción' : 'Ver traducción'}
                  </button>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    {icaWords.map((word) => (
                      <span
                        key={word}
                        className='rounded-full border border-[#86efac]/70 bg-[#f0fdf4] px-2.5 py-1 text-xs font-semibold text-[#166534]'
                      >
                        {word}
                        {showIcaWordTranslations && wordTranslationMap.get(normalizeComparableText(word))
                          ? ` · ${wordTranslationMap.get(normalizeComparableText(word))}`
                          : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className='mt-2 text-xs text-muted-foreground'>
                  Se desbloquean tras escuchar la pregunta al menos una vez.
                </p>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border p-4 transition-all duration-500 ${step3Tone}`}>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm font-semibold'>2) Graba tu respuesta</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${step3Completed ? 'border-emerald-300/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                {step3Completed ? '✓ Completado' : recordedBlob ? 'Listo para analizar' : 'Sin grabación'}
              </span>
            </div>
            {!step3Enabled && (
              <p className='mt-2 text-xs text-muted-foreground'>Escucha la pregunta al menos una vez para habilitar este paso.</p>
            )}
            <div className='mt-3 rounded-xl border border-border bg-muted/20 p-3'>
              <div className='flex flex-wrap items-center gap-3'>
                {!isRecording ? (
                  <Button
                    variant={recordedBlob ? 'outline' : 'default'}
                    onClick={handleStartRecording}
                    disabled={!step3Enabled || working}
                    className='rounded-full px-4 py-2 text-sm font-semibold'
                  >
                    {recordedBlob ? '🔁 Volver a grabar' : '🎙️ Empezar grabación'}
                  </Button>
                ) : (
                  <Button
                    variant='destructive'
                    onClick={handleStopRecording}
                    className='rounded-full px-4 py-2 text-sm font-semibold'
                  >
                    ⏹️ Detener grabación
                  </Button>
                )}

                <div className='flex h-12 min-w-52 flex-1 items-center gap-1 overflow-hidden px-1'>
                  {Array.from({ length: LIVE_BARS_COUNT }, (_, index) => {
                    const delay = index % 3 === 0 ? 0.15 : index % 3 === 1 ? 0.3 : 0
                    return (
                    <span
                      key={`bar-${index}`}
                      className={`w-1 rounded-sm ${isRecording ? 'bg-sky-500' : 'bg-slate-300'}`}
                      style={{
                        height: '20px',
                        transformOrigin: 'center',
                        transform: isRecording ? undefined : 'scaleY(0.35)',
                        animation: isRecording
                          ? `preguntica-wave-mid 1s ease-in-out ${delay}s infinite`
                          : undefined,
                      }}
                    />
                    )
                  })}
                </div>

                <span className='min-w-16 text-right text-sm font-semibold text-muted-foreground'>
                  {((isRecording ? recordingElapsedMs : recordedDurationMs) / 1000).toFixed(1)}s
                </span>
              </div>

              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <p className='text-xs text-muted-foreground'>
                  Cuando termines de grabar, pasa al paso 3 para analizar tu respuesta.
                </p>
                <p className='text-xs font-medium text-sky-700 dark:text-sky-300'>
                  Mínimo requerido según tu nivel ({config.level || 'A2'}): {minCharactersRequired} caracteres.
                </p>
              </div>
            </div>

            {recordedUrl && (
              <div className='mt-3 rounded-xl border border-border bg-muted/30 p-3'>
                <audio controls src={recordedUrl} className='w-full' />
                <p className='mt-1 text-xs text-muted-foreground'>
                  Duración: {(recordedDurationMs / 1000).toFixed(1)}s
                </p>
              </div>
            )}
          </div>

          <div
            className={`rounded-2xl border p-4 transition-all duration-500 ${step4Tone}`}
            style={{ animation: step4JustEnabled ? 'preguntica-step-in 0.45s ease' : undefined }}
          >
            <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm font-semibold'>3) Tu feedback</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${step4Completed ? 'border-emerald-300/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                {step4Completed ? '✓ Completado' : isAnalyzing ? 'Analizando...' : 'Pendiente'}
              </span>
            </div>

            <div className='mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/70 p-2.5'>
              <p className='text-xs font-semibold text-muted-foreground'>
                Análisis usados: {analysisAttemptsUsed}/{MAX_ANALYSIS_ATTEMPTS}
              </p>
              <Button
                variant={feedback ? 'outline' : 'default'}
                onClick={handleAnalyze}
                disabled={!canAnalyzeCurrentAudio}
                className='rounded-full px-4 py-2 text-sm font-semibold'
              >
                {isAnalyzing ? (
                  <span className='inline-flex items-center gap-2'>
                    <span className='size-3 animate-spin rounded-full border-2 border-current border-t-transparent' />
                    Analizando...
                  </span>
                ) : feedback ? (
                  'Volver a analizar'
                ) : (
                  'Analizar respuesta'
                )}
              </Button>
            </div>

            {analysisAttemptsLeft <= 0 ? (
              <p className='mb-3 text-xs text-muted-foreground'>
                Ya usaste los 3 análisis máximos para esta PreguntICA.
              </p>
            ) : feedback && !analysisReady ? (
              <p className='mb-3 text-xs text-muted-foreground'>
                Para volver a analizar, graba un nuevo audio en el paso 3.
              </p>
            ) : analysisReady ? (
              <p className='mb-3 text-xs text-muted-foreground'>
                Audio listo. Puedes analizar esta respuesta ahora.
              </p>
            ) : null}

            {!feedback ? (
              <p className='text-xs text-muted-foreground'>
                Aquí aparecerán la naturalidad, la transcripción, correcciones y sugerencias ICA una vez analizada tu respuesta.
              </p>
            ) : (
              <div style={{ animation: 'preguntica-feedback-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}>
              <div className='flex flex-wrap items-center gap-3'>
                <p className='font-serif text-3xl font-bold text-amber-500'>
                  {feedback.score.toFixed(1)}
                  <span className='ml-1 text-base font-medium text-muted-foreground'>/10</span>
                </p>
                <div className='h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-muted/70'>
                  <i
                    className='block h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300'
                    style={{ width: `${Math.max(0, Math.min(100, feedback.score * 10))}%` }}
                  />
                </div>
                <p className='text-xs font-semibold tracking-wide text-muted-foreground'>Naturalidad</p>
              </div>

              <p className='mt-1 text-sm text-muted-foreground'>{feedback.naturalness}</p>

              {(latestTranscript || activeAttempt?.transcriptText) && (
                <div className='mt-3 rounded-lg border-l-4 border-cyan-400 bg-cyan-500/10 p-3'>
                  <p className='text-xs font-semibold text-muted-foreground'>Transcripción</p>
                  <p className='mt-1 text-sm text-foreground'>
                    {latestTranscript || activeAttempt?.transcriptText}
                  </p>
                </div>
              )}

              {icaUsage.length > 0 && (
                <div className='mt-4'>
                  <p className='text-xs font-semibold text-muted-foreground'>
                    Palabras objetivo usadas · {usedIcaCount}/{icaUsage.length}
                  </p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    {icaUsage.map((item) => (
                      <span
                        key={item.word}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          item.used
                            ? 'border-emerald-300/60 bg-emerald-100/70 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                            : 'border-border bg-muted/40 text-muted-foreground'
                        }`}
                      >
                        {item.used ? '✓ ' : ''}
                        {item.word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {feedback.corrections.length > 0 && (
                <ul className='mt-3 space-y-2 text-sm'>
                  {feedback.corrections.map((item, index) => (
                    <li key={`${item.original}-${index}`} className='rounded-lg border border-border bg-background/70 p-2'>
                      {isSameCorrection(item.original, item.suggestion) ? (
                        <span className='font-semibold text-emerald-500'>✓ {item.suggestion}</span>
                      ) : (
                        <>
                          <span className='font-semibold text-red-500 line-through'>{item.original}</span>
                          {' '}→{' '}
                          <span className='font-semibold text-emerald-500'>{item.suggestion}</span>
                        </>
                      )}
                      <div className='text-xs text-muted-foreground'>{item.reason}</div>
                    </li>
                  ))}
                </ul>
              )}

              <div className='mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3'>
                <p className='text-sm text-foreground/90'>{feedback.coachReply}</p>
              </div>

              <div className='mt-4 rounded-xl border border-border bg-background/85 p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs font-semibold text-muted-foreground'>Sugerencias ICA (toca para añadir al Baúl)</p>
                  <button
                    type='button'
                    onClick={handleRefreshSuggestions}
                    disabled={!activeAttempt || working || (activeAttempt.suggestionsRefreshCount || 0) >= 3}
                    className='rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    Actualizar sugerencias ({Math.max(0, 3 - (activeAttempt?.suggestionsRefreshCount || 0))})
                  </button>
                </div>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {suggestions.map((item) => (
                    <button
                      type='button'
                      key={`${item.word}-${item.reason}`}
                      onClick={() => handleOpenSuggestionModal(item)}
                      disabled={isSuggestionAdded(item.word)}
                      className='rounded-lg border border-amber-300/40 bg-amber-500/10 px-2 py-1 text-left text-xs text-foreground transition hover:border-amber-300/80 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70'
                      title={item.translation
                        ? `Traducción: ${item.translation}\nMotivo: ${item.reason}`
                        : `Motivo: ${item.reason}`}
                    >
                      <span className='font-semibold'>
                        {isSuggestionAdded(item.word) ? '✓ ' : '+ '}
                        {item.word}
                      </span>
                      {item.translation && (
                        <span className='ml-1 text-muted-foreground'>· {item.translation}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleCompleteAttempt}
                disabled={!activeAttempt || working}
                className='mt-4 text-sm font-semibold'
              >
                {isPlusAttempt ? 'Finalizar PreguntICA +' : 'Finalizar PreguntICA semanal'}
              </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={plusModalOpen}
        onOpenChange={(open) => {
          setPlusModalOpen(open)
          if (!open) setSelectedStartMode(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar PreguntICA +</DialogTitle>
            <DialogDescription>
              Canjea 1 ficha para desbloquear una nueva PreguntICA esta semana.
            </DialogDescription>
          </DialogHeader>

          <div className='rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm'>
            <p className='font-semibold text-amber-700 dark:text-amber-300'>
              Fichas disponibles: {tokenBalance.toFixed(2)}/1.00
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {hasRedeemableTokens
                ? 'Tienes fichas suficientes para canjear ahora.'
                : 'Necesitas 1 ficha para habilitar PreguntICA +.'}
            </p>
            {selectedStartMode && (
              <p className='mt-1 text-xs text-muted-foreground'>
                Tipo seleccionado:{' '}
                {WORD_MODE_OPTIONS.find((item) => item.key === selectedStartMode)?.label || 'Aleatorio'}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setPlusModalOpen(false)}
              disabled={working}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              onClick={() => void handleRedeemAndRetry()}
              disabled={working || hasActiveAttempt || !hasRedeemableTokens || !selectedStartMode}
            >
              Canjear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={infoModalOpen} onOpenChange={setInfoModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guía rápida de PreguntICA</DialogTitle>
            <DialogDescription>
              Este reto tiene un flujo concreto para aprovechar mejor tu práctica.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2 text-sm text-foreground/90'>
            <p>
              1) 🎧 <strong>Escucha</strong> la pregunta, luego <strong>muéstrala</strong> y, si quieres,
              activa también su traducción.
            </p>
            <p>
              2) 🎙️ Graba tu respuesta usando las <strong>palabras ICA objetivo</strong> de este intento.
            </p>
            <p>
              3) ✍️ Tu audio debe tener al menos <strong>{minCharactersRequired} caracteres</strong> para
              analizarse en tu nivel ({config.level || 'A2'}).
            </p>
            <p>
              4) 🔁 Tienes <strong>3 intentos de análisis</strong> por PreguntICA. Si quieres reanalizar,
              primero graba un audio nuevo.
            </p>
          </div>

          <DialogFooter>
            <Button type='button' onClick={() => setInfoModalOpen(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          setLeaveDialogOpen(open)
          if (!open) pendingLeaveRef.current = null
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir de PreguntICA?</DialogTitle>
            <DialogDescription>
              Si sales ahora, finalizaremos esta PreguntICA para guardar tu progreso.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={handleCancelLeave} disabled={working}>
              Quedarme
            </Button>
            <Button type='button' onClick={() => void handleConfirmLeave()} disabled={working}>
              Finalizar y salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddIcaSuggestionModal
        open={suggestionModalOpen}
        onOpenChange={setSuggestionModalOpen}
        suggestion={selectedSuggestion}
        config={config}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
        onAdded={(word) => {
          setAddedSuggestionWords((current) => {
            const normalized = normalizeComparableText(word)
            if (current.map(normalizeComparableText).includes(normalized)) return current
            return [...current, word]
          })
        }}
      />
    </section>
  )
}
