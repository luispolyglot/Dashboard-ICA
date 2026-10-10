import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { AppConfig, Lexicard, StudyLevel } from '../types'
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
import { speakNatural, stopTTS } from '../services/tts'
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
  CheckIcon,
  CircleHelpIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  LockIcon,
  MicIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  TimerIcon,
  Volume2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tn, langName, uiLocale } from '@/i18n'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { PREGUNTICA_EXTRA_COST } from '../game/rules'
import { coinsText, useFichas } from '../game/fichas'
import { useAuth } from '@/auth/AuthContext'
import { FichaIcon, MicGlyph } from '../game/icons'
import { GamePage, GameProgress, HeroBlock, IconTile, PageTitle, Pill, SectionLabel, tone } from '../game/ui'
import {
  CoachBubble,
  CoinPriceButton,
  CorrectionList,
  ModePicker,
  ModePill,
  ScoreHero,
  StepBadge,
  SuggestionChips,
  TranscriptBlock,
  WORD_MODES,
  WordUsage,
} from './pregunticaParts'

type PregunticaViewProps = {
  config: AppConfig
  studyLevel: StudyLevel
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
}

type PendingLeaveAction =
  | { kind: 'back' }
  | { kind: 'path'; to: string }
  | null

// Tipos de palabras (el color de cada uno está en pregunticaParts).
const WORD_MODE_OPTIONS = WORD_MODES

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
  const normalized = (level || 'A2').trim().toUpperCase().replace(/\s+/g, '')
  if (['0', 'A0', 'LEVEL0', 'PRE-A1', 'PREA1'].includes(normalized)) return 30
  if (normalized === 'A1') return 40
  if (normalized === 'A1+' || normalized === 'A1PLUS') return 48
  if (normalized === 'A2') return 55
  if (normalized === 'A2+' || normalized === 'A2PLUS') return 62
  if (normalized === 'B1') return 70
  if (normalized === 'B1+' || normalized === 'B1PLUS') return 78
  if (normalized === 'B2') return 85
  if (normalized === 'B2+' || normalized === 'B2PLUS') return 92
  return 100
}

function parseDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  // The server closes the week at midnight in the student's own time zone, not UTC.
  return new Date(year, month - 1, day)
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

  const pad = (value: number) => String(value).padStart(2, '0')
  return days > 0 ? `${days} d ${pad(hours)} h ${pad(minutes)} min` : `${pad(hours)} h ${pad(minutes)} min`
}

/**
 * Last day of the PreguntICA week, said the way people talk: «hoy», «mañana» or «el jueves 14»,
 * and when the next one opens: «el jueves 15», or «el día 1 del mes que viene» after the 4th week.
 * From November 2026 the weeks are those of the month: 1-7, 8-14, 15-21, 22-28 (Luis, 9 Oct).
 */
function weekLastDayWords(weekEnd: string | undefined): { when: string; next: string } | null {
  const end = weekEnd ? parseDateOnly(weekEnd) : null
  if (!end) return null
  const lastDay = new Date(end)
  lastDay.setDate(lastDay.getDate() - 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysLeft = Math.round((lastDay.getTime() - today.getTime()) / 86_400_000)
  const dayWords = (date: Date) =>
    t('el {day}', { day: date.toLocaleDateString(uiLocale(), { weekday: 'long', day: 'numeric' }) })
  const when = daysLeft <= 0 ? t('hoy') : daysLeft === 1 ? t('mañana') : dayWords(lastDay)
  // After day 28 the next PreguntICA is on day 1 of next month.
  const next = end.getDate() > 28 ? t('el día 1 del mes que viene') : dayWords(end)
  return { when, next }
}

/** «1 de noviembre»: when the next PreguntICA opens after days 29-31. */
function openingDayWords(weekStart: string | undefined): string {
  const start = weekStart ? parseDateOnly(weekStart) : null
  return start ? start.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' }) : t('el día 1')
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
  studyLevel,
  cards,
  setCards,
  onWordAdded,
}: PregunticaViewProps) {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const { total: headerCoins } = useFichas(authUser?.id)
  const [status, setStatus] = useState<PregunticaWeekStatus | null>(null)
  const [tokenSummary, setTokenSummary] = useState<PregunticaTokenSummary | null>(null)
  const [attempt, setAttempt] = useState<PregunticaAttempt | null>(null)
  const [feedback, setFeedback] = useState<PregunticaFeedback | null>(null)
  const [latestTranscript, setLatestTranscript] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PregunticaWordSuggestion[]>([])
  const [mode, setMode] = useState('mixed')
  // Tipo de palabras elegido antes de empezar (antes era un menú desplegable).
  const [pickerMode, setPickerMode] = useState('mixed')
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
  const [extractWordsModalOpen, setExtractWordsModalOpen] = useState(false)
  const [extractWordsText, setExtractWordsText] = useState('')
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const pendingLeaveRef = useRef<PendingLeaveAction>(null)
  const allowNavigationRef = useRef(false)
  const pageSectionRef = useRef<HTMLDivElement | null>(null)

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
        toast.error(error instanceof Error ? error.message : t('No se pudo cargar PreguntICA'))
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

  // Desde la página de ICA Coins (?extra=1): se abre directamente el canje.
  const extraRequestedRef = useRef(false)
  useEffect(() => {
    if (loading || extraRequestedRef.current) return
    let wantsExtra = false
    try {
      wantsExtra = new URLSearchParams(window.location.search).get('extra') === '1'
    } catch {
      wantsExtra = false
    }
    if (!wantsExtra) return
    extraRequestedRef.current = true
    if (attempt && attempt.status !== 'completed') return
    setSelectedStartMode('mixed')
    setPlusModalOpen(true)
  }, [attempt, loading])

  useEffect(() => {
    setCountdownLabel(getCountdownLabel(status))
    const timer = window.setInterval(() => {
      setCountdownLabel(getCountdownLabel(status))
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [status])

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
      level: studyLevel,
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
      toast.error(t('Todavía no puedes iniciar una nueva PreguntICA'))
      return
    }

    setWorking(true)
    try {
      await startAttemptWorkflow(selectedMode)
      setMode(selectedMode)
      toast.success(t('Intento PreguntICA iniciado'))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/PREGUNTICA_CLOSED/.test(message)) {
        toast.error(t('Del día 29 a fin de mes no hay PreguntICA. Vuelve el día 1.'))
        void refreshStatus()
      } else {
        toast.error(message || t('No se pudo crear el intento'))
      }
    } finally {
      setWorking(false)
    }
  }

  async function handleRedeemAndRetry() {
    if (!status?.weekStart) {
      toast.error(t('No se encontró la semana para canjear'))
      return
    }
    if (!selectedStartMode) {
      toast.error(t('Selecciona un tipo de palabras para continuar'))
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
      toast.success(t('Canje realizado. PreguntICA + iniciada.'))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/REDEEM_COST_MUST_BE_|WEEK_MUST_BE_COMPLETED_BEFORE_REDEEM|WEEK_NOT_FOUND/.test(message)) {
        toast.error(t('El nuevo canje ({coins}, también sin desbloquear la semana) aún no está activo en el servidor.', { coins: coinsText(PREGUNTICA_EXTRA_COST) }))
      } else if (/PREGUNTICA_CLOSED/.test(message)) {
        toast.error(t('Del día 29 a fin de mes no hay PreguntICA. Vuelve el día 1.'))
        void refreshStatus()
      } else if (/WEEK_NOT_CURRENT/.test(message)) {
        toast.error(t('La semana acaba de cambiar. Vuelve a intentarlo.'))
        void refreshStatus()
      } else if (/INSUFFICIENT_TOKENS/.test(message)) {
        toast.error(t('Necesitas {coins} para una PreguntICA extra.', { coins: coinsText(PREGUNTICA_EXTRA_COST) }))
      } else {
        toast.error(message || t('No se pudo canjear'))
      }
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
      toast.error(t('Tu dispositivo no soporta grabación de audio'))
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
      toast.error(t('No se pudo iniciar la grabación'))
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
      toast.error(t('Primero debes grabar tu respuesta'))
      return
    }
    if (!analysisReady) {
      toast.error(t('Graba un nuevo audio para volver a analizar'))
      return
    }
    if (analysisAttemptsUsed >= MAX_ANALYSIS_ATTEMPTS) {
      toast.error(t('Ya usaste los 3 análisis disponibles'))
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
        level: studyLevel,
        icaWords,
      })

      if (!processed.ok) {
        if (processed.error === 'ANALYSIS_LIMIT_REACHED') {
          setAnalysisAttemptsUsed(processed.retriesUsed || MAX_ANALYSIS_ATTEMPTS)
          setAnalysisReady(false)
          toast.error(t('Ya usaste los 3 análisis disponibles'))
          return
        }

        if (processed.error === 'EMPTY_TRANSCRIPTION') {
          setAnalysisReady(false)
          toast.error(t('No se detectó voz en el audio. Vuelve a grabar y prueba de nuevo.'))
          return
        }

        if (processed.error === 'INVALID_RESPONSE_LENGTH') {
          setAnalysisReady(false)
          toast.error(
            t('Tu respuesta debe tener entre {min} y {max} caracteres.', { min: processed.min || minCharactersRequired, max: processed.max || 1200 }),
          )
          return
        }

        toast.error(t('No se pudo analizar la respuesta. Graba de nuevo e inténtalo otra vez.'))
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
      toast.success(t('Análisis completado'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('No se pudo analizar la respuesta'))
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
        level: studyLevel,
        icaWords,
        currentSuggestions: suggestions.map((item) => item.word),
      })

      if (!result.ok) {
        toast.error(t('Ya usaste todos los refresh de sugerencias'))
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
      toast.error(error instanceof Error ? error.message : t('No se pudo refrescar sugerencias'))
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
      toast.success(t('PreguntICA completada esta semana'))
      navigate(DASHBOARD_ROUTES.gamesIca)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('No se pudo cerrar el intento'))
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <GamePage>
        <div className='flex items-center gap-3'>
          <IconTile tone='c' size={52}>
            <MicGlyph size={32} />
          </IconTile>
          <p className='m-0 text-sm font-bold text-muted-foreground'>{t('Cargando PreguntICA...')}</p>
        </div>
        <div className='h-44 animate-pulse rounded-3xl bg-muted/70' aria-hidden='true' />
        <div className='h-20 animate-pulse rounded-3xl bg-muted/50' aria-hidden='true' />
      </GamePage>
    )
  }

  const locked = !status?.isUnlocked
  const hasCompletedWeek = Boolean(status?.completedAt)
  const hasActiveAttempt = Boolean(attempt && attempt.status !== 'completed')
  const activeAttempt = hasActiveAttempt ? attempt : null
  const canStartAttempt = Boolean(status?.canStart)
  const tokenBalance = tokenSummary?.balance ?? 0
  // PreguntICA extra ya pagada pero sin empezar (p. ej. se cortó la conexión justo después
  // de pagar): se ofrece empezarla, nunca volver a pagarla.
  const paidAttemptPending = canStartAttempt && (locked || hasCompletedWeek)
  // Arriba se ven también las ICA Coins «de vista previa» (cofre, rachas, desafíos…), que de
  // momento solo existen en este dispositivo y aún no se pueden canjear aquí.
  const previewOnlyCoins = Math.max(0, (headerCoins ?? 0) - Math.max(0, Math.floor(tokenBalance + 1e-9)))
  const hasRedeemableTokens = tokenBalance >= PREGUNTICA_EXTRA_COST
  const showAttemptSteps = hasActiveAttempt
  const ctaDisabled =
    working || hasActiveAttempt || locked || (!hasCompletedWeek && !canStartAttempt)
  const transcriptForFeedback = latestTranscript || activeAttempt?.transcriptText || ''
  const currentStepMode = activeAttempt?.wordMode || mode
  const currentStepModeLabel =
    t(WORD_MODE_OPTIONS.find((option) => option.key === currentStepMode)?.label || 'Aleatorio')
  const step2Enabled = Boolean(activeAttempt)
  const step2Completed = step2Enabled && questionWasPlayed
  const step3Enabled = Boolean(activeAttempt) && questionWasPlayed
  const step3Completed = Boolean(recordedBlob)
  const step4Enabled = Boolean(recordedBlob || feedback)
  const step4Completed = Boolean(feedback)
  const isPlusAttempt = activeAttempt?.attemptKind === 'token_unlock'
  const analysisAttemptsLeft = Math.max(0, MAX_ANALYSIS_ATTEMPTS - analysisAttemptsUsed)
  const minCharactersRequired = getMinCharactersByLevel(studyLevel)
  const canAnalyzeCurrentAudio =
    analysisReady && analysisAttemptsLeft > 0 && !working
  const questionRevealReady = step2Enabled && questionWasPlayed && !questionVisible
  const translationRevealReady =
    step2Enabled && questionVisible && Boolean(questionTranslation) && !translationVisible

  const questionRevealLabel = !step2Enabled
    ? t('Inicia una PreguntICA')
    : !questionWasPlayed
      ? t('Escúchala primero para poder leerla')
      : questionVisible
        ? ''
        : t('Toca aquí para mostrar la pregunta')

  const translationRevealLabel = !step2Enabled
    ? t('Inicia una PreguntICA')
    : !questionVisible
      ? t('Se desbloquea tras mostrar la pregunta')
      : !questionTranslation
        ? t('Sin traducción')
        : translationVisible
          ? ''
          : t('Toca aquí para mostrar la traducción')

  const icaUsage = icaWords.map((word) => ({
    word,
    used: textIncludesWord(transcriptForFeedback, word),
  }))

  const existingCardWords = new Set(cards.map((card) => normalizeComparableText(card.target)))
  const addedSuggestionSet = new Set(addedSuggestionWords.map(normalizeComparableText))

  // Datos del bloque protagonista (estado de la semana).
  const activationCount = status?.activationWordsCount || 0
  const requiredWords = status?.requiredActivationWords || 20
  const stepsDone = [step2Completed, step3Completed, step4Completed].filter(Boolean).length
  const currentStepNumber = Math.min(3, stepsDone + 1)
  const suggestionRefreshesLeft = Math.max(0, 3 - (activeAttempt?.suggestionsRefreshCount || 0))

  function isSuggestionAdded(word: string): boolean {
    const key = normalizeComparableText(word)
    return existingCardWords.has(key) || addedSuggestionSet.has(key)
  }

  function isExtractWordAdded(word: string): boolean {
    return existingCardWords.has(normalizeComparableText(word))
  }

  function handleOpenSuggestionModal(suggestion: PregunticaWordSuggestion) {
    if (isSuggestionAdded(suggestion.word)) return
    setSelectedSuggestion(suggestion)
    setSuggestionModalOpen(true)
  }

  function handleOpenExtractWordsModal(text: string) {
    if (!text.trim() || isExtractWordAdded(text)) return
    setExtractWordsText(text)
    setExtractWordsModalOpen(true)
  }

  function handleStartMenuSelect(nextMode: string) {
    if (hasCompletedWeek && !paidAttemptPending) {
      setSelectedStartMode(nextMode)
      setPlusModalOpen(true)
      return
    }

    void handleStartAttempt(nextMode)
  }

  function handleOpenHistory() {
    if (!shouldGuardLeave) {
      navigate(DASHBOARD_ROUTES.pregunticaHistory)
      return
    }
    pendingLeaveRef.current = { kind: 'path', to: DASHBOARD_ROUTES.pregunticaHistory }
    setLeaveDialogOpen(true)
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
      toast.success(t('PreguntICA finalizada antes de salir'))
      allowNavigationRef.current = true
      if (pendingLeave.kind === 'back') {
        window.history.back()
        return
      }
      navigate(pendingLeave.to)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('No se pudo finalizar la PreguntICA'))
    } finally {
      setWorking(false)
    }
  }

  const weekCountdown = (state: 'locked' | 'open' | 'active') =>
    !hasCompletedWeek ? (
      <WeekCountdown label={countdownLabel} weekEnd={status?.weekEnd} state={state} requiredWords={requiredWords} />
    ) : null

  return (
    <div ref={pageSectionRef} className='flex flex-1 flex-col'>
      <style>{`@keyframes preguntica-wave-mid { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1.6); } } @keyframes preguntica-step-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } @keyframes preguntica-feedback-in { from { opacity: 0; transform: translateY(10px) scale(0.995); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <GamePage>
        <PageTitle
          icon={
            <IconTile tone='c' size={52}>
              <MicGlyph size={32} />
            </IconTile>
          }
          subtitle={t('Tu reto semanal de expresión')}
          right={
            <Button type='button' variant='outline' onClick={handleOpenHistory} aria-label={t('Ver historial completo')}>
              <HistoryIcon className='size-4.5' strokeWidth={2.6} aria-hidden='true' />
              {t('Historial')}
            </Button>
          }
        >
          PreguntICA
        </PageTitle>

        {/* Estado de la semana: el bloque protagonista */}
        {hasActiveAttempt ? (
          <HeroBlock
            tone='c'
            icon={<HeroMic state='active' />}
            eyebrow={isPlusAttempt ? 'PreguntICA +' : t('Reto de esta semana')}
            title={t('En curso')}
            text={t('Paso {n} de 3 · Modo {mode}', { n: currentStepNumber, mode: currentStepModeLabel })}
          >
            <GameProgress value={stepsDone / 3} color='var(--ica-c)' label={t('Progreso de la PreguntICA')} />
            {locked ? (
              <p className='m-0 mt-3 text-xs font-bold text-muted-foreground'>
                {t('Progreso de desbloqueo: {count}/{required} palabras activadas.', { count: activationCount, required: requiredWords })}
              </p>
            ) : null}
            {weekCountdown('active')}
            <div className='mt-1 flex flex-wrap items-center justify-end gap-2'>
              <button
                type='button'
                onClick={() => setInfoModalOpen(true)}
                className='mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-border bg-card px-3 text-sm font-extrabold transition-transform active:translate-y-[2px]'
                style={{ color: 'var(--ica-c-ink)', boxShadow: '0 2px 0 var(--border)' }}
              >
                <CircleHelpIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
                {t('Ver guía')}
              </button>
            </div>
          </HeroBlock>
        ) : status?.isClosed ? (
          // Days 29-31: no PreguntICA until day 1 (the month's ranking has closed; Luis, 9 Oct).
          <HeroBlock
            tone='c'
            icon={<HeroMic state='locked' />}
            eyebrow={t('Reto de esta semana')}
            title={t('Vuelve el {date}', { date: openingDayWords(status.weekStart) })}
            text={t('Hay una PreguntICA en cada semana del mes: del 1 al 7, del 8 al 14, del 15 al 21 y del 22 al 28. Del 29 a fin de mes descansa, porque el ranking del mes ya ha cerrado.')}
          />
        ) : hasCompletedWeek ? (
          <>
            <HeroBlock
              tone='ok'
              icon={<HeroMic state='done' />}
              eyebrow={t('Reto de esta semana')}
              title={t('¡Respondida!')}
              text={t('Reto completado. Tu intento quedó guardado en el historial.')}
            >
              <Button type='button' variant='outline' size='lg' className='w-full' onClick={handleOpenHistory}>
                {t('Ver mi respuesta')}
              </Button>
            </HeroBlock>
            {paidAttemptPending ? (
              <PaidAttemptRow disabled={working || hasActiveAttempt} onStart={() => void handleStartAttempt(pickerMode)} />
            ) : (
              <OfferRow
                title={t('Iniciar PreguntICA +')}
                text={t('Canjea {coins} y responde otra pregunta esta semana.', { coins: coinsText(PREGUNTICA_EXTRA_COST) })}
                action={
                  <CoinPriceButton
                    cost={PREGUNTICA_EXTRA_COST}
                    onClick={() => handleStartMenuSelect(pickerMode)}
                    disabled={ctaDisabled}
                    ariaLabel={t('Iniciar PreguntICA + por {coins}', { coins: coinsText(PREGUNTICA_EXTRA_COST) })}
                  />
                }
              />
            )}
          </>
        ) : locked ? (
          <>
            <HeroBlock
              tone='c'
              icon={<HeroMic state='locked' />}
              eyebrow={t('Reto de esta semana')}
              title={t('Bloqueada')}
              text={t('Activa {n} palabras esta semana para desbloquearla.', { n: requiredWords })}
            >
              <div className='flex items-end justify-between gap-3'>
                <p className='m-0 leading-none'>
                  <span className='text-4xl font-black tabular-nums' style={{ color: 'var(--ica-c-ink)' }}>
                    {activationCount}
                  </span>
                  <span className='text-lg font-extrabold text-muted-foreground tabular-nums'> / {requiredWords}</span>
                </p>
                <p className='m-0 text-sm font-extrabold' style={{ color: 'var(--ica-c-ink)' }}>
                  {t('palabras activadas')}
                </p>
              </div>
              <GameProgress
                value={activationCount / Math.max(1, requiredWords)}
                color='var(--ica-c)'
                className='mt-2.5'
                label={t('Progreso de desbloqueo')}
              />
              {weekCountdown('locked')}
            </HeroBlock>
            {paidAttemptPending ? (
              <PaidAttemptRow disabled={working} onStart={() => void handleStartAttempt('mixed')} />
            ) : (
              <OfferRow
                title={t('¿No quieres esperar?')}
                text={t('Juégala ya: una PreguntICA extra aunque no hayas activado las {n} palabras.', { n: requiredWords })}
                action={
                  <CoinPriceButton
                    cost={PREGUNTICA_EXTRA_COST}
                    onClick={() => {
                      setSelectedStartMode('mixed')
                      setPlusModalOpen(true)
                    }}
                    ariaLabel={t('Jugarla ya por {coins}', { coins: coinsText(PREGUNTICA_EXTRA_COST) })}
                  />
                }
              />
            )}
          </>
        ) : (
          <HeroBlock
            tone='c'
            icon={<HeroMic state='open' />}
            eyebrow={t('Reto de esta semana')}
            title={t('¡Desbloqueada!')}
            text={
              canStartAttempt
                ? t('Elige el tipo de palabras y responde la pregunta con tu voz.')
                : t('Todavía no puedes iniciar una nueva PreguntICA.')
            }
          >
            <p className='ica-label m-0 mb-2'>{t('Tipo de palabras')}</p>
            <ModePicker value={pickerMode} onChange={setPickerMode} disabled={ctaDisabled} />
            <Button
              type='button'
              size='xl'
              variant='c'
              className='mt-4 w-full'
              disabled={ctaDisabled}
              onClick={() => handleStartMenuSelect(pickerMode)}
            >
              <MicIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
              {t('Iniciar PreguntICA')}
            </Button>
            {weekCountdown('open')}
          </HeroBlock>
        )}

        {showAttemptSteps && (
          <div className='flex flex-col gap-4' style={{ animation: 'preguntica-step-in 0.55s ease' }}>
            {/* Paso 1: escuchar y descubrir la pregunta */}
            <StepPanel
              n={1}
              title={t('Escucha y descubre la pregunta')}
              enabled={step2Enabled}
              done={step2Completed}
              status={step2Completed ? t('✓ Completado') : questionVisible ? t('Pregunta revelada') : t('Pendiente de escucha')}
            >
              <p className='m-0 text-sm font-semibold text-muted-foreground'>
                {t('Primero entrena el oído: la pregunta se muestra escrita después de escucharla al menos una vez.')}
              </p>
              {!step2Enabled && (
                <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>{t('Inicia una PreguntICA para habilitar este paso.')}</p>
              )}

              <ListenButton
                text={questionText}
                langName={config.targetLang}
                disabled={!step2Enabled || !questionText || working}
                onPlayingChange={(isPlaying) => {
                  if (isPlaying) {
                    setQuestionWasPlayed(true)
                    return
                  }
                  setListenCount((current) => current + 1)
                }}
              />
              <p className='m-0 mt-2 text-xs font-bold text-muted-foreground'>
                {listenCount > 0
                  ? tn(listenCount, 'Escuchada {n} vez.', 'Escuchada {n} veces.')
                  : t('Aún no has escuchado la pregunta.')}
              </p>

              {/* La pregunta, en grande y borrosa hasta que la muestras */}
              <button
                type='button'
                onClick={() => {
                  if (!step2Enabled || !questionWasPlayed || questionVisible) return
                  setQuestionVisible(true)
                }}
                disabled={!step2Enabled || !questionWasPlayed || questionVisible}
                className={cn(
                  'mt-4 block w-full rounded-3xl border-2 px-4 py-4 text-left transition-all duration-500 disabled:cursor-default lg:px-5',
                  questionVisible ? 'border-border bg-card dark:bg-muted/30' : 'border-dashed',
                )}
                style={
                  questionRevealReady
                    ? { borderColor: 'var(--ica-c)', background: 'var(--ica-c-soft)' }
                    : questionVisible
                      ? undefined
                      : { borderColor: 'var(--border-strong)' }
                }
              >
                <span className='ica-label block'>{t('Pregunta')} · {langName(config.targetLang)}</span>
                <span className='relative mt-2 block min-h-16'>
                  <span
                    className={cn(
                      'block font-display text-2xl leading-snug font-extrabold tracking-tight transition-all duration-500 lg:text-[1.75rem]',
                      questionVisible ? 'opacity-100 blur-0' : 'opacity-60 blur-md select-none',
                    )}
                  >
                    {questionText || t('Pregunta pendiente de generar')}
                  </span>
                  {!questionVisible && questionRevealLabel && (
                    <span className='absolute inset-0 flex items-center justify-center'>
                      <RevealChip label={questionRevealLabel} ready={questionRevealReady} />
                    </span>
                  )}
                </span>
              </button>

              <button
                type='button'
                onClick={() => {
                  if (!step2Enabled || !questionVisible || !questionTranslation || translationVisible) return
                  setTranslationVisible(true)
                }}
                disabled={!step2Enabled || !questionVisible || !questionTranslation || translationVisible}
                className={cn(
                  'mt-2 block w-full rounded-2xl border-2 px-4 py-3 text-left transition-all duration-500 disabled:cursor-default',
                  translationVisible ? 'border-border bg-muted/40' : 'border-dashed',
                )}
                style={
                  translationRevealReady
                    ? { borderColor: 'var(--ica-c)', background: 'var(--ica-c-soft)' }
                    : translationVisible
                      ? undefined
                      : { borderColor: 'var(--border-strong)' }
                }
              >
                <span className='ica-label block'>{t('Traducción (español)')}</span>
                <span className='relative mt-1 block min-h-9'>
                  <span
                    className={cn(
                      'block text-base leading-snug font-bold text-foreground/80 transition-all duration-500',
                      questionVisible && translationVisible && questionTranslation ? 'opacity-100 blur-0' : 'opacity-60 blur-sm select-none',
                    )}
                  >
                    {questionTranslation || t('Traducción no disponible')}
                  </span>
                  {!translationVisible && translationRevealLabel && (
                    <span className='absolute inset-0 flex items-center justify-center'>
                      <RevealChip label={translationRevealLabel} ready={translationRevealReady} small />
                    </span>
                  )}
                </span>
              </button>

              {/* Palabras ICA que tienes que usar */}
              <div className='mt-5'>
                <div className='mb-2 flex flex-wrap items-center gap-2'>
                  <p className='ica-label m-0'>{t('Palabras ICA objetivo')}</p>
                  <ModePill mode={currentStepMode} prefix={t('Modo:')} />
                </div>
                {questionWasPlayed ? (
                  <div className='flex flex-wrap items-center gap-2'>
                    {icaWords.map((word) => {
                      const translation = wordTranslationMap.get(normalizeComparableText(word))
                      return (
                        <span
                          key={word}
                          className='inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-extrabold'
                          style={{
                            background: 'var(--ica-i-soft)',
                            color: 'var(--ica-i-ink)',
                            borderColor: 'color-mix(in oklab, var(--ica-i) 35%, transparent)',
                          }}
                        >
                          {word}
                          {showIcaWordTranslations && translation ? (
                            <span className='font-semibold text-muted-foreground'>· {translation}</span>
                          ) : null}
                        </span>
                      )
                    })}
                    <button
                      type='button'
                      onClick={() => setShowIcaWordTranslations((current) => !current)}
                      className='inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-extrabold text-muted-foreground transition-colors hover:bg-muted'
                    >
                      {showIcaWordTranslations ? (
                        <EyeOffIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
                      ) : (
                        <EyeIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
                      )}
                      {showIcaWordTranslations ? t('Ocultar traducción') : t('Ver traducción')}
                    </button>
                  </div>
                ) : (
                  <p className='m-0 text-xs font-semibold text-muted-foreground'>
                    {t('Se desbloquean tras escuchar la pregunta al menos una vez.')}
                  </p>
                )}
              </div>
            </StepPanel>

            {/* Paso 2: grabar la respuesta */}
            <StepPanel
              n={2}
              title={t('Graba tu respuesta')}
              enabled={step3Enabled}
              done={step3Completed}
              status={step3Completed ? t('✓ Completado') : recordedBlob ? t('Listo para analizar') : t('Sin grabación')}
            >
              {!step3Enabled && (
                <p className='m-0 mb-3 text-xs font-semibold text-muted-foreground'>
                  {t('Escucha la pregunta al menos una vez para habilitar este paso.')}
                </p>
              )}
              <div className='flex flex-col items-center gap-4 rounded-3xl bg-muted/50 px-4 pt-5 pb-4'>
                <RecordButton
                  recording={isRecording}
                  hasRecording={Boolean(recordedBlob)}
                  disabled={!step3Enabled || working}
                  onStart={handleStartRecording}
                  onStop={handleStopRecording}
                />
                <div className='flex w-full items-center gap-3'>
                  <div className='flex h-10 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden' aria-hidden='true'>
                    {Array.from({ length: LIVE_BARS_COUNT }, (_, index) => {
                      const delay = index % 3 === 0 ? 0.15 : index % 3 === 1 ? 0.3 : 0
                      return (
                        <span
                          key={`bar-${index}`}
                          className='w-1 shrink-0 rounded-full'
                          style={{
                            height: '20px',
                            background: isRecording ? 'var(--ica-a)' : 'var(--border-strong)',
                            transformOrigin: 'center',
                            transform: isRecording ? undefined : 'scaleY(0.35)',
                            animation: isRecording ? `preguntica-wave-mid 1s ease-in-out ${delay}s infinite` : undefined,
                          }}
                        />
                      )
                    })}
                  </div>
                  <span className='min-w-16 text-right text-2xl font-black tabular-nums'>
                    {((isRecording ? recordingElapsedMs : recordedDurationMs) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>

              {recordedUrl && (
                <div className='mt-3 rounded-2xl border-2 border-border px-3 py-3'>
                  <p className='ica-label m-0 mb-2'>{t('Tu grabación')}</p>
                  <audio controls src={recordedUrl} className='w-full' />
                  <p className='m-0 mt-1 text-xs font-bold text-muted-foreground'>
                    {t('Duración: {seconds}s', { seconds: (recordedDurationMs / 1000).toFixed(1) })}
                  </p>
                </div>
              )}

              <div className='mt-3 flex flex-col gap-1.5'>
                <p className='m-0 text-xs font-semibold text-muted-foreground'>
                  {t('Cuando termines de grabar, pasa al paso 3 para analizar tu respuesta.')}
                </p>
                <p className='m-0 text-xs font-extrabold' style={{ color: 'var(--ica-i-ink)' }}>
                  {t('Mínimo requerido según tu nivel ({level}): {n} caracteres.', { level: studyLevel, n: minCharactersRequired })}
                </p>
              </div>
            </StepPanel>

            {/* Paso 3: el feedback */}
            <StepPanel
              n={3}
              title={t('Tu feedback')}
              enabled={step4Enabled}
              done={step4Completed}
              status={step4Completed ? t('✓ Completado') : isAnalyzing ? t('Analizando...') : t('Pendiente')}
              style={{ animation: step4JustEnabled ? 'preguntica-step-in 0.45s ease' : undefined }}
            >
              <div className='flex items-center justify-between gap-3'>
                <span className='text-sm font-extrabold'>{t('Análisis usados')}</span>
                <span className='flex items-center gap-2'>
                  <span className='flex gap-1' aria-hidden='true'>
                    {Array.from({ length: MAX_ANALYSIS_ATTEMPTS }, (_, index) => (
                      <span
                        key={`analysis-${index}`}
                        className='h-2.5 w-6 rounded-full'
                        style={{ background: index < analysisAttemptsUsed ? 'var(--ica-c)' : 'var(--muted)' }}
                      />
                    ))}
                  </span>
                  <span className='text-sm font-extrabold text-muted-foreground tabular-nums'>
                    {analysisAttemptsUsed}/{MAX_ANALYSIS_ATTEMPTS}
                  </span>
                </span>
              </div>

              <Button
                type='button'
                size='xl'
                variant={feedback ? 'outline' : 'c'}
                onClick={handleAnalyze}
                disabled={!canAnalyzeCurrentAudio}
                className='mt-3 w-full'
              >
                {isAnalyzing ? (
                  <span className='inline-flex items-center gap-2'>
                    <span className='size-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                    {t('Analizando...')}
                  </span>
                ) : feedback ? (
                  t('Volver a analizar')
                ) : (
                  <>
                    <SparklesIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
                    {t('Analizar respuesta')}
                  </>
                )}
              </Button>

              {analysisAttemptsLeft <= 0 ? (
                <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
                  {t('Ya usaste los 3 análisis máximos para esta PreguntICA.')}
                </p>
              ) : feedback && !analysisReady ? (
                <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
                  {t('Para volver a analizar, graba un nuevo audio en el paso 2.')}
                </p>
              ) : analysisReady ? (
                <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
                  {t('Audio listo. Puedes analizar esta respuesta ahora.')}
                </p>
              ) : null}

              {!feedback ? (
                <p className='m-0 mt-4 rounded-2xl border-2 border-dashed border-border px-4 py-5 text-center text-sm font-semibold text-muted-foreground'>
                  {t('Aquí aparecerán la naturalidad, la transcripción, correcciones y sugerencias ICA una vez analizada tu respuesta.')}
                </p>
              ) : (
                <div
                  className='mt-5 flex flex-col gap-5'
                  style={{ animation: 'preguntica-feedback-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
                >
                  <ScoreHero score={feedback.score} text={feedback.naturalness} />

                  {(latestTranscript || activeAttempt?.transcriptText) && (
                    <TranscriptBlock text={latestTranscript || activeAttempt?.transcriptText || ''} />
                  )}

                  <WordUsage usage={icaUsage} />

                  <CorrectionList
                    corrections={feedback.corrections}
                    isSame={isSameCorrection}
                    onExtract={handleOpenExtractWordsModal}
                    isExtractAdded={isExtractWordAdded}
                  />

                  <CoachBubble text={feedback.coachReply} />

                  <div>
                    <SectionLabel
                      right={
                        <button
                          type='button'
                          onClick={handleRefreshSuggestions}
                          disabled={!activeAttempt || working || (activeAttempt.suggestionsRefreshCount || 0) >= 3}
                          aria-label={t('Actualizar sugerencias ({n})', { n: suggestionRefreshesLeft })}
                          className='inline-flex h-8 items-center gap-1.5 rounded-xl border-2 border-border px-2.5 text-xs font-extrabold transition-transform active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50'
                        >
                          <RefreshCwIcon className='size-3.5' strokeWidth={2.6} aria-hidden='true' />
                          {t('Actualizar ({n})', { n: suggestionRefreshesLeft })}
                        </button>
                      }
                    >
                      {t('Sugerencias ICA')}
                    </SectionLabel>
                    <p className='m-0 mb-2.5 text-xs font-semibold text-muted-foreground'>{t('Toca una para añadirla al Baúl ICA.')}</p>
                    <SuggestionChips suggestions={suggestions} isAdded={isSuggestionAdded} onPick={handleOpenSuggestionModal} />
                  </div>

                  <Button
                    type='button'
                    size='xl'
                    variant='success'
                    onClick={handleCompleteAttempt}
                    disabled={!activeAttempt || working}
                    className='w-full'
                  >
                    {isPlusAttempt ? t('Finalizar PreguntICA +') : t('Finalizar PreguntICA semanal')}
                  </Button>
                </div>
              )}
            </StepPanel>
          </div>
        )}
      </GamePage>

      <Dialog
        open={plusModalOpen}
        onOpenChange={(open) => {
          setPlusModalOpen(open)
          if (!open) setSelectedStartMode(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className='flex items-center gap-3'>
              <IconTile tone='c' size={48}>
                <MicGlyph size={30} />
              </IconTile>
              <DialogTitle>{t('PreguntICA extra')}</DialogTitle>
            </div>
            <DialogDescription>
              {t('Canjea {coins} para jugar una PreguntICA más esta semana, aunque no hayas activado las {n} palabras.', {
                coins: coinsText(PREGUNTICA_EXTRA_COST),
                n: status?.requiredActivationWords || 20,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className='flex items-center gap-3 rounded-3xl px-4 py-3' style={{ background: 'var(--ica-gold-soft)' }}>
            <FichaIcon size={44} />
            <div className='min-w-0 flex-1'>
              <p className='m-0 text-3xl leading-none font-black tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
                {Math.max(0, Math.floor(tokenBalance + 1e-9))}
              </p>
              <p className='m-0 mt-1 text-xs font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
                {t('ICA Coins para canjear')}
              </p>
              <p className='m-0 text-xs font-semibold text-muted-foreground'>
                {hasRedeemableTokens
                  ? t('Tienes suficientes para canjear ahora.')
                  : t('Necesitas {coins}.', { coins: coinsText(PREGUNTICA_EXTRA_COST) })}
              </p>
            </div>
          </div>
          {previewOnlyCoins > 0 ? (
            <p className='-mt-2 m-0 text-xs font-semibold text-muted-foreground'>
              {t('Arriba ves {total}: {n} son del cofre, las rachas y los desafíos, y todavía no se pueden canjear en PreguntICA.', {
                total: headerCoins ?? 0,
                n: previewOnlyCoins,
              })}
            </p>
          ) : null}

          <div>
            <p className='ica-label m-0 mb-2'>{t('Tipo de palabras')}</p>
            <ModePicker value={selectedStartMode} onChange={setSelectedStartMode} />
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              size='lg'
              onClick={() => setPlusModalOpen(false)}
              disabled={working}
            >
              {t('Cancelar')}
            </Button>
            <Button
              type='button'
              variant='gold'
              size='lg'
              onClick={() => void handleRedeemAndRetry()}
              disabled={working || hasActiveAttempt || !hasRedeemableTokens || !selectedStartMode}
            >
              {/* size-6: si no, el botón la encoge a 16 px */}
              <FichaIcon size={24} className='size-6' />
              {t('Canjear {n}', { n: PREGUNTICA_EXTRA_COST })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={infoModalOpen} onOpenChange={setInfoModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className='flex items-center gap-3'>
              <IconTile tone='c' size={48}>
                <MicGlyph size={30} />
              </IconTile>
              <DialogTitle>{t('Guía rápida de PreguntICA')}</DialogTitle>
            </div>
            <DialogDescription>
              {t('Este reto tiene un flujo concreto para aprovechar mejor tu práctica.')}
            </DialogDescription>
          </DialogHeader>

          <ol className='m-0 flex list-none flex-col gap-3 p-0 text-sm font-semibold text-foreground/90'>
            <li className='flex items-start gap-3'>
              <StepBadge n={1} active />
              <p className='m-0 pt-1.5'>
                <strong>{t('Escucha')}</strong> {t('la pregunta, luego')} <strong>{t('muéstrala')}</strong>{' '}
                {t('y, si quieres, activa también su traducción.')}
              </p>
            </li>
            <li className='flex items-start gap-3'>
              <StepBadge n={2} active />
              <p className='m-0 pt-1.5'>
                {t('Graba tu respuesta usando las')} <strong>{t('palabras ICA objetivo')}</strong> {t('de este intento.')}
              </p>
            </li>
            <li className='flex items-start gap-3'>
              <StepBadge n={3} active />
              <p className='m-0 pt-1.5'>
                {t('Tu audio debe tener al menos')}{' '}
                <strong>{t('{n} caracteres', { n: minCharactersRequired })}</strong>{' '}
                {t('para analizarse en tu nivel ({level}).', { level: studyLevel })}
              </p>
            </li>
            <li className='flex items-start gap-3'>
              <StepBadge n={4} active />
              <p className='m-0 pt-1.5'>
                {t('Tienes')} <strong>{t('3 intentos de análisis')}</strong>{' '}
                {t('por PreguntICA. Si quieres reanalizar, primero graba un audio nuevo.')}
              </p>
            </li>
          </ol>

          <DialogFooter>
            <Button type='button' variant='c' size='lg' onClick={() => setInfoModalOpen(false)}>
              {t('Entendido')}
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
            <DialogTitle>{t('¿Salir de PreguntICA?')}</DialogTitle>
            <DialogDescription>
              {t('Si sales ahora, finalizaremos esta PreguntICA para guardar tu progreso.')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type='button' variant='outline' size='lg' onClick={handleCancelLeave} disabled={working}>
              {t('Quedarme')}
            </Button>
            <Button type='button' variant='c' size='lg' onClick={() => void handleConfirmLeave()} disabled={working}>
              {t('Finalizar y salir')}
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

      <ExtractWordsToVaultModal
        open={extractWordsModalOpen}
        onOpenChange={(open) => {
          setExtractWordsModalOpen(open)
          if (!open) setExtractWordsText('')
        }}
        text={extractWordsText}
        seedWords={extractWordsText ? [extractWordsText] : []}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />
    </div>
  )
}

/** Icono grande del bloque protagonista: el micro con su estado (candado, ✓...). */
function HeroMic({ state }: { state: 'locked' | 'open' | 'done' | 'active' }) {
  const edge = state === 'done' ? 'var(--ica-ok)' : 'var(--ica-c)'
  return (
    <span
      className='relative flex size-16 items-center justify-center rounded-2xl bg-card'
      style={{ boxShadow: `0 4px 0 color-mix(in oklab, ${edge} 32%, transparent)` }}
    >
      <MicGlyph size={40} />
      {state === 'locked' || state === 'done' ? (
        <span
          className='absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full border-2 text-white'
          style={{
            background: state === 'done' ? 'var(--ica-ok)' : 'var(--muted-foreground)',
            borderColor: 'var(--card)',
          }}
        >
          {state === 'done' ? (
            <CheckIcon className='size-4' strokeWidth={3.2} aria-hidden='true' />
          ) : (
            <LockIcon className='size-3.5' strokeWidth={2.8} aria-hidden='true' />
          )}
        </span>
      ) : null}
    </span>
  )
}

/**
 * How long this week's PreguntICA is still valid, and what that means for you right now
 * (Luis, 5 Oct): people saw «la semana termina en 3 d» and didn't know why or if they could play.
 */
function WeekCountdown({
  label,
  weekEnd,
  state,
  requiredWords,
}: {
  label: string
  weekEnd?: string
  state: 'locked' | 'open' | 'active'
  requiredWords: number
}) {
  if (!label || label === '-') return null
  const words = weekLastDayWords(weekEnd)
  const deadline = words ? t('Tienes hasta {when} a las 23:59', { when: words.when }) : t('Tiempo para esta semana')
  const next = words?.next ?? ''
  const explanation =
    state === 'locked'
      ? t('Si llegas a {n} palabras antes, podrás responderla. Otra semana empieza {next}: llega una pregunta nueva y el contador vuelve a 0.', { n: requiredWords, next })
      : state === 'open'
        ? t('Ya puedes responderla. Si no lo haces antes de esa hora, la de esta semana se pierde y {next} llega una nueva.', { next })
        : t('Termínala antes de esa hora para que cuente como la PreguntICA de esta semana.')
  return (
    <div className='mt-3 rounded-2xl bg-muted/60 px-3.5 py-3 text-left'>
      <p className='m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-extrabold'>
        <TimerIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' style={{ color: 'var(--ica-c-ink)' }} />
        <span>{deadline}</span>
        <span className='font-bold text-muted-foreground tabular-nums'>{t('(quedan {time})', { time: label })}</span>
      </p>
      <p className='m-0 mt-1 text-xs leading-snug font-semibold text-muted-foreground'>{explanation}</p>
    </div>
  )
}

/** Fila de oferta con ICA Coins (como las de la pantalla ICA Coins). */
function OfferRow({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className='ica-group'>
      <div className='flex items-center gap-3 py-3'>
        <IconTile tone='gold' size={48}>
          <FichaIcon size={30} />
        </IconTile>
        <div className='min-w-0 flex-1'>
          <p className='m-0 leading-tight font-extrabold'>{title}</p>
          <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>{text}</p>
        </div>
        {action}
      </div>
    </div>
  )
}

/** PreguntICA extra ya pagada y sin empezar: se empieza sin volver a pagar. */
function PaidAttemptRow({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  return (
    <OfferRow
      title={t('Tu PreguntICA extra ya está pagada')}
      text={t('Empiézala cuando quieras: no se vuelve a cobrar.')}
      action={
        <Button type='button' variant='c' onClick={onStart} disabled={disabled} className='shrink-0'>
          {t('Empezar')}
        </Button>
      }
    />
  )
}

/** Tarjeta de un paso (1, 2, 3) con su número, título y estado. */
function StepPanel({
  n,
  title,
  status,
  enabled,
  done,
  style,
  children,
}: {
  n: number
  title: string
  status: string
  enabled: boolean
  done: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  const current = enabled && !done
  return (
    <section
      aria-label={title}
      className={cn('ica-panel p-4 transition-opacity duration-500 lg:p-5', !enabled && 'opacity-55')}
      style={{
        ...(current ? { borderColor: 'color-mix(in oklab, var(--ica-c) 45%, var(--border))' } : {}),
        ...style,
      }}
    >
      <header className='mb-3 flex items-center gap-3'>
        <StepBadge n={n} done={done} active={current} />
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1'>
          <h2 className='m-0 font-display text-lg leading-tight font-extrabold tracking-tight'>{title}</h2>
          <Pill tone={done ? 'ok' : current ? 'c' : 'neutral'}>{status}</Pill>
        </div>
      </header>
      {children}
    </section>
  )
}

/** Etiqueta que flota sobre la pregunta borrosa ("Toca aquí para mostrar..."). */
function RevealChip({ label, ready, small = false }: { label: string; ready: boolean; small?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border-2 bg-card px-3 font-extrabold',
        small ? 'py-1 text-xs' : 'py-1.5 text-sm',
        ready ? 'animate-pulse' : 'text-muted-foreground',
      )}
      style={
        ready
          ? { borderColor: 'var(--ica-c)', color: 'var(--ica-c-ink)', boxShadow: '0 2px 0 var(--ica-c-edge)' }
          : { borderColor: 'var(--border)', boxShadow: '0 2px 0 var(--border)' }
      }
    >
      {ready ? <EyeIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' /> : <LockIcon className='size-3.5 shrink-0' strokeWidth={2.6} aria-hidden='true' />}
      <span className='truncate'>{label}</span>
    </span>
  )
}

const SPEAK_RATE_STORAGE_KEY = 'speak-button-rate'

function readSpeakRate(): 0.75 | 1 {
  try {
    return window.localStorage.getItem(SPEAK_RATE_STORAGE_KEY) === '0.75' ? 0.75 : 1
  } catch {
    return 1
  }
}

/** Botón grande para escuchar la pregunta, con la velocidad x1 / x0.75 (misma lógica que SpeakButton). */
function ListenButton({
  text,
  langName,
  disabled,
  onPlayingChange,
}: {
  text: string
  langName: string
  disabled?: boolean
  onPlayingChange?: (isPlaying: boolean) => void
}) {
  const [playing, setPlayingState] = useState(false)
  const [rate, setRate] = useState<0.75 | 1>(readSpeakRate)

  useEffect(() => {
    try {
      window.localStorage.setItem(SPEAK_RATE_STORAGE_KEY, String(rate))
    } catch {
      // sin almacenamiento: se queda en memoria
    }
  }, [rate])

  const setPlaying = (next: boolean) => {
    setPlayingState(next)
    onPlayingChange?.(next)
  }

  const go = () => {
    if (playing) {
      stopTTS()
      setPlaying(false)
      return
    }
    setPlaying(true)
    speakNatural(text, langName, () => setPlaying(false), rate)
  }

  const changeRate = (nextRate: 0.75 | 1) => {
    setRate(nextRate)
    if (!playing) return
    stopTTS()
    setPlaying(true)
    speakNatural(text, langName, () => setPlaying(false), nextRate)
  }

  return (
    <div className='mt-4 flex flex-wrap items-stretch gap-2'>
      <Button type='button' size='xl' variant='c' onClick={go} disabled={disabled} className='min-w-[11rem] flex-1'>
        {playing ? (
          <SquareIcon className='size-5' fill='currentColor' aria-hidden='true' />
        ) : (
          <Volume2Icon className='size-5' strokeWidth={2.6} aria-hidden='true' />
        )}
        {playing ? t('Reproduciendo...') : t('Escuchar pregunta')}
      </Button>
      <div role='group' aria-label={t('Velocidad')} className='flex h-13 items-center gap-1 rounded-2xl border-2 border-border p-1'>
        {([1, 0.75] as const).map((option) => (
          <button
            key={option}
            type='button'
            onClick={() => changeRate(option)}
            disabled={playing || disabled}
            aria-pressed={rate === option}
            className={cn(
              'h-full rounded-xl px-3 text-sm font-extrabold tabular-nums transition-colors disabled:opacity-50',
              rate === option ? '' : 'text-muted-foreground hover:bg-muted',
            )}
            style={rate === option ? { background: 'var(--ica-c-soft)', color: 'var(--ica-c-ink)' } : undefined}
          >
            x{option}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Botón de grabar: grande, redondo y con canto; en rojo mientras grabas. */
function RecordButton({
  recording,
  hasRecording,
  disabled,
  onStart,
  onStop,
}: {
  recording: boolean
  hasRecording: boolean
  disabled: boolean
  onStart: () => void
  onStop: () => void
}) {
  const colors = recording ? tone('a') : tone('c')
  const label = recording ? t('Detener grabación') : hasRecording ? t('Volver a grabar') : t('Empezar grabación')
  return (
    <div className='flex flex-col items-center gap-2.5'>
      <span className='relative flex size-24 items-center justify-center'>
        {recording ? (
          <span className='absolute inset-0 animate-ping rounded-full opacity-25' style={{ background: colors.solid }} aria-hidden='true' />
        ) : null}
        <button
          type='button'
          onClick={recording ? onStop : onStart}
          disabled={recording ? false : disabled}
          aria-label={label}
          className='ica-press relative flex size-24 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-45'
          style={{ background: colors.solid, boxShadow: `0 6px 0 ${colors.edge}` }}
        >
          {recording ? (
            <SquareIcon className='size-9' fill='currentColor' strokeWidth={2} aria-hidden='true' />
          ) : (
            <MicIcon className='size-11' strokeWidth={2.4} aria-hidden='true' />
          )}
        </button>
      </span>
      <span className='text-base font-extrabold' style={recording ? { color: 'var(--ica-a-ink)' } : undefined}>
        {label}
      </span>
    </div>
  )
}
