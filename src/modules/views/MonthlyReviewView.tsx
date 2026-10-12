import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2Icon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { getUiLang, langName, t } from '@/i18n'
import { speakAsync, stopSpeaking, unlockChallengeAudio } from '../components/NotaDesafiante/challengeEngine'
import { OptionsGrid, PromptCard } from '../components/IcaChallenges/ChallengePlayParts'
import { gameSfx } from '../game/sfx'
import { tone } from '../game/ui'
import { monthLabel } from '../game/monthlyRecap'
import { ReviewFinal, type MissedItem } from '../game/monthlyReview/ReviewFinal'
import {
  ListenControls,
  OrderBoard,
  ReviewFeedback,
  ReviewText,
  ReviewTopBar,
  ROUND_META,
  RoundCover,
  TypeAnswerForm,
} from '../game/monthlyReview/ReviewParts'
import { buildReviewQuestions } from '../game/monthlyReview/questions'
import {
  gradeOrder,
  gradeTyped,
  isRight,
  isLowReviewScore,
  REVIEW_ROUNDS,
  REVIEW_TOTAL_QUESTIONS,
  rememberedOfTen,
  scoreRounds,
  totalScore,
  type ReviewAnswer,
  type ReviewQuestion,
  type ReviewRound,
  type ReviewVerdict,
} from '../game/monthlyReview/rules'
import { useMonthlyReviewStatus } from '../hooks/useMonthlyReviewStatus'
import { prefetchSpeechQueue } from '../services/tts'
import {
  fetchMonthlyReviewPool,
  finishMonthlyReview,
  monthlyReviewErrorMessage,
  type MonthlyReviewFinish,
  type MonthlyReviewResult,
} from '../services/monthlyReview'
import { DASHBOARD_ROUTES } from '../routes/paths'

const SLOW_RATE = 0.75

/** «español» / «polaco» in a sentence (the names are stored capitalised). */
function inLang(name: string): string {
  return getUiLang() === 'en' ? langName(name) : name.toLowerCase()
}

type Phase = 'intro' | 'loading' | 'cover' | 'question' | 'feedback' | 'saving' | 'final'

type FeedbackState = {
  verdict: ReviewVerdict
  main: string
  sub: string | null
  pickedIndex: number | null
}

type MonthlyReviewViewProps = {
  targetLang: string
  nativeLang: string
}

function questionLabel(question: ReviewQuestion, nativeLang: string): string {
  const phrase = question.source === 'phrase'
  switch (question.kind) {
    case 'meaning':
      return phrase ? t('¿Qué significa tu frase?') : t('¿Qué significa tu palabra?')
    case 'listen-meaning':
      return phrase ? t('Escucha tu frase y elige qué significa') : t('Escucha tu palabra y elige qué significa')
    case 'cloze':
      return t('Completa tu frase')
    case 'pick-word':
      return t('Elige la palabra')
    case 'listen-write':
      return t('Escucha y escribe en {lang}', { lang: inLang(nativeLang) })
    case 'complete-expression':
      return t('Completa tu expresión')
    case 'complete-word':
      return t('Completa la palabra')
    case 'order-phrase':
      return t('Ordena tu frase')
    case 'write-word':
    default:
      return t('Escribe la palabra')
  }
}

function ExitConfirm({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center' role='dialog' aria-modal='true' aria-label={t('Salir del Repaso')}>
      <div className='w-full max-w-sm space-y-4 rounded-3xl bg-card p-5 text-center shadow-xl'>
        <h2 className='m-0 font-display text-2xl font-extrabold tracking-tight'>{t('¿Salir del Repaso?')}</h2>
        <p className='m-0 text-sm font-semibold text-muted-foreground'>
          {t('Si sales ahora, pierdes lo que llevas. Podrás empezar otra vez mientras el Repaso siga abierto.')}
        </p>
        <div className='flex flex-col gap-2'>
          <Button type='button' size='xl' className='w-full font-extrabold' onClick={onStay} autoFocus>
            {t('Seguir con el Repaso')}
          </Button>
          <Button type='button' size='xl' variant='outline' className='w-full font-extrabold' onClick={onLeave}>
            {t('Salir')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Repaso del mes: 14 preguntas en 3 rondas con las palabras y frases ICA de tu mes. */
export function MonthlyReviewView({ targetLang, nativeLang }: MonthlyReviewViewProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { status, isLoading } = useMonthlyReviewStatus({ targetLang, nativeLang })

  const [phase, setPhase] = useState<Phase>('intro')
  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<ReviewAnswer[]>([])
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [finished, setFinished] = useState<MonthlyReviewFinish | null>(null)
  const [missed, setMissed] = useState<MissedItem[]>([])
  const [boostedCount, setBoostedCount] = useState(0)
  const [confirmExit, setConfirmExit] = useState(false)
  /** Practice round (repeating after a low score): the «X de cada 10» of the real Repaso, which stays. */
  const [practiceOf, setPracticeOf] = useState<number | null>(null)
  const [practiceResult, setPracticeResult] = useState<MonthlyReviewResult | null>(null)
  const spokenFor = useRef<string | null>(null)
  const timers = useRef<number[]>([])

  const goBack = useCallback(() => navigate(DASHBOARD_ROUTES.testsIca), [navigate])
  const question = questions[index] ?? null
  const monthName = status ? monthLabel(status.monthStart) : ''
  const firstName = String(user?.user_metadata?.display_name || user?.email?.split('@')[0] || '').trim().split(/\s+/)[0]

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((id) => window.clearTimeout(id))
      stopSpeaking()
    }
  }, [])

  const say = useCallback(
    (text: string, rate = 1) => {
      setPlaying(true)
      void speakAsync(text, targetLang, rate).finally(() => setPlaying(false))
    },
    [targetLang],
  )

  // Listening: the audio plays by itself when the question appears.
  useEffect(() => {
    if (phase !== 'question' || !question || !('audioText' in question) || !question.audioText) return
    if (spokenFor.current === question.id) return
    spokenFor.current = question.id
    const text = question.audioText
    later(() => say(text), 350)
  }, [phase, question, later, say])

  // The month's real result: the one just saved here, or the one the server already had.
  const officialResult = finished ?? status?.result ?? null

  const start = () => {
    // Inside the tap: the phone only lets the voice and the sounds play later if one tap unlocked them.
    unlockChallengeAudio()
    const practice = officialResult ? officialResult.rememberedOfTen : null
    setPracticeOf(practice)
    setPracticeResult(null)
    setLoadError(null)
    setPhase('loading')
    void fetchMonthlyReviewPool(targetLang, nativeLang, practice !== null)
      .then((pool) => {
        const built = buildReviewQuestions(pool)
        if (built.length < REVIEW_TOTAL_QUESTIONS) throw new Error('REVIEW_POOL_TOO_SMALL')
        const listening = built
          .map((item) => ('audioText' in item ? item.audioText : null))
          .filter((text): text is string => Boolean(text))
        void prefetchSpeechQueue(listening.map((text) => ({ text, langName: targetLang })))
        setQuestions(built)
        setIndex(0)
        setAnswers([])
        setStreak(0)
        setFeedback(null)
        spokenFor.current = null
        setPhase('cover')
      })
      .catch((error: unknown) => {
        setLoadError(monthlyReviewErrorMessage(error))
        setPhase('intro')
      })
  }

  const save = useCallback(
    (finalAnswers: ReviewAnswer[], asked: ReviewQuestion[]) => {
      setPhase('saving')
      setSaveError(null)
      const rounds = scoreRounds(finalAnswers)
      const score = totalScore(rounds)
      const missedAnswers = finalAnswers.filter((answer) => !answer.skipped && !isRight(answer.verdict))
      const missedWordIds = missedAnswers.map((answer) => answer.wordId).filter((id): id is string => Boolean(id))
      const missedItems = missedAnswers
        .map((answer) => asked.find((item) => item.id === answer.questionId))
        .filter((item): item is ReviewQuestion => Boolean(item))
        .map((item) => ({ id: item.id, target: item.target, native: item.native }))
      if (practiceOf !== null) {
        // Practice: nothing is saved and nothing is paid.
        setPracticeResult({ ...score, rememberedOfTen: rememberedOfTen(score.correct, score.total), coins: 0, rounds, finishedAt: null })
        setMissed(missedItems)
        setBoostedCount(0)
        setPhase('final')
        return
      }
      void finishMonthlyReview({ targetLang, nativeLang, correct: score.correct, total: score.total, rounds, missedWordIds })
        .then((result) => {
          setFinished(result)
          setMissed(missedItems)
          setBoostedCount(result.alreadyDone ? 0 : missedWordIds.length)
          setPhase('final')
        })
        .catch((error: unknown) => {
          setSaveError(monthlyReviewErrorMessage(error))
          // Keep the answers: «Reintentar» sends the same result again.
          setAnswers(finalAnswers)
        })
    },
    [nativeLang, practiceOf, targetLang],
  )

  const record = (verdict: ReviewVerdict, current: ReviewQuestion, feedbackState: Omit<FeedbackState, 'verdict'>) => {
    const right = isRight(verdict)
    const nextStreak = right ? streak + 1 : 0
    setStreak(nextStreak)
    if (right) {
      if (nextStreak >= 2) gameSfx.streak()
      else gameSfx.correct()
    } else {
      gameSfx.wrong()
      // After a miss, the voice says the right answer.
      later(() => say(current.target), 500)
    }
    setAnswers((previous) => [...previous, { questionId: current.id, round: current.round, wordId: current.wordId, verdict, skipped: false }])
    setFeedback({ verdict, ...feedbackState })
    setPhase('feedback')
  }

  const answerChoice = (pickedIndex: number) => {
    if (!question || question.mode !== 'choice') return
    stopSpeaking()
    const verdict: ReviewVerdict = pickedIndex === question.correctIndex ? 'correct' : 'wrong'
    record(verdict, question, { main: question.target, sub: question.native, pickedIndex })
  }

  const answerTyped = (text: string) => {
    if (!question || question.mode !== 'type') return
    stopSpeaking()
    const verdict = gradeTyped(text, question.accepted)
    const sub = question.answerLang === 'native' ? question.target : question.native
    record(verdict, question, { main: question.answerDisplay, sub, pickedIndex: null })
  }

  const answerOrder = (placed: string[]) => {
    if (!question || question.mode !== 'order') return
    record(gradeOrder(placed, question.solution), question, { main: question.target, sub: question.native, pickedIndex: null })
  }

  const giveUp = () => {
    if (!question) return
    stopSpeaking()
    record('wrong', question, {
      main: question.mode === 'type' ? question.answerDisplay : question.target,
      sub: question.mode === 'type' && question.answerLang === 'native' ? question.target : question.native,
      pickedIndex: null,
    })
  }

  // «No puedo escucharlo ahora»: that question does not count, not for the score and not for the prize.
  const cannotListen = () => {
    if (!question) return
    stopSpeaking()
    const skipped: ReviewAnswer = { questionId: question.id, round: question.round, wordId: question.wordId, verdict: 'wrong', skipped: true }
    const next = [...answers, skipped]
    setAnswers(next)
    goNext(next)
  }

  const goNext = (currentAnswers: ReviewAnswer[]) => {
    stopSpeaking()
    const nextIndex = index + 1
    if (nextIndex >= questions.length) {
      save(currentAnswers, questions)
      return
    }
    const startsRound = questions[nextIndex].round !== questions[index].round
    setIndex(nextIndex)
    setFeedback(null)
    setPhase(startsRound ? 'cover' : 'question')
  }

  const roundOf = (item: ReviewQuestion | null): ReviewRound => item?.round ?? 'reading'
  const roundNumber = REVIEW_ROUNDS.indexOf(roundOf(question)) + 1
  const roundCount = useMemo(
    () => (question ? questions.filter((item) => item.round === question.round).length : 0),
    [question, questions],
  )
  // Answered counts the screens already passed, skipped ones included, so the bar always moves forward.
  const answered = phase === 'feedback' ? index + 1 : index

  // ---- Screens -------------------------------------------------------------------------------

  // Repeating is open while the Repaso is, and only after a low score.
  const canRetry = Boolean(status?.windowOpen && officialResult && isLowReviewScore(officialResult.rememberedOfTen))

  if (phase === 'final' && practiceResult && practiceOf !== null) {
    return (
      <ReviewFinal
        result={practiceResult}
        coinsCapped={false}
        monthName={monthName}
        name={firstName}
        targetLang={targetLang}
        missed={missed}
        boostedCount={0}
        onDone={goBack}
        onRetry={canRetry ? start : undefined}
        practiceOf={practiceOf}
      />
    )
  }

  if (phase === 'final' && finished) {
    return (
      <ReviewFinal
        result={finished}
        coinsCapped={finished.coinsCapped}
        monthName={monthName}
        name={firstName}
        targetLang={targetLang}
        missed={missed}
        boostedCount={boostedCount}
        onDone={goBack}
        onRetry={canRetry ? start : undefined}
      />
    )
  }

  if (phase === 'intro' || phase === 'loading') {
    const practice = Boolean(status?.result)
    const ready = status && status.windowOpen && status.eligible && (!status.result || canRetry)
    const blocked = status
      ? status.result
        ? t('Ya hiciste el Repaso de este mes. Tu resultado está en Tests.')
        : !status.windowOpen
          ? t('El Repaso está abierto del día {open} al {close} de cada mes.', { open: status.openDay, close: status.closeDay })
          : t('Aún no tienes suficientes palabras ICA de este mes para el Repaso.')
      : t('No pudimos cargar el Repaso. Inténtalo de nuevo en un momento.')
    return (
      <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-6 pb-28 text-center lg:py-10'>
        <div>
          <p className='m-0 text-xs font-extrabold tracking-[0.1em] text-muted-foreground uppercase'>{t('Repaso del mes')}</p>
          <h1 className='m-0 mt-1 font-display text-4xl font-extrabold tracking-tight'>
            {monthName ? t('Repaso de {month}', { month: monthName }) : t('Repaso del mes')}
          </h1>
          <p className='mx-auto mt-2 max-w-sm text-base font-semibold text-balance text-muted-foreground'>
            {t('¿Cuántas de tus palabras ICA del mes recuerdas? Lo vemos en {n} preguntas, sin reloj.', { n: REVIEW_TOTAL_QUESTIONS })}
          </p>
        </div>

        <div className='ica-panel flex flex-col gap-3 px-4 py-4 text-left'>
          {REVIEW_ROUNDS.map((round, position) => {
            const meta = ROUND_META[round]
            const colors = tone(meta.tone)
            return (
              <div key={round} className='flex items-center gap-3'>
                <span className='flex size-12 shrink-0 items-center justify-center rounded-2xl' style={{ background: colors.soft, boxShadow: `0 3px 0 ${colors.edge}` }}>
                  <meta.Glyph size={30} />
                </span>
                <div className='min-w-0'>
                  <p className='m-0 text-base font-extrabold'>{t('Ronda {n} · {name}', { n: position + 1, name: meta.title() })}</p>
                  <p className='m-0 text-sm font-semibold text-muted-foreground'>{meta.how()}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className='m-0 text-sm font-bold text-muted-foreground'>
          {practice && ready
            ? t('Es para practicar: tu resultado y tus ICA Coins de este mes no cambian.')
            : t('Tu premio: tantas ICA Coins como palabras recuerdes de cada 10. No suma puntos al ranking.')}
        </p>

        {loadError ? (
          <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-bad-ink)' }} role='alert'>
            {loadError}
          </p>
        ) : null}

        {isLoading ? (
          <div className='h-14 animate-pulse rounded-2xl bg-muted/70' aria-label={t('Cargando…')} />
        ) : ready ? (
          <Button type='button' size='xl' variant='c' className='w-full text-lg font-extrabold' onClick={start} disabled={phase === 'loading'}>
            {phase === 'loading' ? <Loader2Icon data-icon='inline-start' className='size-5 animate-spin' aria-hidden='true' /> : null}
            {phase === 'loading' ? t('Preparando tus preguntas…') : practice ? t('Repetir el Repaso') : t('Empezar el Repaso')}
          </Button>
        ) : (
          <>
            <p className='m-0 rounded-2xl bg-muted px-3 py-2.5 text-sm font-bold'>{blocked}</p>
            <Button type='button' size='xl' variant='outline' className='w-full font-extrabold' onClick={goBack}>
              {t('Volver a Tests')}
            </Button>
          </>
        )}

        {phase === 'intro' && ready ? (
          <Button type='button' variant='ghost' onClick={goBack}>
            {t('Volver a Tests')}
          </Button>
        ) : null}
      </section>
    )
  }

  if (phase === 'saving') {
    return (
      <section className='mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 pb-28 text-center'>
        {saveError ? (
          <>
            <p className='m-0 text-base font-bold' style={{ color: 'var(--ica-bad-ink)' }} role='alert'>
              {t('No pudimos guardar tu resultado.')}
            </p>
            <p className='m-0 text-sm font-semibold text-muted-foreground'>{saveError}</p>
            <Button type='button' size='xl' className='w-full max-w-sm font-extrabold' onClick={() => save(answers, questions)}>
              {t('Reintentar')}
            </Button>
          </>
        ) : (
          <>
            <Loader2Icon className='size-10 animate-spin text-primary' aria-hidden='true' />
            <p className='m-0 text-base font-bold'>{t('Guardando tu resultado…')}</p>
          </>
        )}
      </section>
    )
  }

  if (!question) return null

  if (phase === 'cover') {
    return <RoundCover round={question.round} number={roundNumber} count={roundCount} onGo={() => setPhase('question')} />
  }

  const inFeedback = phase === 'feedback' && feedback
  const isLast = index + 1 >= questions.length
  const listening = question.kind === 'listen-meaning' || question.kind === 'listen-write'

  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-4 pb-28 lg:py-8'>
      <ReviewTopBar answered={answered} total={questions.length} round={question.round} streak={streak} onExit={() => setConfirmExit(true)} />

      <PromptCard label={questionLabel(question, nativeLang)}>
        {listening && inFeedback ? (
          <ReviewText>{question.target}</ReviewText>
        ) : listening ? (
          <ListenControls
            playing={playing}
            onPlay={() => question.audioText && say(question.audioText)}
            onSlow={() => question.audioText && say(question.audioText, SLOW_RATE)}
            onCannotListen={cannotListen}
          />
        ) : question.mode === 'choice' ? (
          <div className='space-y-2'>
            <ReviewText>{question.stem}</ReviewText>
            {question.kind === 'cloze' ? <p className='m-0 text-base font-bold text-muted-foreground'>= {question.native}</p> : null}
          </div>
        ) : question.mode === 'type' ? (
          <div className='space-y-2'>
            {question.shown ? <ReviewText>{question.shown}</ReviewText> : null}
            {question.answerLang === 'target' ? (
              <p className='m-0 text-base font-bold text-muted-foreground'>{question.shown ? `= ${question.native}` : question.native}</p>
            ) : null}
          </div>
        ) : (
          <ReviewText>{question.native}</ReviewText>
        )}
      </PromptCard>

      {question.mode === 'choice' ? (
        <OptionsGrid
          options={question.options}
          disabled={Boolean(inFeedback)}
          onPick={answerChoice}
          pickedIndex={inFeedback ? feedback.pickedIndex : null}
          correctIndex={inFeedback ? question.correctIndex : null}
        />
      ) : null}

      {!inFeedback && question.mode === 'type' ? (
        <TypeAnswerForm
          lang={question.answerLang === 'native' ? nativeLang : targetLang}
          placeholder={question.answerLang === 'native' ? t('Escribe el significado') : t('Escribe en {lang}', { lang: inLang(targetLang) })}
          onSubmit={answerTyped}
          onSkip={giveUp}
          autoFocusKey={question.id}
        />
      ) : null}

      {!inFeedback && question.mode === 'order' ? (
        <OrderBoard tiles={question.tiles} onSubmit={answerOrder} onSkip={giveUp} resetKey={question.id} />
      ) : null}

      {inFeedback ? (
        <ReviewFeedback
          verdict={feedback.verdict}
          main={feedback.main}
          sub={feedback.sub}
          onSpeak={() => say(question.target)}
          onNext={() => goNext(answers)}
          last={isLast}
        />
      ) : null}

      {confirmExit ? (
        <ExitConfirm
          onStay={() => setConfirmExit(false)}
          onLeave={() => {
            stopSpeaking()
            goBack()
          }}
        />
      ) : null}
    </section>
  )
}
