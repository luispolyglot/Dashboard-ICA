import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BookOpenIcon,
  CheckIcon,
  HeadphonesIcon,
  KeyboardIcon,
  Link2Icon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  SparklesIcon,
  TextCursorInputIcon,
  TrophyIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddIcaSuggestionModal } from '../components/AddIcaSuggestionModal'
import {
  FeedbackCard,
  OptionsGrid,
  PairsBoard,
  PairsResult,
  QuestionPrompt,
  ReviewList,
  SpeakPanel,
  TimerBar,
  useCountdown,
  WriteAnswerForm,
} from '../components/IcaChallenges/ChallengePlayParts'
import {
  launchWinConfetti,
  SoundToggleButton,
  useChallengeSounds,
} from '../components/IcaChallenges/challengeFeedback'
import {
  isSpeechRecognitionSupported,
  listenOnce,
  speakAsync,
  stopSpeaking,
  unlockChallengeAudio,
  warmUpMicrophone,
} from '../components/NotaDesafiante/challengeEngine'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { refreshIcaChallengeAlerts } from '../hooks/useIcaChallengeAlerts'
import {
  answerIcaChallengeQuestion,
  endIcaChallengeSession,
  fetchIcaChallengePlayState,
  fetchIcaChallengeReview,
  IcaChallengeRequestError,
  listIcaChallengeProfilesByIds,
  requestIcaChallengeQuestion,
} from '../services/icaChallenges'
import type {
  AppConfig,
  IcaChallengePairsResult,
  IcaChallengePlayState,
  IcaChallengeProgress,
  IcaChallengeReveal,
  IcaChallengeReview,
  IcaChallengeReviewItem,
  IcaChallengeServedQuestion,
  IcaChallengeStep,
  Lexicard,
} from '../types'

type IcaChallengePlayViewProps = {
  challengeId: string
  config: AppConfig
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
}

type Phase =
  | 'loading'
  | 'error'
  | 'waiting'
  | 'intro'
  | 'question'
  | 'feedback'
  | 'round_end'
  | 'finishing'
  | 'finished'

type AnswerResponse = {
  optionIndex?: number | null
  text?: string | null
  transcripts?: string[] | null
  /** Parejas: significado unido a cada palabra. */
  matches?: Array<number | null>
}

type Feedback = {
  question: IcaChallengeServedQuestion
  isCorrect: boolean
  timedOut: boolean
  reveal: IcaChallengeReveal
  response: AnswerResponse
  pairs: IcaChallengePairsResult | null
}

const MODE_INFO: Record<string, { name: string; icon: LucideIcon; howTo: string }> = {
  'ica-own-words': {
    name: 'Lectura',
    icon: BookOpenIcon,
    howTo: 'Leerás una palabra en tu idioma. Elige la correcta entre 4 opciones antes de que se acabe el tiempo.',
  },
  'ica-writing': {
    name: 'Escritura · por palabra',
    icon: PencilIcon,
    howTo:
      'Verás una palabra en tu idioma y su primera letra. Escríbela en tu idioma objetivo. Las tildes y letras especiales cuentan.',
  },
  'ica-lightning': {
    name: 'Escritura · cuenta atrás',
    icon: ZapIcon,
    howTo:
      'Escribe en tu idioma objetivo todas las palabras que puedas antes de que se acabe el tiempo. Pulsa Intro para pasar a la siguiente.',
  },
  'ica-speak': {
    name: 'Habla',
    icon: MicIcon,
    howTo: 'Verás una palabra en tu idioma. Dila en voz alta en tu idioma objetivo: el micrófono se abre solo.',
  },
  'ica-listen': {
    name: 'Escucha',
    icon: HeadphonesIcon,
    howTo: 'Escucharás una palabra en tu idioma objetivo. Elige qué significa entre 4 opciones.',
  },
  'ica-cloze': {
    name: 'Completa la frase',
    icon: TextCursorInputIcon,
    howTo: 'Verás una frase de ejemplo del Baúl ICA con un hueco. Elige la palabra ICA que falta.',
  },
  'ica-pairs': {
    name: 'Parejas',
    icon: Link2Icon,
    howTo:
      'Verás 5 palabras ICA y sus significados desordenados. Toca una palabra y después su significado. Al unir la última pareja se corrige el tablero.',
  },
}

const FEEDBACK_MS_CORRECT = 1100
const FEEDBACK_MS_WRONG = 2000
// Parejas: hay 5 resultados que leer.
const FEEDBACK_MS_PAIRS_PERFECT = 1800
const FEEDBACK_MS_PAIRS = 3800
const PAIRS_PER_BOARD = 5

function normalizeComparable(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function IcaChallengePlayView({
  challengeId,
  config,
  cards,
  setCards,
  onWordAdded,
}: IcaChallengePlayViewProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [state, setState] = useState<IcaChallengePlayState | null>(null)
  const [names, setNames] = useState({ me: 'Tú', rival: 'Tu rival' })
  const [question, setQuestion] = useState<IcaChallengeServedQuestion | null>(null)
  const [questionEndsAt, setQuestionEndsAt] = useState<number | null>(null)
  const [questionShownAt, setQuestionShownAt] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [progress, setProgress] = useState<IcaChallengeProgress | null>(null)
  const [sessionEndsAt, setSessionEndsAt] = useState<number | null>(null)
  const [sessionTotalMs, setSessionTotalMs] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string; key: number } | null>(null)
  const [review, setReview] = useState<IcaChallengeReview | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [roundCanContinue, setRoundCanContinue] = useState(false)
  const [micMessage, setMicMessage] = useState<string | null>(null)
  const [wordToAdd, setWordToAdd] = useState<IcaChallengeReviewItem | null>(null)
  const [addedTargets, setAddedTargets] = useState<Set<string>>(() => new Set())

  const { muted, toggleMuted, playAnswer, playQuickAnswer } = useChallengeSounds()

  const mountedRef = useRef(true)
  const timersRef = useRef<number[]>([])
  // Parejas: lo que lleva unido (para mandarlo si se acaba el tiempo).
  const pairMatchesRef = useRef<Array<number | null>>([])
  const onQuestionTimeoutRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      timersRef.current.forEach((id) => window.clearTimeout(id))
      stopSpeaking()
    }
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (mountedRef.current) fn()
    }, ms)
    timersRef.current.push(id)
  }, [])

  const challenge = state?.challenge ?? null
  const isLightning = challenge?.format === 'lightning'
  const isPairs = challenge?.kind === 'pairs'
  const mode = challenge ? MODE_INFO[challenge.typeId] : null
  const ModeIcon = mode?.icon ?? SparklesIcon

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const loadReview = useCallback(async () => {
    try {
      const data = await fetchIcaChallengeReview(challengeId)
      if (mountedRef.current) setReview(data)
    } catch {
      if (mountedRef.current) setReview(null)
    }
  }, [challengeId])

  const load = useCallback(async () => {
    setPhase('loading')
    setErrorMessage(null)
    try {
      const playState = await fetchIcaChallengePlayState(challengeId)
      if (!mountedRef.current) return
      setState(playState)
      setProgress({
        answered: playState.me.answered,
        correct: playState.me.correct,
        total: playState.challenge.totalQuestions,
        rivalAnswered: playState.rival.answered,
        rivalCorrect: playState.rival.correct,
      })

      void listIcaChallengeProfilesByIds([playState.me.userId, playState.rival.userId])
        .then((profiles) => {
          if (!mountedRef.current) return
          setNames({
            me: profiles[playState.me.userId]?.displayName || 'Tú',
            rival: profiles[playState.rival.userId]?.displayName || 'Tu rival',
          })
        })
        .catch(() => {})

      const finished =
        playState.challenge.status !== 'in_progress' && playState.challenge.status !== 'created'
      if (playState.me.done || (finished && playState.me.answered > 0)) {
        await loadReview()
        if (mountedRef.current) setPhase('finished')
        return
      }
      if (playState.challenge.status !== 'in_progress' || !playState.challenge.isMyTurn) {
        setPhase('waiting')
        return
      }
      setPhase('intro')
    } catch (error) {
      if (!mountedRef.current) return
      setErrorMessage(error instanceof Error ? error.message : 'No pudimos cargar el desafío.')
      setPhase('error')
    }
  }, [challengeId, loadReview])

  useEffect(() => {
    void load()
  }, [load])

  // -------------------------------------------------------------------------
  // Partida
  // -------------------------------------------------------------------------

  const finish = useCallback(async () => {
    setPhase('finishing')
    setQuestion(null)
    stopSpeaking()
    try {
      const playState = await fetchIcaChallengePlayState(challengeId)
      if (mountedRef.current) setState(playState)
    } catch {
      // se enseñan los resultados igualmente
    }
    await loadReview()
    if (mountedRef.current) setPhase('finished')
  }, [challengeId, loadReview])

  const showQuestion = useCallback((next: IcaChallengeServedQuestion) => {
    const now = Date.now()
    pairMatchesRef.current = []
    setQuestion(next)
    setFeedback(null)
    setMicMessage(null)
    setQuestionShownAt(now)
    setQuestionEndsAt(next.limitMs === null ? null : now + next.limitMs)
    setPhase('question')
    if (next.data.kind === 'listen') {
      void speakAsync(next.data.audioText, next.language.target)
    }
  }, [])

  const applyStep = useCallback(
    (step: IcaChallengeStep) => {
      if (step.progress) setProgress(step.progress)
      if (step.session) {
        setSessionEndsAt(Date.now() + step.session.remainingMs)
        setSessionTotalMs(step.session.totalMs)
      }

      if ((step.status === 'question' || step.status === 'answered') && step.question) {
        showQuestion(step.question)
        return
      }
      if (step.status === 'round_finished') {
        setQuestion(null)
        setRoundCanContinue(Boolean(step.isMyTurn))
        setPhase('round_end')
        return
      }
      void finish()
    },
    [finish, showQuestion],
  )

  const start = async () => {
    if (starting) return
    // Tiene que ir dentro del toque: en iPhone el sonido solo se desbloquea así.
    unlockChallengeAudio()
    setStarting(true)
    setMicMessage(null)
    try {
      if (challenge?.kind === 'speak') {
        if (!isSpeechRecognitionSupported()) {
          setMicMessage(
            'Tu navegador no reconoce la voz. Abre icademy.app en Chrome (Android u ordenador) o en Safari (iPhone).',
          )
          return
        }
        const warm = await warmUpMicrophone(config.targetLang)
        if (!warm.ok) {
          setMicMessage(warm.message)
          return
        }
      }
      const step = await requestIcaChallengeQuestion(challengeId)
      if (!mountedRef.current) return
      applyStep(step)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos empezar.')
      void load()
    } finally {
      if (mountedRef.current) setStarting(false)
    }
  }

  const submit = useCallback(
    async (response: AnswerResponse, options?: { timedOut?: boolean }) => {
      if (!question || submitting) return
      setSubmitting(true)
      const answeredQuestion = question
      const clientMs = Date.now() - questionShownAt
      try {
        const step = await answerIcaChallengeQuestion({
          challengeId,
          questionIndex: answeredQuestion.index,
          response,
          clientMs,
          timedOut: options?.timedOut,
        })
        if (!mountedRef.current) return

        if (isLightning) {
          if (step.result) {
            setFlash({
              ok: step.result.isCorrect,
              text: step.result.isCorrect
                ? step.result.reveal.target
                : `${step.result.reveal.target} · ${step.result.reveal.native}`,
              key: Date.now(),
            })
            playQuickAnswer(step.result.isCorrect)
          }
          applyStep(step)
          return
        }

        if (!step.result) {
          applyStep(step)
          return
        }

        // El marcador sube a la vez que se enseña el acierto.
        if (step.progress) setProgress(step.progress)
        setFeedback({
          question: answeredQuestion,
          isCorrect: step.result.isCorrect,
          timedOut: step.result.timedOut,
          reveal: step.result.reveal,
          response,
          pairs: step.pairs,
        })
        setPhase('feedback')
        playAnswer(step.result.isCorrect)

        if (step.pairs) {
          // Parejas: el siguiente tablero se pide al acabar de enseñar el resultado,
          // así su reloj empieza entero.
          later(
            () => {
              if (step.status !== 'answered' || step.question) {
                applyStep(step)
                return
              }
              void requestIcaChallengeQuestion(challengeId)
                .then((next) => {
                  if (mountedRef.current) applyStep(next)
                })
                .catch((error) => {
                  toast.error(error instanceof Error ? error.message : 'No pudimos cargar el siguiente tablero.')
                  void load()
                })
            },
            step.result.isCorrect ? FEEDBACK_MS_PAIRS_PERFECT : FEEDBACK_MS_PAIRS,
          )
          return
        }
        later(() => applyStep(step), step.result.isCorrect ? FEEDBACK_MS_CORRECT : FEEDBACK_MS_WRONG)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo enviar tu respuesta.'
        toast.error(message)
        // Se vuelve a pedir el estado: el servidor retoma la pregunta con el tiempo que quede.
        if (!(error instanceof IcaChallengeRequestError) || error.code !== 'ICA_CHALLENGE_ALREADY_ANSWERED') {
          void load()
        }
      } finally {
        if (mountedRef.current) setSubmitting(false)
      }
    },
    [applyStep, challengeId, isLightning, later, load, playAnswer, playQuickAnswer, question, questionShownAt, submitting],
  )

  const endLightning = useCallback(async () => {
    try {
      await endIcaChallengeSession(challengeId)
    } catch {
      // el servidor la cierra igualmente al pasar el minuto
    }
    await finish()
  }, [challengeId, finish])

  // -------------------------------------------------------------------------
  // Dilo en voz alta: micrófono
  // -------------------------------------------------------------------------

  const [speakStatus, setSpeakStatus] = useState<'starting' | 'listening' | 'checking' | 'idle'>('idle')
  const [heard, setHeard] = useState('')
  const heardRef = useRef('')
  const cancelListenRef = useRef<(() => void) | null>(null)

  const startListening = useCallback(async () => {
    if (!question || question.kind !== 'speak') return
    const remaining = (questionEndsAt ?? Date.now()) - Date.now()
    if (remaining < 900) return
    cancelListenRef.current?.()
    setMicMessage(null)
    setSpeakStatus('starting')
    const session = listenOnce(question.language.target, {
      noSpeechMs: Math.min(remaining, 6000),
      endSilenceMs: 900,
      maxMs: remaining,
      onInterim: (text) => {
        heardRef.current = text
        setHeard(text)
        setSpeakStatus('listening')
      },
    })
    cancelListenRef.current = session.cancel
    setSpeakStatus('listening')
    const outcome = await session.promise
    if (!mountedRef.current) return
    cancelListenRef.current = null

    if (outcome.status === 'cancelled') return
    if (outcome.status === 'heard') {
      heardRef.current = outcome.transcript
      setHeard(outcome.transcript)
      setSpeakStatus('checking')
      void submit({ transcripts: outcome.candidates.length ? outcome.candidates : [outcome.transcript] })
      return
    }
    setSpeakStatus('idle')
    setMicMessage(
      outcome.status === 'error' ? outcome.message : 'No te he oído bien. Toca «Repetir» y dila otra vez.',
    )
  }, [question, questionEndsAt, submit])

  useEffect(() => {
    if (phase !== 'question' || question?.kind !== 'speak') return
    heardRef.current = ''
    setHeard('')
    const id = window.setTimeout(() => void startListening(), 250)
    return () => {
      window.clearTimeout(id)
      cancelListenRef.current?.()
      cancelListenRef.current = null
    }
    // Solo al aparecer cada palabra nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question?.index])

  // -------------------------------------------------------------------------
  // Relojes
  // -------------------------------------------------------------------------

  // Al acabarse el tiempo de una palabra (modos por turnos).
  onQuestionTimeoutRef.current = () => {
    if (phase !== 'question' || !question || isLightning) return
    if (question.kind === 'pairs') {
      // Se corrige lo que haya unido hasta ahora.
      void submit({ matches: pairMatchesRef.current }, { timedOut: true })
      return
    }
    if (question.kind === 'speak') {
      // Si se acaba mientras habla, se corrige lo que se haya entendido.
      cancelListenRef.current?.()
      const text = heardRef.current.trim()
      void submit(text ? { transcripts: [text] } : {}, { timedOut: !text })
      return
    }
    void submit({}, { timedOut: true })
  }

  const questionCountdown = useCountdown({
    endsAt: phase === 'question' && !isLightning ? questionEndsAt : null,
    totalMs: question?.limitMs ?? null,
    onExpire: () => onQuestionTimeoutRef.current?.(),
    paused: submitting,
  })

  // Reloj de la partida (Modo Relámpago).
  const sessionCountdown = useCountdown({
    endsAt: isLightning && phase === 'question' ? sessionEndsAt : null,
    totalMs: sessionTotalMs,
    onExpire: () => void endLightning(),
  })

  // -------------------------------------------------------------------------
  // Resultados: añadir palabras del rival al baúl
  // -------------------------------------------------------------------------

  const myTargets = useMemo(() => {
    const set = new Set<string>()
    for (const card of cards) {
      if ((card.targetLang || config.targetLang) !== config.targetLang) continue
      if ((card.nativeLang || config.nativeLang) !== config.nativeLang) continue
      set.add(normalizeComparable(card.target))
    }
    return set
  }, [cards, config.nativeLang, config.targetLang])

  const reviewItems = useMemo(() => {
    if (!review) return []
    // En el Modo Relámpago una palabra puede salir dos veces: se enseña una.
    const seen = new Set<string>()
    return review.items.filter((item) => {
      const key = normalizeComparable(item.target)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [review])

  const canAdd = (item: IcaChallengeReviewItem): 'add' | 'owned' | 'hidden' => {
    if (!item.fromRival) return 'hidden'
    if (item.targetLang && item.targetLang !== config.targetLang) return 'hidden'
    const key = normalizeComparable(item.target)
    if (myTargets.has(key) || addedTargets.has(key)) return 'owned'
    return 'add'
  }

  // Al acabar una ronda o la partida, el aviso de «te toca» se pone al día.
  useEffect(() => {
    if (phase === 'round_end' || phase === 'finished' || phase === 'waiting') {
      void refreshIcaChallengeAlerts(true)
    }
  }, [phase])

  // -------------------------------------------------------------------------
  // Confeti al ganar (una vez por visita a la pantalla de resultado)
  // -------------------------------------------------------------------------

  const celebratedRef = useRef(false)
  const iWon =
    phase === 'finished' &&
    challenge?.status === 'completed' &&
    Boolean(state?.me.userId) &&
    challenge?.winnerUserId === state?.me.userId

  useEffect(() => {
    if (!iWon || celebratedRef.current) return
    celebratedRef.current = true
    return launchWinConfetti()
  }, [iWon])

  // -------------------------------------------------------------------------
  // Pantallas
  // -------------------------------------------------------------------------

  const renderPage = (content: ReactNode) => (
    <section className='mx-auto w-full max-w-xl flex-1 p-4 pb-24 lg:pb-4'>{content}</section>
  )

  const backButton = (
    <Button asChild variant='outline'>
      <Link to={DASHBOARD_ROUTES.challengesIca}>Volver a Desafíos ICA</Link>
    </Button>
  )

  const header = challenge && (
    <div className='mb-4 flex items-center justify-between gap-3'>
      <div className='flex min-w-0 items-center gap-2'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary'>
          <ModeIcon className='h-4 w-4' />
        </span>
        <div className='min-w-0'>
          <p className='truncate font-serif text-lg font-semibold leading-tight'>{mode?.name ?? 'Desafío ICA'}</p>
          <p className='truncate text-xs text-muted-foreground'>
            contra {names.rival}
            {challenge.wordSource === 'mixed' ? ' · Por idioma' : ' · Global'}
          </p>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-3'>
        {progress && (phase === 'question' || phase === 'feedback') && (
          <div className='shrink-0 text-right'>
            <p className='inline-flex items-center gap-1 font-serif text-xl leading-none'>
              <CheckIcon className='h-4 w-4 text-emerald-500' />
              {progress.correct}
            </p>
            {!isLightning && (question?.round || feedback?.question.round) && (
              <p className='text-[11px] text-muted-foreground'>
                {(() => {
                  const round = (question?.round || feedback?.question.round)!
                  if (isPairs) {
                    const servedIndex = (phase === 'feedback' ? feedback?.question.index : question?.index) ?? 0
                    const board = Math.floor(servedIndex / PAIRS_PER_BOARD) + 1
                    const boards = Math.max(1, Math.ceil((challenge.totalQuestions ?? 10) / PAIRS_PER_BOARD))
                    return `Tablero ${board}/${boards}`
                  }
                  return `${challenge.rounds > 1 ? `Ronda ${round.roundNumber}/${round.roundsTotal} · ` : ''}${round.positionInRound}/${round.questionsInRound}`
                })()}
              </p>
            )}
            {isLightning && (
              <p className='text-[11px] text-muted-foreground'>
                {progress.answered} palabra{progress.answered === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )}
        <SoundToggleButton muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )

  if (phase === 'loading' || phase === 'finishing') {
    return renderPage(
      <div className='flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground'>
        <Loader2Icon className='h-4 w-4 animate-spin' />
        {phase === 'finishing' ? 'Calculando resultados…' : 'Cargando desafío…'}
      </div>,
    )
  }

  if (phase === 'error' || !challenge || !state) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>No se pudo abrir el desafío</CardTitle>
          <CardDescription>{errorMessage || 'No encontramos el desafío.'}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-2'>
          <Button type='button' onClick={() => void load()}>
            Reintentar
          </Button>
          {backButton}
        </CardContent>
      </Card>,
    )
  }

  const scoreBoxes = (showAnswered: boolean) =>
    progress && (
      <div className='grid grid-cols-2 gap-2 text-center'>
        <div className='rounded-xl border bg-muted/20 p-3'>
          <p className='text-xs text-muted-foreground'>Tú</p>
          <p className='font-serif text-2xl'>
            {progress.correct}
            {showAnswered && <span className='text-sm text-muted-foreground'>/{progress.answered}</span>}
          </p>
        </div>
        <div className='rounded-xl border bg-muted/20 p-3'>
          <p className='truncate text-xs text-muted-foreground'>{firstName(names.rival)}</p>
          <p className='font-serif text-2xl'>
            {progress.rivalCorrect}
            {showAnswered && <span className='text-sm text-muted-foreground'>/{progress.rivalAnswered}</span>}
          </p>
        </div>
      </div>
    )

  if (phase === 'waiting') {
    const title =
      challenge.status === 'created'
        ? `Esperando a que ${firstName(names.rival)} acepte`
        : challenge.status === 'in_progress'
          ? `Le toca a ${firstName(names.rival)}`
          : 'Este desafío ya no está activo'
    const description =
      challenge.status === 'in_progress'
        ? 'Te avisaremos cuando sea tu turno.'
        : challenge.status === 'created'
          ? 'Cuando acepte, empezará su primer turno.'
          : 'Puedes retar de nuevo desde Desafíos ICA.'
    return renderPage(
      <>
        {header}
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {challenge.status === 'in_progress' && scoreBoxes(false)}
            {backButton}
          </CardContent>
        </Card>
      </>,
    )
  }

  if (phase === 'intro') {
    const resuming = state.me.answered > 0 || state.me.hasOpenQuestion || state.me.sessionStarted
    const round = state.me.round
    const roundLabel =
      !isLightning && round && challenge.rounds > 1
        ? isPairs
          ? `Ronda ${round.roundNumber} de ${round.roundsTotal}: 1 tablero de ${PAIRS_PER_BOARD} parejas.`
          : `Ronda ${round.roundNumber} de ${round.roundsTotal}: ${round.questionsInRound} palabra${round.questionsInRound === 1 ? '' : 's'}.`
        : null
    return renderPage(
      <>
        {header}
        <Card className='overflow-hidden'>
          <CardContent className='space-y-4'>
            <p className='text-sm leading-relaxed'>{mode?.howTo}</p>
            <ul className='space-y-1.5 text-sm text-muted-foreground'>
              {isLightning ? (
                <li>⏱ {challenge.sessionSeconds ?? 60} segundos. Gana quien acierte más palabras.</li>
              ) : isPairs ? (
                <>
                  <li>
                    ⏱ {challenge.secondsPerQuestion} segundos por tablero · 2 tableros de {PAIRS_PER_BOARD} parejas.
                  </li>
                  <li>🏁 Gana quien una más parejas bien. Si empatan, gana quien haya tardado menos.</li>
                </>
              ) : (
                <li>
                  ⏱ {challenge.secondsPerQuestion} segundos por palabra · {challenge.totalQuestions ?? 10} palabras en
                  total.
                </li>
              )}
              {roundLabel && (
                <li>
                  🔁 {roundLabel} Después le toca a {firstName(names.rival)}.
                </li>
              )}
              {challenge.wordSource === 'mixed' && (
                <li>
                  🔀 Las mismas palabras para los dos: la mitad de tu baúl y la mitad del de {firstName(names.rival)}.
                </li>
              )}
              {challenge.kind === 'write' && (
                <li className='flex gap-1.5'>
                  <KeyboardIcon className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                  <span>
                    Las tildes y letras especiales cuentan. Pon el teclado de {config.targetLang} en tu móvil antes de
                    empezar.
                  </span>
                </li>
              )}
              {challenge.kind === 'listen' && <li>🔊 Sube el volumen.</li>}
              {challenge.kind === 'speak' && <li>🎙️ Te pediremos permiso para usar el micrófono.</li>}
            </ul>
            {micMessage && (
              <p className='rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200'>
                {micMessage}
              </p>
            )}
            <Button type='button' size='lg' className='w-full' disabled={starting} onClick={() => void start()}>
              {starting && <Loader2Icon className='mr-2 h-4 w-4 animate-spin' />}
              {resuming ? 'Continuar' : 'Empezar'}
            </Button>
          </CardContent>
        </Card>
      </>,
    )
  }

  if (phase === 'round_end') {
    return renderPage(
      <>
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Ronda terminada</CardTitle>
            <CardDescription>
              {roundCanContinue
                ? `${firstName(names.rival)} ya terminó sus palabras: puedes seguir con tu siguiente ronda.`
                : `Ahora le toca a ${firstName(names.rival)}. Te avisaremos cuando vuelva a ser tu turno.`}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {scoreBoxes(true)}
            <div className='flex flex-wrap gap-2'>
              {roundCanContinue && (
                <Button type='button' disabled={starting} onClick={() => void start()}>
                  Siguiente ronda
                </Button>
              )}
              {backButton}
            </div>
          </CardContent>
        </Card>
      </>,
    )
  }

  if (phase === 'finished') {
    const myScore = review?.me.correct ?? progress?.correct ?? 0
    const rivalScore = review?.rival.correct ?? progress?.rivalCorrect ?? 0
    const completed = challenge.status === 'completed'
    const rivalKnown = completed || Boolean(review?.rival.done)
    const won = completed && challenge.winnerUserId === state.me.userId
    const draw = completed && challenge.winnerUserId === null
    const title = completed
      ? draw
        ? '¡Empate!'
        : won
          ? '¡Has ganado!'
          : `Ha ganado ${firstName(names.rival)}`
      : challenge.status === 'in_progress'
        ? '¡Has terminado!'
        : 'Desafío terminado'
    const subtitle =
      !completed && challenge.status === 'in_progress'
        ? `Ahora falta ${firstName(names.rival)}. Te avisaremos con el resultado.`
        : null
    const rivalWordsToAdd = reviewItems.filter((item) => canAdd(item) === 'add').length

    return renderPage(
      <>
        {header}
        <Card className='mb-4 overflow-hidden'>
          <CardContent className='text-center'>
            {completed && (won || draw) && (
              <TrophyIcon
                className={`mx-auto mb-2 h-10 w-10 ${won ? 'text-amber-400' : 'text-muted-foreground'}`}
              />
            )}
            <p className='font-serif text-2xl font-semibold'>{title}</p>
            {subtitle && <p className='mt-1 text-sm text-muted-foreground'>{subtitle}</p>}
            <div className='mt-4 grid grid-cols-2 gap-2'>
              <div
                className={`rounded-xl border p-3 ${won ? 'border-amber-400/60 bg-amber-400/10' : 'bg-muted/20'}`}
              >
                <p className='text-xs text-muted-foreground'>Tú</p>
                <p className='font-serif text-3xl'>{myScore}</p>
                <p className='text-[11px] text-muted-foreground'>aciertos</p>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  completed && !won && !draw ? 'border-amber-400/60 bg-amber-400/10' : 'bg-muted/20'
                }`}
              >
                <p className='truncate text-xs text-muted-foreground'>{firstName(names.rival)}</p>
                <p className='font-serif text-3xl'>{rivalKnown ? rivalScore : '…'}</p>
                <p className='text-[11px] text-muted-foreground'>{rivalKnown ? 'aciertos' : 'jugando'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {reviewItems.length > 0 && (
          <div className='mb-4 space-y-2'>
            <div className='flex items-end justify-between gap-2 px-1'>
              <p className='text-sm font-medium'>Tus palabras</p>
              {rivalWordsToAdd > 0 && (
                <p className='text-right text-xs text-muted-foreground'>
                  {rivalWordsToAdd} palabra{rivalWordsToAdd === 1 ? '' : 's'} de {firstName(names.rival)} para tu
                  baúl
                </p>
              )}
            </div>
            <ReviewList
              items={reviewItems}
              rivalFirstName={firstName(names.rival)}
              canAdd={canAdd}
              onAdd={(item) => setWordToAdd(item)}
            />
          </div>
        )}

        {backButton}

        <AddIcaSuggestionModal
          open={wordToAdd !== null}
          onOpenChange={(open) => {
            if (!open) setWordToAdd(null)
          }}
          suggestion={wordToAdd ? { word: wordToAdd.target, translation: wordToAdd.native, reason: '' } : null}
          config={config}
          cards={cards}
          setCards={setCards}
          onWordAdded={onWordAdded}
          onAdded={(word) => setAddedTargets((prev) => new Set(prev).add(normalizeComparable(word)))}
          title='Añadir al Baúl ICA'
          description={`Palabra del baúl de ${firstName(names.rival)}. Revísala, elige su frecuencia y guárdala.`}
        />
      </>,
    )
  }

  // ----- Pregunta y respuesta -----
  const current = phase === 'feedback' ? feedback?.question ?? null : question
  if (!current) {
    return renderPage(
      <div className='flex min-h-[40vh] items-center justify-center'>
        <Loader2Icon className='h-4 w-4 animate-spin text-muted-foreground' />
      </div>,
    )
  }

  const data = current.data
  const nativeLang = current.language.native || config.nativeLang
  const targetLang = current.language.target || config.targetLang
  const locked = phase === 'feedback' || submitting
  const isOptionKind = data.kind === 'choice' || data.kind === 'listen' || data.kind === 'cloze'

  return renderPage(
    <>
      {header}
      <div className='space-y-4'>
        {isLightning ? (
          <TimerBar remainingMs={sessionCountdown.remainingMs} fraction={sessionCountdown.fraction} />
        ) : phase === 'question' ? (
          <TimerBar remainingMs={questionCountdown.remainingMs} fraction={questionCountdown.fraction} />
        ) : (
          <div className='h-5' aria-hidden='true' />
        )}

        <QuestionPrompt
          data={data}
          nativeLang={nativeLang}
          targetLang={targetLang}
          onReplayAudio={() => {
            if (data.kind === 'listen') void speakAsync(data.audioText, targetLang)
          }}
        />

        {data.kind === 'pairs' &&
          (phase === 'feedback' && feedback?.pairs ? (
            <PairsResult
              words={data.words}
              options={data.options}
              result={feedback.pairs}
              timedOut={feedback.timedOut}
            />
          ) : (
            <PairsBoard
              words={data.words}
              options={data.options}
              targetLang={targetLang}
              nativeLang={nativeLang}
              disabled={locked}
              boardKey={current.index}
              onChange={(matches) => {
                pairMatchesRef.current = matches
              }}
              onComplete={(matches) => void submit({ matches })}
            />
          ))}

        {phase === 'feedback' && feedback && (data.kind === 'write' || data.kind === 'speak') && (
          <FeedbackCard
            isCorrect={feedback.isCorrect}
            timedOut={feedback.timedOut}
            reveal={feedback.reveal}
            myAnswer={feedback.response.text || feedback.response.transcripts?.[0] || null}
            kind={data.kind}
          />
        )}

        {isOptionKind && (
          <>
            <OptionsGrid
              options={data.options}
              disabled={locked}
              onPick={(index) => void submit({ optionIndex: index })}
              pickedIndex={phase === 'feedback' ? feedback?.response.optionIndex ?? null : null}
              correctIndex={phase === 'feedback' ? feedback?.reveal.correctOptionIndex ?? null : undefined}
            />
            {phase === 'feedback' && feedback && (
              <p
                className={`flex flex-wrap items-center justify-center gap-1.5 text-center text-sm font-semibold ${
                  feedback.isCorrect ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
                }`}
                role='status'
              >
                {feedback.isCorrect ? <CheckIcon className='h-4 w-4' /> : <XIcon className='h-4 w-4' />}
                {feedback.isCorrect
                  ? '¡Correcto!'
                  : feedback.timedOut
                    ? `Se acabó el tiempo · ${feedback.reveal.target} = ${feedback.reveal.native}`
                    : `${feedback.reveal.target} = ${feedback.reveal.native}`}
              </p>
            )}
            {phase === 'feedback' && feedback && data.kind === 'cloze' && feedback.reveal.phrase && (
              <div className='rounded-lg border bg-muted/20 px-3 py-2 text-center text-sm'>
                <p>{feedback.reveal.phrase}</p>
                {feedback.reveal.phraseTranslation && (
                  <p className='mt-0.5 text-xs text-muted-foreground'>{feedback.reveal.phraseTranslation}</p>
                )}
              </div>
            )}
          </>
        )}

        {data.kind === 'write' && phase === 'question' && (
          <>
            {isLightning && (
              // Hueco fijo: así la caja de escribir no se mueve al enseñar ✓ / ✗.
              <div className='flex h-8 items-center justify-center'>
                {flash && (
                  <p
                    key={flash.key}
                    className={`flex w-fit max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                      flash.ok
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-500/15 text-red-700 dark:text-red-300'
                    }`}
                    role='status'
                  >
                    {flash.ok ? (
                      <CheckIcon className='h-3.5 w-3.5 shrink-0' />
                    ) : (
                      <XIcon className='h-3.5 w-3.5 shrink-0' />
                    )}
                    <span className='truncate'>{flash.text}</span>
                  </p>
                )}
              </div>
            )}
            <WriteAnswerForm
              hint={data.hint}
              targetLang={targetLang}
              disabled={locked}
              onSubmit={(text) => void submit({ text })}
              onSkip={() => void submit({ text: '' })}
              submitLabel={isLightning ? 'Siguiente' : 'Comprobar'}
              autoFocusKey={current.index}
            />
          </>
        )}

        {data.kind === 'speak' && phase === 'question' && (
          <SpeakPanel
            status={submitting ? 'checking' : speakStatus}
            heard={heard}
            message={micMessage}
            disabled={locked}
            onRetry={() => void startListening()}
            onSkip={() => {
              cancelListenRef.current?.()
              void submit({ transcripts: [] })
            }}
          />
        )}

        {submitting && phase === 'question' && !isLightning && (
          <p className='flex items-center justify-center gap-2 text-xs text-muted-foreground'>
            <Loader2Icon className='h-3.5 w-3.5 animate-spin' />
            Comprobando…
          </p>
        )}
      </div>
    </>,
  )
}
