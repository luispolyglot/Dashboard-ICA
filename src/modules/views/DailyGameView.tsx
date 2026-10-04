import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckIcon, XIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  evaluatePairsBoard,
  evaluateResponse,
  type GeneratedQuestion,
} from '../../../supabase/functions/ica-challenges-center/engine.ts'
import {
  FeedbackCard,
  OptionsGrid,
  PairsBoard,
  PairsResult,
  QuestionPrompt,
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
import { listenOnce, speakAsync, stopSpeaking, unlockChallengeAudio } from '../components/NotaDesafiante/challengeEngine'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  buildDailyGame,
  DAILY_GAME_MIN_WORDS,
  DAILY_GAME_PASS,
  DAILY_GAME_QUESTIONS,
  DAILY_GAME_SECONDS,
  dailyGameModeFor,
  isDailyGamePassed,
  saveDailyGameResult,
  toEngineCards,
  useDailyGame,
  type DailyGameKind,
  type DailyGameMode,
} from '../game/dailyGame'
import type { AppConfig, IcaChallengePairsResult, Lexicard } from '../types'
import { todayKey } from '../utils'
import { t } from '@/i18n'

const PAIRS_PER_BOARD = 5
const FEEDBACK_MS_CORRECT = 1000
const FEEDBACK_MS_WRONG = 2000
/** Fallo en Escritura o Habla: da tiempo a oír cómo se dice la palabra. */
const FEEDBACK_MS_WRONG_SPOKEN = 3400

type Feedback = {
  isCorrect: boolean
  timedOut: boolean
  myAnswer: string | null
  pairs: IcaChallengePairsResult | null
}

type Played = { question: GeneratedQuestion; isCorrect: boolean; myAnswer: string | null }

type Phase = 'intro' | 'question' | 'feedback' | 'finished'

function scoreMessage(correct: number, total: number): string {
  if (correct < DAILY_GAME_PASS) return t('¡Casi!')
  if (correct === total) return t('¡Perfecto!')
  if (correct / total >= 0.7) return t('¡Muy bien!')
  if (correct / total >= 0.4) return t('¡Buen trabajo!')
  return t('¡Sigue practicando!')
}

/**
 * RETO DEL DÍA: minijuego de 10 palabras con tu Baúl ICA, después del cofre del ciclo.
 * Mismas piezas y motor que Desafíos ICA, pero sin rival. Cuenta como hecho con 5 aciertos.
 */
export function DailyGameView({ config, cards }: { config: AppConfig; cards: Lexicard[] }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { result: todayResult } = useDailyGame(user?.id)
  const todayMode = dailyGameModeFor()
  const { muted, toggleMuted, playAnswer } = useChallengeSounds()
  const engineCards = useMemo(() => toEngineCards(cards, user?.id || 'me'), [cards, user?.id])
  const [game, setGame] = useState<{ mode: DailyGameMode; questions: GeneratedQuestion[] } | null>(null)
const [phase, setPhase] = useState<Phase>('intro')
const [index, setIndex] = useState(0)
const [played, setPlayed] = useState<Played[]>([])
const [feedback, setFeedback] = useState<Feedback | null>(null)
const [endsAt, setEndsAt] = useState<number | null>(null)
const pairMatchesRef = useRef<Array<number | null>>([])
const timersRef = useRef<number[]>([])
const stopConfettiRef = useRef<(() => void) | null>(null)

  const available = useMemo(
    () => buildDailyGame(todayMode, engineCards, config.targetLang),
    // Solo se decide al entrar (no cada vez que cambian las tarjetas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayMode.kind, engineCards.length, config.targetLang],
  )

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id))
      stopConfettiRef.current?.()
      stopSpeaking()
    },
    [],
  )

  const kind: DailyGameKind = game?.mode.kind ?? todayMode.kind
  const isPairs = kind === 'pairs'
  const question = game?.questions[index] ?? null
  const totalMs = DAILY_GAME_SECONDS[kind] * 1000
  const correctCount = played.filter((item) => item.isCorrect).length

  const startQuestion = useCallback(
    (nextIndex: number, current: { mode: DailyGameMode; questions: GeneratedQuestion[] }) => {
      setIndex(nextIndex)
      setFeedback(null)
      pairMatchesRef.current = []
      setPhase('question')
      setEndsAt(Date.now() + DAILY_GAME_SECONDS[current.mode.kind] * 1000)
      const next = current.questions[nextIndex]
      if (next?.question.kind === 'listen') void speakAsync(next.question.audioText, config.targetLang)
    },
    [config.targetLang],
  )

  const finish = useCallback(
    (allPlayed: Played[], current: { mode: DailyGameMode; questions: GeneratedQuestion[] }) => {
      const correct = allPlayed.filter((item) => item.isCorrect).length
      setPhase('finished')
      setEndsAt(null)
      void saveDailyGameResult(user?.id, {
        day: todayKey(),
        kind: current.mode.kind,
        correct,
        total: current.questions.length,
        finishedAt: Date.now(),
      }).catch(() => toast.error(t('No se pudo guardar el resultado del Reto del día.')))
      if (correct / current.questions.length >= 0.7) stopConfettiRef.current = launchWinConfetti()
    },
    [user?.id],
  )

  const advance = useCallback(
    (allPlayed: Played[], step: number, waitMs: number) => {
      if (!game) return
      const id = window.setTimeout(() => {
        const nextIndex = index + step
        if (nextIndex >= game.questions.length) finish(allPlayed, game)
        else startQuestion(nextIndex, game)
      }, waitMs)
      timersRef.current.push(id)
    },
    [finish, game, index, startQuestion],
  )

  const answerSingle = (
    response: { optionIndex?: number | null; text?: string | null; transcripts?: string[] | null },
    timedOut = false,
  ) => {
    if (!game || !question || phase !== 'question') return
    cancelListenRef.current?.()
    cancelListenRef.current = null
    const isCorrect =
      !timedOut &&
      evaluateResponse({ kind: question.kind, answer: question.answer, response, language: config.targetLang })
    const myAnswer =
      typeof response.optionIndex === 'number' && 'options' in question.question
        ? question.question.options[response.optionIndex] ?? null
        : response.transcripts?.[0] ?? response.text ?? null
    playAnswer(isCorrect)
    const nextPlayed = [...played, { question, isCorrect, myAnswer }]
    setPlayed(nextPlayed)
    setFeedback({ isCorrect, timedOut, myAnswer, pairs: null })
    setPhase('feedback')
    setEndsAt(null)
    // Fallo en Escritura o Habla: una voz dice cómo se dice de verdad la palabra (Luis, 3 oct).
    const sayAnswer = !isCorrect && (question.kind === 'write' || question.kind === 'speak')
    if (sayAnswer) {
      const word = question.answer.target
      window.setTimeout(() => void speakAsync(word, config.targetLang), 450)
    }
    advance(nextPlayed, 1, isCorrect ? FEEDBACK_MS_CORRECT : sayAnswer ? FEEDBACK_MS_WRONG_SPOKEN : FEEDBACK_MS_WRONG)
  }

  const answerBoard = (matches: Array<number | null>) => {
    if (!game || phase !== 'question') return
    const board = game.questions.slice(index, index + PAIRS_PER_BOARD)
    const result = evaluatePairsBoard({ answers: board.map((item) => item.answer), matches, inTime: true })
    const options = board[0]?.question.kind === 'pairs' ? board[0].question.options : []
    const boardPlayed = board.map((item, position) => ({
      question: item,
      isCorrect: result.correct[position],
      myAnswer: result.chosen[position] !== null ? options[result.chosen[position] as number] ?? null : null,
    }))
    const allCorrect = result.correct.every(Boolean)
    playAnswer(allCorrect)
    const nextPlayed = [...played, ...boardPlayed]
    setPlayed(nextPlayed)
    setFeedback({ isCorrect: allCorrect, timedOut: false, myAnswer: null, pairs: result })
    setPhase('feedback')
    setEndsAt(null)
  }

  const { remainingMs, fraction } = useCountdown({
    endsAt: phase === 'question' ? endsAt : null,
    totalMs,
    paused: phase !== 'question',
    onExpire: () => {
      if (isPairs) answerBoard(pairMatchesRef.current.length ? pairMatchesRef.current : [])
      else if (question?.kind === 'speak') {
        // Si se acaba mientras habla, se corrige lo que se haya entendido.
        const text = heardRef.current.trim()
        answerSingle(text ? { transcripts: [text] } : {}, !text)
      } else answerSingle({}, true)
    },
  })

  // Habla: el micrófono se abre solo con cada palabra nueva.
  const [speakStatus, setSpeakStatus] = useState<'starting' | 'listening' | 'checking' | 'idle'>('idle')
  const [heard, setHeard] = useState('')
  const [micMessage, setMicMessage] = useState<string | null>(null)
  const heardRef = useRef('')
  const cancelListenRef = useRef<(() => void) | null>(null)
  const answerRef = useRef(answerSingle)
  answerRef.current = answerSingle

  const startListening = useCallback(async () => {
    if (question?.kind !== 'speak' || !endsAt) return
    const remaining = endsAt - Date.now()
    if (remaining < 900) return
    cancelListenRef.current?.()
    setMicMessage(null)
    setSpeakStatus('starting')
    const session = listenOnce(config.targetLang, {
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
    if (outcome.status === 'cancelled') return
    cancelListenRef.current = null
    if (outcome.status === 'heard') {
      heardRef.current = outcome.transcript
      setHeard(outcome.transcript)
      setSpeakStatus('checking')
      answerRef.current({ transcripts: outcome.candidates.length ? outcome.candidates : [outcome.transcript] })
      return
    }
    setSpeakStatus('idle')
    setMicMessage(
      outcome.status === 'error' ? t(outcome.message) : t('No te he oído bien. Toca «Repetir» y dila otra vez.'),
    )
  }, [config.targetLang, endsAt, question?.kind])

  useEffect(() => {
    if (phase !== 'question' || question?.kind !== 'speak') return
    heardRef.current = ''
    setHeard('')
    setMicMessage(null)
    const id = window.setTimeout(() => void startListening(), 250)
    return () => {
      window.clearTimeout(id)
      cancelListenRef.current?.()
      cancelListenRef.current = null
    }
    // Solo al aparecer cada palabra nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index])

  const start = () => {
    if (!available) return
    unlockChallengeAudio()
    stopConfettiRef.current?.()
    setGame(available)
    setPlayed([])
    startQuestion(0, available)
  }

  // ------------------------------------------------------------------ pantallas

  const shownMode = game?.mode ?? available?.mode ?? todayMode
  const ModeIcon = shownMode.icon

  if (phase === 'intro' || !game || !question) {
    return (
      <section className='mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-6 pb-28 text-center lg:py-12'>
        <span
          className='flex size-24 items-center justify-center rounded-[30px] bg-primary text-primary-foreground'
          style={{ boxShadow: '0 6px 0 color-mix(in oklab, var(--primary) 70%, black)' }}
        >
          <ModeIcon className='size-11' strokeWidth={2.4} aria-hidden='true' />
        </span>
        <p className='mt-5 mb-0 text-xs font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>{t('Reto del día')}</p>
        <h1 className='m-0 font-display tracking-tight text-3xl font-extrabold'>{t(shownMode.name)}</h1>
        <p className='mt-2 max-w-sm text-base font-semibold text-muted-foreground'>
          {t(shownMode.pitch)} {t('{n} palabras de tu Baúl ICA, tú solo contra el reloj.', { n: DAILY_GAME_QUESTIONS })}{' '}
          {t('Mínimo {n} correctas para completarlo.', { n: DAILY_GAME_PASS })}
        </p>

        {todayResult ? (
          isDailyGamePassed(todayResult) ? (
            <p
              className='mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-extrabold'
              style={{ background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }}
            >
              <CheckIcon className='size-4' strokeWidth={3} aria-hidden='true' />
              {t('Completado: {correct} de {total}', { correct: todayResult.correct, total: todayResult.total })}
            </p>
          ) : (
            <p
              className='mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-extrabold'
              style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
            >
              {t('Hoy: {correct} de {total} · mínimo {n}', {
                correct: todayResult.correct,
                total: todayResult.total,
                n: DAILY_GAME_PASS,
              })}
            </p>
          )
        ) : null}

        {available ? (
          <Button type='button' className='mt-8 h-14 w-full max-w-sm rounded-2xl text-lg font-extrabold' onClick={start}>
            {todayResult ? (isDailyGamePassed(todayResult) ? t('Jugar otra vez') : t('Intentarlo otra vez')) : t('¡Empezar!')}
          </Button>
        ) : (
          <div className='mt-8 w-full max-w-sm'>
            <p className='text-sm font-semibold text-muted-foreground'>
              Necesitas al menos {DAILY_GAME_MIN_WORDS} palabras en tu Baúl ICA para jugarlo (tienes {cards.length}).
            </p>
            <Button type='button' className='mt-3 h-12 w-full rounded-2xl font-extrabold' onClick={() => navigate(DASHBOARD_ROUTES.newIcaWords)}>
              {t('Añadir palabras')}
            </Button>
          </div>
        )}
        <Button type='button' variant='ghost' className='mt-2 font-bold' onClick={() => navigate(DASHBOARD_ROUTES.home)}>
          {t('Volver al inicio')}
        </Button>
      </section>
    )
  }

  if (phase === 'finished') {
    const total = game.questions.length
    const misses = played.filter((item) => !item.isCorrect)
    const passed = correctCount >= DAILY_GAME_PASS
    return (
      <section className='mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-8 pb-28 text-center lg:py-12'>
        <p className='m-0 text-xs font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>{t('Reto del día · {name}', { name: t(game.mode.name) })}</p>
        <h1 className='m-0 mt-1 font-display tracking-tight text-4xl font-extrabold'>{scoreMessage(correctCount, total)}</h1>
        <div
          className='mt-5 flex items-baseline gap-2 rounded-3xl px-6 py-4'
          style={{
            background: !passed ? 'var(--ica-bad-soft)' : correctCount === total ? 'var(--ica-gold-soft)' : 'var(--ica-ok-soft)',
          }}
        >
          <span
            className='text-6xl leading-none font-black tabular-nums'
            style={{
              color: !passed ? 'var(--ica-bad-ink)' : correctCount === total ? 'var(--ica-gold-ink)' : 'var(--ica-ok-ink)',
            }}
          >
            {correctCount}
          </span>
          <span className='text-xl font-extrabold text-muted-foreground'>de {total}</span>
        </div>
        <p className='mt-3 mb-0 text-base font-bold text-balance text-muted-foreground'>
          {passed ? t('Reto del día completado.') : t('Mínimo {n} correctas para completarlo.', { n: DAILY_GAME_PASS })}
        </p>

        {misses.length > 0 ? (
          <div className='mt-6 w-full text-left'>
            <p className='mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Para repasar')}</p>
            <ul className='divide-y-2 rounded-2xl border-2'>
              {misses.map((item, position) => (
                <li key={`${item.question.answer.cardId}-${position}`} className='flex items-center gap-3 px-3 py-2.5'>
                  <span
                    className='flex size-7 shrink-0 items-center justify-center rounded-full'
                    style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
                  >
                    <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
                  </span>
                  <span className='min-w-0 flex-1 font-bold break-words'>
                    {item.question.answer.target}
                    <span className='font-semibold text-muted-foreground'> · {item.question.answer.native}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {passed ? (
          <>
            <Button type='button' className='mt-8 h-14 w-full max-w-sm rounded-2xl text-lg font-extrabold' onClick={() => navigate(DASHBOARD_ROUTES.home)}>
              {t('Seguir')}
            </Button>
            <Button type='button' variant='ghost' className='mt-2 font-bold' onClick={start}>
              {t('Jugar otra vez')}
            </Button>
          </>
        ) : (
          <>
            <Button type='button' className='mt-8 h-14 w-full max-w-sm rounded-2xl text-lg font-extrabold' onClick={start}>
              {t('Intentarlo otra vez')}
            </Button>
            <Button type='button' variant='ghost' className='mt-2 font-bold' onClick={() => navigate(DASHBOARD_ROUTES.home)}>
              {t('Volver al inicio')}
            </Button>
          </>
        )}
      </section>
    )
  }

  const data = question.question
  const answeredCount = played.length
  const reveal = {
    target: question.answer.target,
    native: question.answer.native,
    correctOptionIndex: question.answer.correctOptionIndex,
    phrase: question.answer.phrase,
    phraseTranslation: question.answer.phraseTranslation,
  }

  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-3 pb-28 lg:py-8'>
      {/* Barra de arriba: salir, progreso y sonido */}
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={() => navigate(DASHBOARD_ROUTES.home)}
          className='flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted'
          aria-label={t('Salir del reto')}
        >
          <XIcon className='size-6' strokeWidth={2.6} />
        </button>
        <div className='h-4 flex-1 overflow-hidden rounded-full bg-muted'>
          <div
            className='relative h-full rounded-full bg-primary transition-[width] duration-500'
            style={{ width: `${Math.max(4, (answeredCount / game.questions.length) * 100)}%` }}
          >
            <span className='absolute inset-x-2 top-[3px] h-1 rounded-full bg-white/35' />
          </div>
        </div>
        <SoundToggleButton muted={muted} onToggle={toggleMuted} />
      </div>

      <TimerBar remainingMs={phase === 'question' ? remainingMs : null} fraction={fraction} />

      {data.kind === 'pairs' ? (
        phase === 'feedback' && feedback?.pairs ? (
          <>
            <PairsResult words={data.words} options={data.options} result={feedback.pairs} timedOut={false} />
            <Button
              type='button'
              className='h-14 rounded-2xl text-lg font-extrabold'
              onClick={() => {
                const nextIndex = index + PAIRS_PER_BOARD
                if (nextIndex >= game.questions.length) finish(played, game)
                else startQuestion(nextIndex, game)
              }}
            >
              {index + PAIRS_PER_BOARD >= game.questions.length ? t('Ver resultado') : t('Siguiente tablero')}
            </Button>
          </>
        ) : (
          <PairsBoard
            words={data.words}
            options={data.options}
            targetLang={config.targetLang}
            nativeLang={config.nativeLang}
            disabled={phase !== 'question'}
            boardKey={index}
            onChange={(matches) => {
              pairMatchesRef.current = matches
            }}
            onComplete={answerBoard}
          />
        )
      ) : (
        <>
          <QuestionPrompt
            data={data}
            nativeLang={config.nativeLang}
            targetLang={config.targetLang}
            onReplayAudio={() => {
              if (data.kind === 'listen') void speakAsync(data.audioText, config.targetLang)
            }}
          />
          {phase === 'feedback' && feedback ? (
            <FeedbackCard
              isCorrect={feedback.isCorrect}
              timedOut={feedback.timedOut}
              reveal={reveal}
              myAnswer={feedback.myAnswer}
              kind={data.kind}
            />
          ) : data.kind === 'write' ? (
            <WriteAnswerForm
              hint={data.hint}
              targetLang={config.targetLang}
              disabled={phase !== 'question'}
              onSubmit={(text) => answerSingle({ text })}
              onSkip={() => answerSingle({ text: '' })}
              autoFocusKey={index}
            />
          ) : data.kind === 'speak' ? (
            <SpeakPanel
              status={speakStatus}
              heard={heard}
              message={micMessage}
              disabled={phase !== 'question'}
              onRetry={() => void startListening()}
              onSkip={() => answerSingle({ transcripts: [] })}
            />
          ) : 'options' in data ? (
            <OptionsGrid
              options={data.options}
              disabled={phase !== 'question'}
              onPick={(optionIndex) => answerSingle({ optionIndex })}
            />
          ) : null}
        </>
      )}

      <p className='text-center text-xs font-bold text-muted-foreground'>
        {correctCount} {correctCount === 1 ? 'acierto' : 'aciertos'} · {Math.min(answeredCount + (isPairs ? 0 : 1), game.questions.length)} de{' '}
        {game.questions.length}
      </p>
    </section>
  )
}
