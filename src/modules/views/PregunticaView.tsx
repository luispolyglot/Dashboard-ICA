import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { AppConfig, Lexicard } from '../types'
import {
  completePregunticaAttempt,
  createPregunticaAttempt,
  fetchLatestPregunticaAttempt,
  fetchPregunticaTokenSummary,
  fetchPregunticaWeekStatus,
  pickPregunticaQuestion,
  processPregunticaAttemptAudio,
  redeemPregunticaTokensForWeek,
  refreshPregunticaSuggestions,
  savePregunticaQuestionTranslation,
  savePregunticaAttemptPromptData,
  uploadPregunticaAttemptAudio,
  type PregunticaAttempt,
  type PregunticaFeedback,
  type PregunticaWeekStatus,
  type PregunticaTokenSummary,
  type PregunticaWordSuggestion,
} from '../services/preguntica'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchTranslation } from '../services/anthropic'
import { AddIcaSuggestionModal } from '../components/AddIcaSuggestionModal'
import { SpeakButton } from '../components/SpeakButton'
import { Button } from '@/components/ui/button'

type PregunticaViewProps = {
  config: AppConfig
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
}

const WORD_MODE_OPTIONS = [
  { key: 'mixed', label: 'Aleatorio' },
  { key: 'vital', label: 'Vital' },
  { key: 'frequent', label: 'Frecuente' },
  { key: 'occasional', label: 'Ocasional' },
  { key: 'rare', label: 'Raro' },
]

const WORD_MODE_TONE: Record<string, string> = {
  mixed: 'border-sky-500 text-sky-400 bg-sky-500/10',
  vital: 'border-blue-500 text-blue-400 bg-blue-500/10',
  frequent: 'border-emerald-500 text-emerald-400 bg-emerald-500/10',
  occasional: 'border-amber-500 text-amber-400 bg-amber-500/10',
  rare: 'border-orange-500 text-orange-400 bg-orange-500/10',
}

const WORD_MODE_DOT: Record<string, string> = {
  mixed: 'bg-sky-400',
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

function randomize<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function getWordsByLevel(level: string | undefined): number {
  const normalized = (level || 'A2').toUpperCase()
  if (normalized === 'A1') return 1
  if (normalized === 'A2') return 2
  if (normalized === 'B1') return 3
  if (normalized === 'B2') return 4
  return 5
}

function getModeCards(cards: Lexicard[], mode: string): Lexicard[] {
  if (mode === 'mixed') return cards
  return cards.filter((card) => card.importance === mode)
}

function pickIcaWords(cards: Lexicard[], mode: string, level: string | undefined): string[] {
  const preferred = getModeCards(cards, mode)
  const fallbackPool = preferred.length > 0 ? preferred : cards
  const count = Math.max(1, Math.min(getWordsByLevel(level), fallbackPool.length || 1))
  return randomize(fallbackPool).slice(0, count).map((card) => card.target.trim())
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

function getTodayForTimezone(timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())

    const year = Number(parts.find((part) => part.type === 'year')?.value || '0')
    const month = Number(parts.find((part) => part.type === 'month')?.value || '0')
    const day = Number(parts.find((part) => part.type === 'day')?.value || '0')
    return new Date(Date.UTC(year, month - 1, day))
  } catch {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }
}

function getWindowRemainingLabel(status: PregunticaWeekStatus | null): string {
  if (!status) return '-'
  const endDate = parseDateOnly(status.weekEnd)
  if (!endDate) return '-'

  const today = getTodayForTimezone(status.timezone || 'UTC')
  const dayDiff = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / 86400000))

  if (dayDiff <= 0) return 'La ventana cierra hoy'
  if (dayDiff === 1) return 'La ventana cierra en 1 día'
  return `La ventana cierra en ${dayDiff} días`
}

function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
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
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [questionTranslation, setQuestionTranslation] = useState<string | null>(null)
  const [icaWords, setIcaWords] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedDurationMs, setRecordedDurationMs] = useState(0)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [questionWasPlayed, setQuestionWasPlayed] = useState(false)
  const [listenCount, setListenCount] = useState(0)
  const [questionVisible, setQuestionVisible] = useState(false)
  const [translationVisible, setTranslationVisible] = useState(false)
  const [showAttemptWorkspace, setShowAttemptWorkspace] = useState(false)
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<PregunticaWordSuggestion | null>(null)
  const [addedSuggestionWords, setAddedSuggestionWords] = useState<string[]>([])

  const recorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)

  const attemptsLeft = useMemo(() => {
    const used = Number(status?.attemptsUsed || 0)
    return Math.max(0, 3 - used)
  }, [status?.attemptsUsed])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const [weekStatus, tokens] = await Promise.all([
          fetchPregunticaWeekStatus(),
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
          if (latest?.questionId) setQuestionId(latest.questionId)
          setQuestionTranslation(latest?.questionTranslation || null)
          if (latest?.icaWords?.length) setIcaWords(latest.icaWords)
          setShowAttemptWorkspace(!latest)
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

  async function refreshStatus() {
    const [weekStatus, tokens] = await Promise.all([
      fetchPregunticaWeekStatus(),
      fetchPregunticaTokenSummary(),
    ])
    setStatus(weekStatus)
    setTokenSummary(tokens)
  }

  async function handleStartAttempt() {
    setWorking(true)
    try {
      const created = await createPregunticaAttempt(mode)
      const words = pickIcaWords(cards, mode, config.level)
      const selectedQuestion = await resolveQuestionForAttempt()

      await savePregunticaAttemptPromptData({
        attemptId: created.id,
        questionId: selectedQuestion.questionId,
        questionText: selectedQuestion.questionText,
        icaWords: words,
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
        level: config.level || 'A2',
      })

      setAttempt({
        ...created,
        questionId: selectedQuestion.questionId,
        questionTranslation: selectedQuestion.questionTranslation,
        questionText: selectedQuestion.questionText,
        icaWords: words,
      })
      setQuestionId(selectedQuestion.questionId)
      setQuestionText(selectedQuestion.questionText)
      setQuestionTranslation(selectedQuestion.questionTranslation)
      setIcaWords(words)
      setQuestionWasPlayed(false)
      setListenCount(0)
      setQuestionVisible(false)
      setTranslationVisible(false)
      setShowAttemptWorkspace(true)
      setFeedback(null)
      setLatestTranscript(null)
      setSuggestions([])
      setRecordedBlob(null)
      setRecordedDurationMs(0)
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl)
        setRecordedUrl(null)
      }

      await refreshStatus()
      toast.success('Intento PreguntICA iniciado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el intento')
    } finally {
      setWorking(false)
    }
  }

  async function resolveQuestionForAttempt(
    excludeQuestionId?: string | null,
  ): Promise<{ questionId: string; questionText: string; questionTranslation: string }> {
    const selectedQuestion = await pickPregunticaQuestion(
      config.targetLang,
      excludeQuestionId,
    )
    let question = selectedQuestion.questionTarget || selectedQuestion.questionEs

    if (selectedQuestion.needsTranslation) {
      const translated = await fetchTranslation(
        selectedQuestion.questionEs,
        'Español',
        config.targetLang,
      )

      if (translated?.trim()) {
        question = translated.trim()
        await savePregunticaQuestionTranslation({
          questionId: selectedQuestion.questionId,
          targetLang: config.targetLang,
          translatedText: question,
        })
      }
    }

    return {
      questionId: selectedQuestion.questionId,
      questionText: question,
      questionTranslation: selectedQuestion.questionEs,
    }
  }

  async function createRetryAttemptWithSamePrompt() {
    if (!attempt) {
      throw new Error('No hay intento base para reutilizar pregunta y palabras')
    }

    const retryMode = attempt.wordMode || mode
    const created = await createPregunticaAttempt(retryMode)

    const sameQuestion = (attempt.questionText || questionText || '').trim()
    const sameWords = attempt.icaWords.length > 0 ? attempt.icaWords : icaWords
    const sameQuestionId = attempt.questionId || questionId
    const sameQuestionTranslation = attempt.questionTranslation || questionTranslation

    if (!sameQuestion || sameWords.length === 0) {
      throw new Error('No se encontró una pregunta válida para reintentar')
    }

    await savePregunticaAttemptPromptData({
      attemptId: created.id,
      questionId: sameQuestionId || null,
      questionText: sameQuestion,
      icaWords: sameWords,
      targetLang: config.targetLang,
      nativeLang: config.nativeLang,
      level: config.level || 'A2',
    })

    setAttempt({
      ...created,
      questionId: sameQuestionId || null,
      questionTranslation: sameQuestionTranslation || null,
      questionText: sameQuestion,
      icaWords: sameWords,
    })
    setQuestionId(sameQuestionId || null)
    setQuestionText(sameQuestion)
    setQuestionTranslation(sameQuestionTranslation || null)
    setIcaWords(sameWords)
    setQuestionWasPlayed(false)
    setListenCount(0)
    setQuestionVisible(false)
    setTranslationVisible(false)
    setShowAttemptWorkspace(true)
    setFeedback(null)
    setLatestTranscript(null)
    setSuggestions([])
    setRecordedBlob(null)
    setRecordedDurationMs(0)
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl)
      setRecordedUrl(null)
    }
  }

  async function handleRetryAttempt() {
    if (!attempt) {
      await handleStartAttempt()
      return
    }

    setWorking(true)
    try {
      await createRetryAttemptWithSamePrompt()

      await refreshStatus()
      toast.success('Nuevo intento creado con la misma pregunta y palabras ICA')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el reintento')
    } finally {
      setWorking(false)
    }
  }

  async function handleRedeemAndRetry() {
    if (!status?.weekStart) {
      toast.error('No se encontró la semana para canjear fichas')
      return
    }

    setWorking(true)
    try {
      await redeemPregunticaTokensForWeek(status.weekStart)
      setAttempt(null)
      setQuestionId(null)
      setQuestionText('')
      setQuestionTranslation(null)
      setIcaWords([])
      setQuestionWasPlayed(false)
      setListenCount(0)
      setQuestionVisible(false)
      setTranslationVisible(false)
      setShowAttemptWorkspace(false)
      setFeedback(null)
      setLatestTranscript(null)
      setSuggestions([])
      setRecordedBlob(null)
      setRecordedDurationMs(0)
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl)
        setRecordedUrl(null)
      }

      await refreshStatus()
      toast.success('Canje realizado. Elige el tipo de palabras para iniciar la nueva PreguntICA.')
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
          setRecordedUrl(nextUrl)
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

    setWorking(true)

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
        toast.error('La respuesta no cumple el mínimo de caracteres')
        await refreshStatus()
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
            }
          : current,
      )
      toast.success('Analisis completado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo analizar la respuesta')
    } finally {
      setWorking(false)
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
  const hasRedeemableTokens = tokenBalance >= 2
  const isWeekClosedWithoutActiveAttempt = !canStartAttempt && !hasActiveAttempt
  const shouldShowStartCard =
    !locked
    && !hasActiveAttempt
    && (!hasCompletedWeek || canStartAttempt || hasRedeemableTokens)
  const currentWindowLabel = getWindowRemainingLabel(status)
  const showCompletionMessage = hasCompletedWeek && !hasActiveAttempt

  const existingCardWords = useMemo(() => new Set(cards.map((card) => normalizeComparableText(card.target))), [cards])
  const addedSuggestionSet = useMemo(() => new Set(addedSuggestionWords.map(normalizeComparableText)), [addedSuggestionWords])

  function isSuggestionAdded(word: string): boolean {
    const key = normalizeComparableText(word)
    return existingCardWords.has(key) || addedSuggestionSet.has(key)
  }

  function handleOpenSuggestionModal(suggestion: PregunticaWordSuggestion) {
    if (isSuggestionAdded(suggestion.word)) return
    setSelectedSuggestion(suggestion)
    setSuggestionModalOpen(true)
  }

  return (
    <section className='mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:pb-10'>
      <div className='rounded-[24px] border border-border bg-[linear-gradient(160deg,hsl(var(--background)),hsl(var(--muted)/0.35))] p-6'>
        <div className='mb-3 flex justify-end'>
          <button
            type='button'
            onClick={() => navigate(DASHBOARD_ROUTES.pregunticaHistory)}
            className='rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100'
          >
            Ver historial completo
          </button>
        </div>
        <p className='text-xs font-semibold tracking-[0.2em] text-slate-500'>PREGUNTICA</p>
        <h1 className='mt-2 font-serif text-3xl font-bold text-slate-700 dark:text-slate-100'>
          Tu reto semanal de expresión
        </h1>
        <p className='mt-2 text-sm text-slate-500'>
          Se desbloquea cada viernes y tienes hasta el siguiente viernes para responder.
        </p>
      </div>

      <div className='mt-4 rounded-2xl border border-border bg-background p-4'>
        <p className='text-sm'>
          Progreso de desbloqueo: <strong>{status?.activationWordsCount || 0}</strong> /
          {' '}
          <strong>{status?.requiredActivationWords || 20}</strong> palabras activadas
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          Ventana activa: {status?.weekStart} a {status?.weekEnd} ({status?.timezone || 'UTC'})
        </p>
        <div className='mt-3 grid gap-2 rounded-xl border border-emerald-200/50 bg-emerald-50/60 p-3 text-xs text-emerald-900 md:grid-cols-3'>
          <div>
            <p className='font-semibold'>Fichas disponibles</p>
            <p className='text-base font-bold'>{tokenSummary?.balance ?? 0}</p>
          </div>
          <div>
            <p className='font-semibold'>Último abono mensual</p>
            <p>
              {tokenSummary?.lastMonthlyEarnTokens ?? 0} fichas
            </p>
          </div>
          <div>
            <p className='font-semibold'>Origen</p>
            <p>
              {tokenSummary?.lastMonthlyEarnMonth || '-'} · {tokenSummary?.lastMonthlyEarnPoints ?? '-'} puntos
            </p>
          </div>
        </div>
      </div>

      {locked && (
        <div className='mt-4 rounded-2xl border border-amber-300/50 bg-amber-50 p-4 text-amber-900'>
          Aún no desbloqueaste esta PreguntICA semanal. Necesitas activar 20 palabras
          entre viernes y viernes.
        </div>
      )}

      {showCompletionMessage && (
        <div className='mt-4 rounded-2xl border border-emerald-300/60 bg-emerald-50 p-4 text-emerald-900'>
          <p className='text-sm font-semibold'>Reto completado 🎉</p>
          <p className='mt-1 text-sm'>
            Tu respuesta y feedback quedaron guardados en el historial. Puedes cerrar por hoy o
            canjear fichas para desbloquear una nueva PreguntICA.
          </p>
        </div>
      )}

      {shouldShowStartCard && (
        <div className='mt-4 rounded-2xl border border-border bg-background p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm font-semibold'>1) Elige tipo de palabras</p>
            <span className='rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground'>
              {hasCompletedWeek && !canStartAttempt ? 'Canje disponible' : 'Paso inicial'}
            </span>
          </div>
          {!hasCompletedWeek || canStartAttempt ? (
            <>
              <p className='mt-1 text-xs text-muted-foreground'>
                Selecciona la frecuencia ICA para esta nueva pregunta.
              </p>
              <div className='mt-3 flex flex-wrap gap-2'>
                {WORD_MODE_OPTIONS.map((option) => {
                  const selected = mode === option.key
                  return (
                    <Button
                      key={option.key}
                      type='button'
                      onClick={() => setMode(option.key)}
                      variant={selected ? 'default' : 'outline'}
                      className={`min-w-22.5 h-auto flex-1 py-2.5 ${selected ? WORD_MODE_TONE[option.key] : ''}`}
                    >
                      <span
                        className={`mr-1 h-1.5 w-1.5 rounded-full ${WORD_MODE_DOT[option.key]}`}
                      />
                      <div className='text-xs font-semibold'>{option.label}</div>
                    </Button>
                  )
                })}
              </div>
              <button
                type='button'
                onClick={handleStartAttempt}
                disabled={working || !canStartAttempt}
                className='mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
              >
                {attemptsLeft > 0
                  ? `Empezar intento semanal (${attemptsLeft} restantes)`
                  : 'Empezar nueva PreguntICA'}
              </button>
            </>
          ) : (
            <>
              <p className='mt-1 text-xs text-muted-foreground'>
                Ya completaste la semanal. Canjea 2 fichas para desbloquear una nueva PreguntICA.
              </p>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={handleRedeemAndRetry}
                  disabled={working || !hasRedeemableTokens}
                  className='rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
                >
                  Canjear 2 fichas y desbloquear nueva PreguntICA
                </button>
                <span className='text-xs text-muted-foreground'>
                  Saldo actual: {tokenBalance} fichas
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {activeAttempt && !isWeekClosedWithoutActiveAttempt && !showAttemptWorkspace && (
        <div className='mt-4 rounded-2xl border border-border bg-background p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm font-semibold'>Intento activo de esta semana</p>
            <span className='rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700'>
              En progreso
            </span>
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            Ventana: {status?.weekStart} a {status?.weekEnd} · {currentWindowLabel}
          </p>

          <div className='mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3'>
            <p className='text-xs font-semibold text-slate-700'>Pregunta actual</p>
            <p className='mt-1 text-sm text-slate-700'>
              {activeAttempt.questionText || questionText || 'Pregunta pendiente de generar'}
            </p>
          </div>

          <div className='mt-3 flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={() => setShowAttemptWorkspace(true)}
              className='rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium'
            >
              Continuar intento
            </button>
            <button
              type='button'
              onClick={handleCompleteAttempt}
              disabled={working}
              className='rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-60'
            >
              Finalizar esta PreguntICA
            </button>
            <button
              type='button'
              onClick={handleRetryAttempt}
              disabled={working || !canStartAttempt}
              className='rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
            >
              Volver a intentar
            </button>
          </div>
          <p className='mt-2 text-xs text-muted-foreground'>
            {attemptsLeft > 0
              ? `Te quedan ${attemptsLeft} intentos semanales.`
              : 'Intento desbloqueado por canje de fichas.'}
          </p>
        </div>
      )}

      {activeAttempt && !isWeekClosedWithoutActiveAttempt && showAttemptWorkspace && (
        <div className='mt-4 space-y-4'>
          <div className='rounded-2xl border border-border bg-background p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm font-semibold'>2) Escucha y responde</p>
              <span className='rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground'>
                {questionVisible ? 'Pregunta revelada' : 'Pendiente de escucha'}
              </span>
            </div>
            <p className='mt-2 text-xs text-muted-foreground'>
              Primero escucha la pregunta. Después puedes verla y responder usando las
              palabras ICA indicadas.
            </p>
            <div className='mt-3 flex flex-wrap gap-2'>
              <SpeakButton
                text={questionText}
                langName={config.targetLang}
                color='#3B82F6'
                label='Escuchar pregunta'
                disabled={!questionText || working}
                onPlayingChange={(isPlaying) => {
                  if (isPlaying) {
                    setQuestionWasPlayed(true)
                    return
                  }
                  setListenCount((current) => current + 1)
                }}
                className='mt-0'
              />
              <button
                type='button'
                onClick={() => setQuestionVisible(true)}
                disabled={!questionWasPlayed}
                className='rounded-xl border border-border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60'
              >
                Mostrar pregunta
              </button>
              <button
                type='button'
                onClick={() => setTranslationVisible((current) => !current)}
                disabled={!questionVisible || !questionTranslation}
                className='rounded-xl border border-border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60'
              >
                {translationVisible ? 'Ocultar traducción' : 'Mostrar traducción'}
              </button>
            </div>

            <p className='mt-2 text-xs text-muted-foreground'>
              {listenCount > 0
                ? `Escuchada ${listenCount} ${listenCount === 1 ? 'vez' : 'veces'}.`
                : 'Aún no has escuchado la pregunta.'}
            </p>

            {questionVisible && questionText && (
              <div className='mt-4 rounded-xl border border-[#0ea5e9]/20 bg-[#f0f9ff] p-3 text-sm text-[#0c4a6e]'>
                {questionText}
              </div>
            )}

            {questionVisible && translationVisible && questionTranslation && (
              <div className='mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900'>
                <p className='text-xs font-semibold uppercase tracking-wide text-emerald-700'>
                  Traducción (español)
                </p>
                <p className='mt-1'>{questionTranslation}</p>
              </div>
            )}

            <div className='mt-4'>
              <p className='text-xs font-semibold text-muted-foreground'>Palabras ICA objetivo</p>
              {questionWasPlayed ? (
                <div className='mt-2 flex flex-wrap gap-2'>
                  {icaWords.map((word) => (
                    <span
                      key={word}
                      className='rounded-full border border-[#86efac]/70 bg-[#f0fdf4] px-2.5 py-1 text-xs font-semibold text-[#166534]'
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ) : (
                <p className='mt-2 text-xs text-muted-foreground'>
                  Se desbloquean tras escuchar la pregunta al menos una vez.
                </p>
              )}
            </div>
          </div>

          <div className='rounded-2xl border border-border bg-background p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm font-semibold'>3) Graba, analiza y mejora</p>
              <span className='rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground'>
                {feedback ? 'Feedback listo' : recordedBlob ? 'Listo para analizar' : 'Sin grabación'}
              </span>
            </div>
            <div className='mt-3 flex flex-wrap items-center gap-2'>
              {!isRecording ? (
                <button
                  type='button'
                  onClick={handleStartRecording}
                  disabled={working}
                  className='rounded-xl border border-primary/40 bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
                >
                  🎙️ Empezar grabación
                </button>
              ) : (
                <button
                  type='button'
                  onClick={handleStopRecording}
                  className='rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700'
                >
                  ⏹️ Detener grabación
                </button>
              )}

              <button
                type='button'
                onClick={handleAnalyze}
                disabled={working || !recordedBlob}
                className='rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60'
              >
                Analizar respuesta
              </button>
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

          {feedback && (
            <div className='rounded-2xl border border-slate-300/60 bg-slate-50 p-4'>
              <p className='text-sm font-semibold text-slate-900'>Feedback</p>
              <p className='mt-1 text-sm text-slate-700'>
                Naturalidad: <strong>{feedback.score.toFixed(1)} / 10</strong>
              </p>
              <p className='mt-1 text-sm text-slate-700'>{feedback.naturalness}</p>

              {(latestTranscript || activeAttempt.transcriptText) && (
                <div className='mt-3 rounded-lg border border-slate-200 bg-white/80 p-3'>
                  <p className='text-xs font-semibold text-slate-700'>Transcripción</p>
                  <p className='mt-1 text-sm text-slate-700'>
                    {latestTranscript || activeAttempt.transcriptText}
                  </p>
                </div>
              )}

              {feedback.corrections.length > 0 && (
                <ul className='mt-3 space-y-2 text-sm'>
                  {feedback.corrections.map((item, index) => (
                    <li key={`${item.original}-${index}`} className='rounded-lg bg-white/70 p-2'>
                      <strong>{item.original}</strong> → {item.suggestion}
                      <div className='text-xs text-slate-600'>{item.reason}</div>
                    </li>
                  ))}
                </ul>
              )}

              <p className='mt-3 text-sm text-slate-700'>{feedback.coachReply}</p>

              <div className='mt-4 rounded-xl border border-slate-300/60 bg-white p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs font-semibold text-slate-700'>Sugerencias ICA</p>
                  <button
                    type='button'
                    onClick={handleRefreshSuggestions}
                    disabled={working || (activeAttempt.suggestionsRefreshCount || 0) >= 3}
                    className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    Actualizar sugerencias ({Math.max(0, 3 - (activeAttempt.suggestionsRefreshCount || 0))})
                  </button>
                </div>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {suggestions.map((item) => (
                    <button
                      type='button'
                      key={`${item.word}-${item.reason}`}
                      onClick={() => handleOpenSuggestionModal(item)}
                      disabled={isSuggestionAdded(item.word)}
                      className='rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-left text-xs text-slate-700 transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-70'
                      title={item.reason}
                    >
                      <span className='font-semibold'>
                        {isSuggestionAdded(item.word) ? '✓ ' : '+ '}
                        {item.word}
                      </span>
                      {item.translation && (
                        <span className='ml-1 text-slate-500'>· {item.translation}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type='button'
                onClick={handleCompleteAttempt}
                disabled={working}
                className='mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60'
              >
                Finalizar PreguntICA semanal
              </button>
            </div>
          )}
        </div>
      )}

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
