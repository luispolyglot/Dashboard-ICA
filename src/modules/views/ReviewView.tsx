import { useEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getUiLang, langName, t, tn } from '@/i18n'
import {
  GOAL,
  REVIEW_MODE_OPTIONS,
  getImportance,
} from '../constants'
import { GlobalReviewGoalBadge } from '../components/GlobalReviewGoalBadge'
import { ProgressBar } from '../components/ProgressBar'
import {
  getReviewModeMinimumWords,
  REVIEW_PLAY_STYLE_CORRECT_GOAL,
  getReviewRoundSizeByStyle,
  type ReviewPlayStyle,
} from '../review/playStyle'
import { saveData, updateWord } from '../services/storage'
import { recordReviewEvent } from '../services/reviewTracking'
import { prefetchSpeech, stopTTS } from '../services/tts'
import { buildReviewRound, getStreak, todayKey, updateCardAfterReview } from '../utils'
import type { AppConfig, Lexicard, ReviewMode } from '../types'
import {
  BlocksIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  LightbulbIcon,
  PackagePlusIcon,
  RotateCcwIcon,
  SproutIcon,
  TargetIcon,
  XIcon,
} from 'lucide-react'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { FrequencyDot, FrequencyGlyph, SpeakWordButton, modeColors } from '../game/flashcardsUi'
import { CardsIcon, FlameIcon, TrophyIcon } from '../game/icons'
import { gameSfx } from '../game/sfx'
import { SoundToggleButton } from '../game/SoundToggleButton'
import { PronunciationHint } from '../pronunciation/PronunciationHint'
import { prefetchPronunciations } from '../pronunciation/pronunciation'
import { EmptyState, GamePage, GameProgress, Panel, Pill, tone, type Tone } from '../game/ui'
import { consumeLexicardBoosts } from '../services/lexicardBoost'

type ReviewViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
  mode: ReviewMode
  playStyle: ReviewPlayStyle
  pendingOnly: boolean
  confirmBeforeAnswer: boolean
  globalCorrectToday: number
  completedDays: string[]
  setCompletedDays: Dispatch<SetStateAction<string[]>>
  reviewSession: number
  startReviewSession: () => Promise<void>
  onWordAdded: () => Promise<unknown>
  onReviewAnswered: (knew: boolean) => Promise<void>
  onChooseMode: () => void
  onFinishPractice: () => void
}

/** Lo que se enseña en la franja de abajo tras responder (hasta pulsar «Continuar»). */
type AnswerFeedback = {
  knew: boolean
  card: Lexicard
  updated: Lexicard
  /** Tarjeta a la que se pasa al continuar (null = se queda o se acaba la ronda). */
  nextIndex: number | null
}

/** Icono grande en un cuadrado de color con canto (resultado de la ronda). */
function BigTile({ t, children }: { t: Tone; children: ReactNode }) {
  const colors = tone(t)
  return (
    <span
      className='flex size-24 items-center justify-center rounded-[1.75rem] text-white'
      style={{ background: colors.solid, boxShadow: `0 6px 0 ${colors.edge}` }}
    >
      {children}
    </span>
  )
}

/** Dato del resultado, en una caja de color al terminar la partida. */
function ResultStat({ t, label, value, icon }: { t: Tone; label: string; value: ReactNode; icon: ReactNode }) {
  const colors = tone(t)
  const darkText = t === 'fire' || t === 'gold'
  return (
    <div className='min-w-0 overflow-hidden rounded-2xl border-2' style={{ borderColor: colors.solid, background: colors.solid }}>
      <p
        className='m-0 truncate px-1 py-1 text-[11px] font-extrabold tracking-[0.06em] uppercase'
        style={{ color: darkText ? '#4a2600' : '#ffffff' }}
      >
        {label}
      </p>
      <div className='flex items-center justify-center gap-1.5 rounded-[14px] bg-card px-1 py-3'>
        {icon}
        <span className='text-2xl leading-none font-black whitespace-nowrap tabular-nums' style={{ color: colors.ink }}>
          {value}
        </span>
      </div>
    </div>
  )
}

/** Franja inferior tras responder: verde «¡Bien!» o roja con la respuesta correcta. */
function AnswerFeedbackBar({ feedback, onContinue }: { feedback: AnswerFeedback; onContinue: () => void }) {
  const colors = tone(feedback.knew ? 'ok' : 'bad')
  const continueRef = useRef<HTMLButtonElement>(null)

  const barRef = useRef<HTMLDivElement>(null)

  // El foco va a «Continuar»: con Intro o Espacio se sigue sin tocar el ratón.
  // La franja va DEBAJO de la tarjeta (no encima): se baja lo justo para verla entera.
  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true })
    const bar = barRef.current
    if (!bar) return
    // Solo se baja si «Continuar» quedaría tapado por el menú de abajo (o fuera de la pantalla).
    const margin = Number.parseFloat(window.getComputedStyle(bar).scrollMarginBottom) || 0
    if (bar.getBoundingClientRect().bottom + margin > window.innerHeight) {
      bar.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
  }, [])

  return (
    // Se mide la caja de fuera (sin animación): la de dentro aparece creciendo y, si se
    // midiera esa, parecería que ya se ve entera y no bajaría.
    <div ref={barRef} className='scroll-mb-28 md:scroll-mb-4'>
    <div
      role='status'
      aria-live='polite'
      className='ica-pop rounded-3xl border-2 p-4'
      style={{ background: colors.soft, borderColor: `color-mix(in oklab, ${colors.solid} 40%, transparent)` }}
    >
      <div className='flex items-start gap-3'>
        <span
          className='flex size-12 shrink-0 items-center justify-center rounded-full text-white'
          style={{ background: colors.solid, boxShadow: `0 3px 0 ${colors.edge}` }}
        >
          {feedback.knew ? (
            <CheckIcon className='size-7' strokeWidth={3.4} aria-hidden='true' />
          ) : (
            <XIcon className='size-7' strokeWidth={3.4} aria-hidden='true' />
          )}
        </span>
        <div className='min-w-0 flex-1' style={{ color: colors.ink }}>
          {feedback.knew ? (
            <>
              <p className='m-0 text-2xl leading-tight font-black'>{t('¡Bien!')}</p>
              <p className='m-0 mt-0.5 text-sm font-bold'>
                {t('Racha de esta palabra: {n}', { n: feedback.updated.streak })}
              </p>
            </>
          ) : (
            // The answer is already on the card above, so it is not repeated here (Luis, 6 Oct).
            <>
              <p className='m-0 text-2xl leading-tight font-black'>{t('A repasar')}</p>
              <p className='m-0 mt-0.5 text-sm font-bold'>{t('Esta palabra volverá pronto para que la repases.')}</p>
            </>
          )}
        </div>
      </div>
      <Button
        ref={continueRef}
        type='button'
        size='xl'
        variant={feedback.knew ? 'success' : 'danger'}
        className='mt-4 w-full'
        onClick={onContinue}
      >
        {t('Continuar')}
      </Button>
    </div>
    </div>
  )
}

export function ReviewView({
  cards,
  setCards,
  config,
  mode,
  playStyle,
  pendingOnly,
  confirmBeforeAnswer,
  globalCorrectToday,
  completedDays,
  setCompletedDays,
  reviewSession,
  startReviewSession,
  onWordAdded,
  onReviewAnswered,
  onChooseMode,
  onFinishPractice,
}: ReviewViewProps) {
  const isGoalStyle = playStyle === 'goal'
  const [roundCards, setRoundCards] = useState<Lexicard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [answerResults, setAnswerResults] = useState<
    Array<'correct' | 'wrong'>
  >([])
  const [busy, setBusy] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [answeredByIndex, setAnsweredByIndex] = useState<
    Array<boolean | undefined>
  >([])
  const [pendingAnswer, setPendingAnswer] = useState<boolean | null>(null)
  const [showExample, setShowExample] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)
  const [extractWordsModalOpen, setExtractWordsModalOpen] = useState(false)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const reviewPool = pendingOnly
    ? cards.filter((card) => (card.streak || 0) === 0)
    : cards
  const pendingPool = cards.filter((card) => (card.streak || 0) === 0)

  const activeMode =
    REVIEW_MODE_OPTIONS.find((option) => option.key === mode) ||
    REVIEW_MODE_OPTIONS[0]
  const replayMinimumRequired = getReviewModeMinimumWords(playStyle)
  const replayEligibleCount =
    mode === 'mixed'
      ? pendingPool.length
      : pendingPool.filter((card) => card.importance === mode).length
  const canPlayAnotherRound =
    !pendingOnly || replayEligibleCount >= replayMinimumRequired

  const roundFeedback: { icon: ReactNode; tone: Tone; title: string; message: string } = (() => {
    if (correct <= 2) {
      return {
        icon: (
          <BigTile t='i'>
            <BlocksIcon className='size-12' strokeWidth={2.4} aria-hidden='true' />
          </BigTile>
        ),
        tone: 'i',
        title: t('Base en construcción'),
        message: t('Hoy tocaba sembrar. Lo importante es seguir, no hacerlo perfecto.'),
      }
    }

    if (correct <= 5) {
      return {
        icon: (
          <BigTile t='ok'>
            <SproutIcon className='size-12' strokeWidth={2.4} aria-hidden='true' />
          </BigTile>
        ),
        tone: 'ok',
        title: t('Buen avance'),
        message: t('Ya hay progreso real. En la siguiente ronda esto sube rápido.'),
      }
    }

    if (correct <= 8) {
      return {
        icon: <FlameIcon size={104} />,
        tone: 'fire',
        title: t('Muy buena ronda'),
        message: t('Estás consolidando vocabulario. Te queda muy poco para dominarla.'),
      }
    }

    return {
      icon: <TrophyIcon size={104} />,
      tone: 'gold',
      title: t('Ronda excelente'),
      message: t('Nivel altísimo. Estás en modo imparable.'),
    }
  })()

  useEffect(() => {
    setRoundCards(
      buildReviewRound(
        reviewPool,
        mode,
        getReviewRoundSizeByStyle(playStyle, reviewPool.length),
        reviewSession,
        cards.length,
        { ignoreNewCardLimits: pendingOnly },
      ),
    )
    setCurrentIndex(0)
    setCorrect(0)
    setAnswerResults([])
    setAnsweredByIndex([])
    setCompleted(false)
    setFlipped(false)
    setPendingAnswer(null)
    setShowExample(false)
    setShowExampleTranslation(false)
    setFeedback(null)
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
    }
  }, [cards.length, mode, playStyle, reviewSession, pendingOnly])

  useEffect(() => {
    setShowExample(false)
    setShowExampleTranslation(false)
  }, [currentIndex, flipped])

  useEffect(() => {
    startReviewSession().catch(() => undefined)
  }, [startReviewSession])

  const showResults = completed && !feedback
  const showSaving = finishing && !feedback

  // Sonido de celebración al ver el resultado de la ronda.
  useEffect(() => {
    if (showResults) gameSfx.celebrate()
  }, [showResults])

  const currentCard = roundCards[currentIndex]

  // La pronunciación de toda la ronda se pide al empezar, para que ya esté al girar cada tarjeta.
  useEffect(() => {
    prefetchPronunciations(
      roundCards.map((card) => ({
        word: card.target,
        targetLang: card.targetLang || config.targetLang,
        nativeLang: card.nativeLang || config.nativeLang,
      })),
    )
  }, [roundCards, config.targetLang, config.nativeLang])

  // The voice of this card and the next two is prepared ahead, so «Listen» does not wait.
  useEffect(() => {
    for (const card of roundCards.slice(currentIndex, currentIndex + 3)) {
      void prefetchSpeech(card.target, config.targetLang || 'Inglés')
    }
  }, [roundCards, currentIndex, config.targetLang])
  const roundTotal = isGoalStyle
    ? REVIEW_PLAY_STYLE_CORRECT_GOAL
    : Math.max(roundCards.length, 1)
  const importance = currentCard ? getImportance(currentCard.importance) : null
  const isFailed = currentCard ? (currentCard.streak || 0) === 0 : false
  const isCurrentAnswered = answeredByIndex[currentIndex] !== undefined

  const contiguousAnsweredCount = (() => {
    let count = 0
    while (count < roundCards.length && answeredByIndex[count] !== undefined) {
      count += 1
    }
    return count
  })()

  const maxNavigableIndex = Math.min(
    contiguousAnsweredCount,
    Math.max(roundCards.length - 1, 0),
  )
  const canGoBack = currentIndex > 0
  const canGoForward = currentIndex < maxNavigableIndex

  const handleAnswer = async (knew: boolean): Promise<void> => {
    if (busy || !currentCard || isCurrentAnswered || feedback) return

    const sourceCard =
      cards.find((card) => card.id === currentCard.id) || currentCard

    setBusy(true)
    stopTTS()
    setShowExample(false)
    setShowExampleTranslation(false)

    const reviewed = updateCardAfterReview(sourceCard, knew, reviewSession)
    // A boosted word (Potenciar) has one flashcards round less to go.
    const boostedNow = (sourceCard.boostFlash ?? 0) > 0
    const updated = boostedNow ? { ...reviewed, boostFlash: (sourceCard.boostFlash ?? 0) - 1 } : reviewed
    if (boostedNow) void consumeLexicardBoosts([sourceCard.id], 'flash')
    const nextCards = cards.map((card) =>
      card.id === updated.id ? updated : card,
    )
    const nextCorrect = knew ? correct + 1 : correct
    const nextAnsweredByIndex = [...answeredByIndex]
    nextAnsweredByIndex[currentIndex] = knew
    const nextAnswerResults: Array<'correct' | 'wrong'> = isGoalStyle
      ? answerResults
      : [...answerResults, knew ? 'correct' : 'wrong']
    const answeredAllCards = roundCards.every(
      (_, index) => nextAnsweredByIndex[index] !== undefined,
    )
    const isLastCard = currentIndex >= roundCards.length - 1
    const reachedCorrectGoal = nextCorrect >= REVIEW_PLAY_STYLE_CORRECT_GOAL
    const shouldComplete = isGoalStyle
      ? reachedCorrectGoal || answeredAllCards
      : isLastCard

    // A qué tarjeta se pasa al pulsar «Continuar».
    let nextIndex: number | null = null
    if (!shouldComplete) {
      if (isGoalStyle) {
        const nextUnansweredIndex = roundCards.findIndex(
          (_, index) =>
            index > currentIndex && nextAnsweredByIndex[index] === undefined,
        )
        if (nextUnansweredIndex >= 0) {
          nextIndex = nextUnansweredIndex
        } else {
          const fallbackUnansweredIndex = roundCards.findIndex(
            (_, index) => nextAnsweredByIndex[index] === undefined,
          )
          if (fallbackUnansweredIndex >= 0) {
            nextIndex = fallbackUnansweredIndex
          }
        }
      } else {
        nextIndex = currentIndex + 1
      }
    }

    if (knew) gameSfx.correct()
    else gameSfx.wrong()
    setFeedback({ knew, card: sourceCard, updated, nextIndex })

    if (shouldComplete) {
      setFinishing(true)
    }

    setCorrect(nextCorrect)
    if (!isGoalStyle) {
      setAnswerResults(nextAnswerResults)
    }
    setAnsweredByIndex(nextAnsweredByIndex)
    setCards(nextCards)

    try {
      await updateWord(updated)
      await recordReviewEvent({
        previousCard: sourceCard,
        nextCard: updated,
        knew,
      })
      await onReviewAnswered(knew)

      const reachedDailyReviewGoal =
        globalCorrectToday + (knew ? 1 : 0) >= REVIEW_PLAY_STYLE_CORRECT_GOAL
      if (reachedDailyReviewGoal) {
        const dayKey = todayKey()
        if (!completedDays.includes(dayKey)) {
          const nextCompletedDays = Array.from(
            new Set([...completedDays, dayKey]),
          )
          setCompletedDays(nextCompletedDays)
          await saveData('dashboard-ICA-completed', nextCompletedDays)
        }
      }

      if (shouldComplete) {
        setCompleted(true)
      }
    } finally {
      setBusy(false)
      setFinishing(false)
    }
  }

  /** Cierra la franja de respuesta y pasa a la siguiente tarjeta (o al resultado). */
  const handleContinue = () => {
    if (!feedback) return
    const { nextIndex } = feedback
    setFeedback(null)
    setFlipped(false)
    if (nextIndex !== null) {
      setCurrentIndex(nextIndex)
    }
  }

  const flipCard = () => {
    if (flipped || !currentCard) return
    gameSfx.tap()
    setFlipped(true)
  }

  const chooseAnswer = (knew: boolean) => {
    if (confirmBeforeAnswer) {
      setPendingAnswer(knew)
      return
    }
    void handleAnswer(knew)
  }

  // Atajos de teclado: Espacio/Intro gira la tarjeta y continúa; 1 = No la sabía, 2 = ¡La sabía!
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined)
  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (pendingAnswer !== null || extractWordsModalOpen || showResults || showSaving || !currentCard) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      if (event.key === ' ' || event.key === 'Enter') {
        // Sobre un botón, el propio botón ya responde a la tecla.
        if (tag === 'BUTTON' || tag === 'A') return
        if (feedback) {
          event.preventDefault()
          handleContinue()
        } else if (!flipped) {
          event.preventDefault()
          flipCard()
        }
        return
      }
      if ((event.key === '1' || event.key === '2') && flipped && !feedback && !isCurrentAnswered && !busy) {
        event.preventDefault()
        chooseAnswer(event.key === '2')
      }
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  if (!currentCard && !completed) {
    return (
      <GamePage className='justify-center'>
        <EmptyState
          icon={<CardsIcon size={72} />}
          title={t('¡Todo repasado!')}
          text={t('No hay tarjetas pendientes por ahora.')}
          action={
            <Button type='button' size='lg' variant='outline' onClick={onChooseMode}>
              {t('Elegir otro modo')}
            </Button>
          }
        />
      </GamePage>
    )
  }

  if (showResults) {
    const answeredTotal = answeredByIndex.filter((value) => value !== undefined).length
    const accuracy = answeredTotal > 0 ? Math.round((correct / answeredTotal) * 100) : 0
    const flashStreak = getStreak(completedDays)
    const todayCorrect = Math.max(0, globalCorrectToday)
    const dailyDone = todayCorrect >= GOAL
    const dailyMissing = Math.max(GOAL - todayCorrect, 0)
    const resultTone = tone(roundFeedback.tone)

    return (
      <GamePage className='items-center gap-5 text-center'>
        <div className='relative mt-2 flex size-40 items-center justify-center'>
          <span
            className='ica-glow-pulse absolute inset-3 rounded-full'
            style={{ background: `color-mix(in oklab, ${resultTone.solid} 24%, transparent)` }}
            aria-hidden='true'
          />
          <span className='ica-pop relative'>{roundFeedback.icon}</span>
        </div>

        <div>
          <h1
            className='m-0 font-display text-3xl leading-tight font-extrabold tracking-tight lg:text-4xl'
            style={{ color: resultTone.ink }}
          >
            {roundFeedback.title}
          </h1>
          <p className='m-0 mx-auto mt-1.5 max-w-sm text-base font-semibold text-muted-foreground'>
            {roundFeedback.message}
          </p>
        </div>

        <div className='grid w-full grid-cols-3 gap-2.5'>
          <ResultStat
            t='ok'
            label={t('Aciertos')}
            value={correct}
            icon={<CheckIcon className='size-5' strokeWidth={3.2} style={{ color: 'var(--ica-ok)' }} aria-hidden='true' />}
          />
          <ResultStat
            t='i'
            label={t('Precisión')}
            value={`${accuracy} %`}
            icon={<TargetIcon className='size-5' strokeWidth={2.6} style={{ color: 'var(--ica-i)' }} aria-hidden='true' />}
          />
          <ResultStat t='fire' label={t('Racha')} value={flashStreak} icon={<FlameIcon size={22} />} />
        </div>

        <Panel className='text-left'>
          <ProgressBar
            correct={correct}
            total={roundTotal}
            answers={isGoalStyle ? undefined : answerResults}
          />
        </Panel>

        {/* Meta de hoy (10 acertadas suman un día a la racha de flashcards) */}
        <Panel tone={dailyDone ? 'fire' : undefined} className='text-left'>
          <div className='flex items-center gap-3'>
            {dailyDone ? <FlameIcon size={40} /> : <CardsIcon size={40} />}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center justify-between gap-2 text-sm font-extrabold'>
                <span>{dailyDone ? t('¡Meta de hoy cumplida!') : t('Meta de hoy')}</span>
                <span className='tabular-nums'>
                  {Math.min(todayCorrect, GOAL)} / {GOAL}
                </span>
              </div>
              <GameProgress
                className='mt-1.5'
                value={todayCorrect / GOAL}
                color={dailyDone ? 'var(--ica-fire)' : 'var(--primary)'}
                height={14}
                label={t('Meta de hoy de flashcards')}
              />
            </div>
          </div>
          <p className='m-0 mt-2 text-xs font-bold text-muted-foreground'>
            {dailyDone
              ? t('Hoy ya cuenta para tu racha de flashcards.')
              : tn(
                  dailyMissing,
                  'Te falta {n} acierto para sumar el día a tu racha.',
                  'Te faltan {n} aciertos para sumar el día a tu racha.',
                )}
          </p>
        </Panel>

        {!canPlayAnotherRound && pendingOnly && (
          <p
            className='m-0 w-full rounded-2xl border-2 px-4 py-3 text-sm font-bold'
            style={{
              background: 'var(--ica-bad-soft)',
              borderColor: 'color-mix(in oklab, var(--ica-bad-strong) 35%, transparent)',
              color: 'var(--ica-bad-ink)',
            }}
          >
            {t('No quedan suficientes tarjetas no aprendidas o falladas para otra ronda ({count}/{min}).', {
              count: replayEligibleCount,
              min: replayMinimumRequired,
            })}
          </p>
        )}

        <div className='flex w-full flex-col gap-3'>
          <Button
            type='button'
            size='xl'
            className='w-full'
            disabled={!canPlayAnotherRound}
            onClick={() => {
              if (!canPlayAnotherRound) return
              const nextRound = buildReviewRound(
                reviewPool,
                mode,
                getReviewRoundSizeByStyle(playStyle, reviewPool.length),
                reviewSession,
                cards.length,
                { ignoreNewCardLimits: pendingOnly },
              )
              setCorrect(0)
              setAnswerResults([])
              setAnsweredByIndex([])
              setCompleted(false)
              setCurrentIndex(0)
              setFlipped(false)
              setPendingAnswer(null)
              setShowExample(false)
              setShowExampleTranslation(false)
              setFeedback(null)
              setRoundCards(nextRound)
              startReviewSession().catch(() => undefined)
            }}
          >
            <RotateCcwIcon className='size-5' strokeWidth={2.8} aria-hidden='true' />
            {t('Otra ronda {mode}', { mode: t(activeMode.mode) })}
          </Button>
          <Button type='button' onClick={onChooseMode} variant='outline' size='xl' className='w-full'>
            {t('Elegir otro modo')}
          </Button>
          <Button type='button' onClick={onFinishPractice} variant='ghost' size='lg' className='w-full text-muted-foreground'>
            {t('Finalizar práctica')}
          </Button>
        </div>
      </GamePage>
    )
  }

  if (showSaving) {
    return (
      <GamePage className='justify-center'>
        <EmptyState
          icon={<CardsIcon size={72} className='ica-bob' />}
          title={t('Guardando progreso...')}
          text={t('Estamos registrando tu última respuesta para cerrar la sesión.')}
        />
      </GamePage>
    )
  }

  if (!currentCard || !importance) return null

  const playStyleLabel = isGoalStyle ? t('Modo objetivo') : t('Modo clásico')
  const pendingAnswerLabel = pendingAnswer ? t('¡La sabía!') : t('No la sabía')
  const targetLangName = config.targetLang || 'Inglés'
  const cardColors = modeColors(currentCard.importance)
  const wordText = flipped ? currentCard.target : currentCard.native
  const wordSize =
    wordText.length <= 10
      ? 'text-5xl lg:text-6xl'
      : wordText.length <= 22
        ? 'text-4xl lg:text-5xl'
        : 'text-3xl lg:text-4xl'
  // Puntos de la ronda: ventana de 14 que sigue a la tarjeta actual (rondas largas del modo objetivo).
  const MAX_DOTS = 14
  const dotsStart = Math.max(0, Math.min(currentIndex - 6, roundCards.length - MAX_DOTS))
  const counterText = isGoalStyle
    ? `${correct}/${REVIEW_PLAY_STYLE_CORRECT_GOAL}`
    : `${Math.min(answerResults.length, roundTotal)}/${roundTotal}`

  return (
    <GamePage className='gap-4 pb-6 lg:pt-4'>
      {/* Arriba: salir, barra gruesa de la ronda y contador */}
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={onChooseMode}
          aria-label={t('Salir de la ronda')}
          className='-ml-1.5 flex size-10 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        >
          <XIcon className='size-7' strokeWidth={2.6} />
        </button>
        <ProgressBar
          hideLabel
          className='min-w-0 flex-1'
          correct={correct}
          total={roundTotal}
          answers={isGoalStyle ? undefined : answerResults}
        />
        <span className='shrink-0 text-sm font-black text-muted-foreground tabular-nums'>{counterText}</span>
        {/* Quitar o poner el sonido de acierto y fallo sin salir de la ronda */}
        <SoundToggleButton className='-mr-1.5' />
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted py-1 pr-3 pl-2 text-xs font-extrabold text-muted-foreground'>
          {activeMode.key === 'mixed' ? (
            <CardsIcon size={16} />
          ) : (
            <FrequencyGlyph importance={activeMode.key} size={16} />
          )}
          <span className='truncate'>
            {playStyleLabel} · {t(activeMode.title)}
          </span>
        </span>
        <GlobalReviewGoalBadge correctToday={globalCorrectToday} />
      </div>

      <h2 className='m-0 font-display text-xl leading-tight font-extrabold tracking-tight lg:text-2xl'>
        {flipped
          ? t('¿La sabías?')
          : t('¿Cómo se dice en {lang}?', {
              lang: getUiLang() === 'es' ? targetLangName.toLowerCase() : langName(targetLangName),
            })}
      </h2>

      {/* La tarjeta: se toca para girarla */}
      <div
        role={flipped ? undefined : 'button'}
        tabIndex={flipped ? undefined : 0}
        aria-label={flipped ? undefined : t('Girar tarjeta')}
        onClick={() => !flipped && flipCard()}
        className={cn(
          'ica-panel relative flex min-h-80 flex-col px-4 pt-4 pb-5 text-center lg:min-h-96 lg:px-6',
          !flipped && 'ica-press cursor-pointer',
        )}
        style={
          flipped
            ? {
                background: cardColors.soft,
                borderColor: `color-mix(in oklab, ${cardColors.solid} 40%, transparent)`,
                boxShadow: `0 5px 0 color-mix(in oklab, ${cardColors.solid} 35%, transparent)`,
              }
            : undefined
        }
      >
        <div className='flex items-center justify-between gap-2'>
          <span className='inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-2.5 py-0.5 text-[11px] leading-5 font-extrabold tracking-wide text-muted-foreground uppercase'>
            <FrequencyDot importance={currentCard.importance} />
            {t(importance.label)}
          </span>
          <span className='flex items-center gap-1.5'>
            <Pill tone={isFailed ? 'bad' : 'ok'}>
              {isFailed ? t('POR APRENDER') : t('RACHA {n}', { n: currentCard.streak })}
            </Pill>
          </span>
        </div>

        <div
          key={flipped ? 'back' : 'front'}
          className='ica-pop flex flex-1 flex-col items-center justify-center gap-2 py-6'
        >
          <span className='ica-label'>
            {flipped
              ? langName(config.targetLang) || t('Idioma objetivo')
              : langName(config.nativeLang) || t('Tu idioma materno')}
          </span>
          <p className={cn('m-0 max-w-full font-display leading-[1.08] font-extrabold tracking-tight wrap-break-word', wordSize)}>
            {wordText}
          </p>
          {flipped ? (
            <PronunciationHint
              word={currentCard.target}
              targetLang={currentCard.targetLang || config.targetLang}
              nativeLang={currentCard.nativeLang || config.nativeLang}
              className='m-0 text-lg'
              showLoading
            />
          ) : null}
          {flipped ? (
            <p className='m-0 text-lg font-bold text-muted-foreground'>{currentCard.native}</p>
          ) : (
            <p className='m-0 mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground'>
              <RotateCcwIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
              {t('Toca para girar')}
            </p>
          )}
          {flipped ? (
            <SpeakWordButton className='mt-4' text={currentCard.target} langName={targetLangName} />
          ) : null}
        </div>

        {flipped && (
          <div className='flex flex-col items-center gap-3'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={(event) => {
                event.stopPropagation()
                setShowExample((prev) => !prev)
              }}
            >
              <LightbulbIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
              {showExample ? t('Ocultar ejemplo') : t('Ver ejemplo')}
            </Button>

            {showExample && (
              <div className='ica-pop w-full rounded-2xl border-2 border-border bg-card p-3.5 text-left'>
                {currentCard.examplePhrase && currentCard.exampleTranslation ? (
                  <div className='flex flex-col gap-2'>
                    <p className='m-0 text-base font-bold'>{currentCard.exampleTranslation}</p>
                    <div className='flex items-center gap-2'>
                      <p
                        className={cn(
                          'm-0 min-w-0 flex-1 text-sm font-semibold text-muted-foreground',
                          !showExampleTranslation && 'blur-xs select-none',
                        )}
                      >
                        {currentCard.examplePhrase}
                      </p>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={showExampleTranslation ? t('Ocultar la frase') : t('Ver la frase')}
                        onClick={() => setShowExampleTranslation((prev) => !prev)}
                      >
                        {showExampleTranslation ? (
                          <EyeIcon className='size-4' strokeWidth={2.6} />
                        ) : (
                          <EyeOffIcon className='size-4' strokeWidth={2.6} />
                        )}
                      </Button>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <SpeakWordButton size='sm' text={currentCard.examplePhrase} langName={targetLangName} />
                      {showExampleTranslation && (
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          onClick={() => setExtractWordsModalOpen(true)}
                        >
                          <PackagePlusIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
                          {t('Extraer nuevas palabras')}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className='m-0 text-sm font-semibold text-muted-foreground'>
                    {t('Esta palabra no tiene ejemplo guardado todavía.')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Moverse por la ronda (solo hasta la última tarjeta respondida) */}
      <div className='flex items-center justify-center gap-3'>
        <Button
          type='button'
          size='icon-sm'
          variant='outline'
          onClick={() => {
            setCurrentIndex((prev) => Math.max(prev - 1, 0))
            setFlipped(false)
          }}
          aria-label={t('Ir a la tarjeta anterior')}
          disabled={!canGoBack || Boolean(feedback)}
        >
          <ChevronLeftIcon className='size-4' strokeWidth={2.8} />
        </Button>

        <div className='flex flex-wrap items-center justify-center gap-1.5' aria-hidden='true'>
          {dotsStart > 0 && (
            <span className='text-[11px] font-bold text-muted-foreground'>+{dotsStart}</span>
          )}
          {roundCards.slice(dotsStart, dotsStart + MAX_DOTS).map((card, offset) => {
            const index = dotsStart + offset
            const active = index === currentIndex
            const answered = answeredByIndex[index] !== undefined
            return (
              <span
                key={`${card.id}-${index}`}
                className={cn(
                  'rounded-full transition-all',
                  active ? 'size-3.5 ring-2 ring-foreground/70 ring-offset-2 ring-offset-background' : 'size-2.5',
                  answered || active ? 'opacity-100' : 'opacity-40',
                )}
                style={{ background: getImportance(card.importance).color }}
              />
            )
          })}
          {roundCards.length > dotsStart + MAX_DOTS && (
            <span className='text-[11px] font-bold text-muted-foreground'>
              +{roundCards.length - dotsStart - MAX_DOTS}
            </span>
          )}
        </div>

        <Button
          type='button'
          size='icon-sm'
          variant='outline'
          onClick={() => {
            setCurrentIndex((prev) => Math.min(prev + 1, maxNavigableIndex))
            setFlipped(false)
          }}
          aria-label={t('Ir a la siguiente tarjeta disponible')}
          disabled={!canGoForward || Boolean(feedback)}
        >
          <ChevronRightIcon className='size-4' strokeWidth={2.8} />
        </Button>
      </div>

      {/* Abajo, pegado: girar, responder o la franja de resultado */}
      <div className={cn('-mx-4 mt-auto bg-background px-4 pt-2 md:pb-2', !feedback && 'sticky bottom-0 z-10')}>
        {feedback ? (
          <AnswerFeedbackBar feedback={feedback} onContinue={handleContinue} />
        ) : !flipped ? (
          <Button type='button' size='xl' className='w-full' onClick={flipCard}>
            <RotateCcwIcon className='size-5' strokeWidth={2.8} aria-hidden='true' />
            {t('Ver respuesta')}
          </Button>
        ) : !isCurrentAnswered ? (
          <div className='grid grid-cols-2 gap-3'>
            <Button
              type='button'
              size='xl'
              variant='danger'
              className='px-3'
              onClick={() => chooseAnswer(false)}
              disabled={busy}
            >
              <XIcon className='size-5' strokeWidth={3.2} aria-hidden='true' />
              {t('No la sabía')}
            </Button>
            <Button
              type='button'
              size='xl'
              variant='success'
              className='px-3'
              onClick={() => chooseAnswer(true)}
              disabled={busy}
            >
              <CheckIcon className='size-5' strokeWidth={3.2} aria-hidden='true' />
              {t('¡La sabía!')}
            </Button>
          </div>
        ) : (
          <div className='rounded-2xl border-2 border-border bg-muted/60 px-4 py-3 text-center text-sm font-bold text-muted-foreground'>
            {t('Respuesta registrada para esta tarjeta. Puedes revisarla, pero no editarla en esta ronda.')}
          </div>
        )}
        <p className='m-0 mt-2 hidden text-center text-xs font-semibold text-muted-foreground lg:block'>
          {t('Atajos:')} <b>{t('Espacio')}</b> {t('gira y continúa')} · <b>1</b> {t('No la sabía')} · <b>2</b>{' '}
          {t('¡La sabía!')}
        </p>
      </div>

      <Dialog
        open={pendingAnswer !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAnswer(null)
        }}
      >
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>{t('Confirmar respuesta')}</DialogTitle>
            <DialogDescription>
              {t('Vas a registrar:')} <strong>{pendingAnswerLabel}</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              size='lg'
              onClick={() => setPendingAnswer(null)}
              disabled={busy}
            >
              {t('Cancelar')}
            </Button>
            <Button
              type='button'
              size='lg'
              variant={pendingAnswer ? 'success' : 'danger'}
              disabled={busy || pendingAnswer === null}
              onClick={() => {
                if (pendingAnswer === null) return
                const value = pendingAnswer
                setPendingAnswer(null)
                void handleAnswer(value)
              }}
            >
              {t('Confirmar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExtractWordsToVaultModal
        open={extractWordsModalOpen}
        onOpenChange={setExtractWordsModalOpen}
        text={currentCard.examplePhrase || currentCard.target}
        translation={currentCard.exampleTranslation || currentCard.native}
        seedWords={[currentCard.target]}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
        updateCardsLocally={false}
      />
    </GamePage>
  )
}
