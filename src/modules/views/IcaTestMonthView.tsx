import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import confetti from 'canvas-confetti'
import { useIcaTestRunner } from '../hooks/useIcaTestRunner'
import {
  buildIcaTestQuestions,
  buildIcaTestWordPool,
  finalizeIcaTestAttempt,
  getCurrentIcaTestMonthDate,
  getIcaTestByMonth,
  getIcaTestMonthLabel,
  getIcaTestWindowStartDay,
  getIcaTestWordsUsed,
  ICA_TEST_MIN_MONTH_DATE,
  ICA_TEST_REQUIRED_WORDS,
  ICA_TEST_SECONDS_PER_QUESTION,
  ICA_TEST_TOTAL_QUESTIONS,
  isIcaTestWindowOpen,
  isIcaTestsFeatureAvailable,
  parseIcaTestMonthCode,
  persistIcaTestAnswer,
  startIcaTestAttempt,
} from '../services/icaTests'
import { IcaTestResultCard } from '../components/IcaTestResultCard'
import { DASHBOARD_ROUTES, getIcaTestMonthRoute } from '../routes/paths'
import type { IcaTestQuestion, IcaTestRecord, Lexicard } from '../types'

type IcaTestMode = 'official' | 'redo'

type IcaTestMonthViewProps = {
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
  monthCode: string
  mode: IcaTestMode
}

type PendingLeaveAction =
  | {
      kind: 'path'
      to: string
    }
  | {
      kind: 'back'
    }
  | null

const EMPTY_QUESTIONS: IcaTestQuestion[] = []

function getScoreLiteral(
  score: number,
  total: number,
): { title: string; message: string } {
  if (total <= 0) {
    return {
      title: 'Resultado registrado',
      message: 'Completaste el test ICA.',
    }
  }

  const ratio = score / total
  if (ratio === 1) {
    return {
      title: 'Perfección total',
      message: 'Clavaste las 15 respuestas. Nivel altísimo.',
    }
  }

  if (ratio >= 0.8) {
    return {
      title: 'Excelente resultado',
      message: 'Muy sólido. Estás muy cerca del puntaje perfecto.',
    }
  }

  if (ratio >= 0.6) {
    return {
      title: 'Buen avance',
      message: 'Vas por buen camino. Rehacer puede consolidarte.',
    }
  }

  if (ratio >= 0.4) {
    return {
      title: 'Base construida',
      message: 'Ya hay progreso. Refuerza vocabulario y vuelve a intentarlo.',
    }
  }

  return {
    title: 'Punto de partida',
    message: 'Este resultado te marca exactamente qué reforzar.',
  }
}

function getOfficialBlockedMessage(test: IcaTestRecord): string {
  if (test.status === 'completed') {
    return `Puntaje guardado: ${test.score}/${test.totalQuestions}.`
  }

  return 'Este intento se cerró por salida/recarga y quedó fallido.'
}

export function IcaTestMonthView({
  targetLang,
  nativeLang,
  cards,
  monthCode,
  mode,
}: IcaTestMonthViewProps) {
  const navigate = useNavigate()
  const [storedTest, setStoredTest] = useState<IcaTestRecord | null>(null)
  const [attempt, setAttempt] = useState<IcaTestRecord | null>(null)
  const [isLoadingStoredTest, setIsLoadingStoredTest] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [perfectCardNode, setPerfectCardNode] = useState<HTMLDivElement | null>(
    null,
  )
  const allowNavigationRef = useRef(false)
  const attemptRef = useRef<IcaTestRecord | null>(null)
  const pendingLeaveRef = useRef<PendingLeaveAction>(null)
  const lastConfettiKeyRef = useRef<string | null>(null)

  const handlePerfectCardRef = useCallback((node: HTMLDivElement | null) => {
    setPerfectCardNode(node)
  }, [])

  const now = useMemo(() => new Date(), [])
  const windowStartDay = getIcaTestWindowStartDay()
  const featureAvailable = useMemo(() => isIcaTestsFeatureAvailable(now), [now])
  const monthDate = useMemo(() => parseIcaTestMonthCode(monthCode), [monthCode])
  const currentMonth = useMemo(() => getCurrentIcaTestMonthDate(now), [now])
  const isWindowOpen = useMemo(() => isIcaTestWindowOpen(now), [now])

  const launchCardConfetti = useCallback(() => {
    const card = perfectCardNode

    if (!card) {
      confetti({
        particleCount: 80,
        spread: 170,
        startVelocity: 20,
        gravity: 1.05,
        ticks: 320,
        origin: { x: 0.5, y: 0.34 },
        zIndex: 1200,
        disableForReducedMotion: false,
      })
      return
    }

    const rect = card.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const topY = rect.top + Math.max(28, rect.height * 0.22)
    let burstCount = 0

    const burst = () => {
      const spreadOffset = (Math.random() - 0.5) * rect.width * 0.75
      const originX = Math.max(
        0.08,
        Math.min(0.92, (centerX + spreadOffset) / window.innerWidth),
      )
      const originY = Math.max(0.02, Math.min(0.4, topY / window.innerHeight))

      confetti({
        particleCount: 44,
        spread: 190,
        startVelocity: 18,
        gravity: 1.08,
        decay: 0.92,
        angle: 90,
        ticks: 320,
        zIndex: 1200,
        disableForReducedMotion: false,
        origin: {
          x: originX,
          y: originY,
        },
      })
    }

    burst()
    const intervalId = window.setInterval(() => {
      burstCount += 1
      burst()
      if (burstCount >= 8) {
        window.clearInterval(intervalId)
      }
    }, 230)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [perfectCardNode])

  useEffect(() => {
    attemptRef.current = attempt
  }, [attempt])

  useEffect(() => {
    if (!monthDate) {
      setStoredTest(null)
      setAttempt(null)
      setIsLoadingStoredTest(false)
      setLoadError('Mes de test inválido.')
      return
    }

    let active = true
    setIsLoadingStoredTest(true)
    setLoadError(null)

    void getIcaTestByMonth(targetLang, nativeLang, monthDate, {
      autoFailIfRunning: mode === 'official',
    })
      .then((test) => {
        if (!active) return
        setStoredTest(test)
        setAttempt(null)
      })
      .catch(() => {
        if (!active) return
        setLoadError('No pudimos cargar el estado del test ICA.')
      })
      .finally(() => {
        if (!active) return
        setIsLoadingStoredTest(false)
      })

    return () => {
      active = false
    }
  }, [mode, monthDate, nativeLang, targetLang])

  const wordPool = useMemo(() => {
    if (!monthDate) return null
    return buildIcaTestWordPool(cards, monthDate)
  }, [cards, monthDate])

  const activeQuestions = useMemo(() => {
    if (mode === 'redo') return storedTest?.questions ?? []
    return attempt?.questions ?? []
  }, [attempt?.questions, mode, storedTest?.questions])

  const isOfficialBlockedByDate =
    mode === 'official' && monthDate !== currentMonth
  const isOfficialBlockedByWindow = mode === 'official' && !isWindowOpen
  const isOfficialBlockedByFeature =
    mode === 'official' &&
    (!featureAvailable || (monthDate || '') < ICA_TEST_MIN_MONTH_DATE)
  const isOfficialBlockedByWords = mode === 'official' && !wordPool?.eligible

  const hasRunningOfficialAttempt =
    mode === 'official' && attempt?.status === 'running'

  const shouldStartRunner =
    !isLoadingStoredTest &&
    !loadError &&
    activeQuestions.length === ICA_TEST_TOTAL_QUESTIONS &&
    ((mode === 'redo' && Boolean(storedTest)) || hasRunningOfficialAttempt)

  const runnerQuestions = useMemo(
    () => (shouldStartRunner ? activeQuestions : EMPTY_QUESTIONS),
    [activeQuestions, shouldStartRunner],
  )

  const failCurrentAttempt = async (reason: string): Promise<void> => {
    const currentAttempt = attemptRef.current
    if (!currentAttempt || currentAttempt.status !== 'running') return

    setIsFinalizing(true)
    try {
      const failed = await finalizeIcaTestAttempt({
        attemptId: currentAttempt.id,
        status: 'failed',
        score: currentAttempt.score,
        currentQuestionIndex: currentAttempt.currentQuestionIndex,
        failReason: reason,
      })
      setAttempt((previous) => {
        if (!previous || previous.id !== failed.id) return failed
        return {
          ...failed,
          questions: previous.questions,
        }
      })
      setStoredTest(failed)
    } finally {
      setIsFinalizing(false)
    }
  }

  useEffect(() => {
    if (!hasRunningOfficialAttempt) {
      allowNavigationRef.current = false
      pendingLeaveRef.current = null
      setLeaveDialogOpen(false)
      return
    }

    const onDocumentClickCapture = (event: MouseEvent): void => {
      if (allowNavigationRef.current || leaveDialogOpen) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return

      const target = event.target as Element | null
      if (!target) return
      if (target.closest('[role="dialog"]')) return

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
  }, [hasRunningOfficialAttempt, leaveDialogOpen])

  useEffect(() => {
    if (!hasRunningOfficialAttempt) return

    const markerState = { icaTestGuard: true, at: Date.now() }
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
  }, [hasRunningOfficialAttempt, leaveDialogOpen])

  useEffect(() => {
    if (!hasRunningOfficialAttempt) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [hasRunningOfficialAttempt])

  const handleStartOfficialAttempt = async (): Promise<void> => {
    if (!monthDate || !wordPool?.eligible || isStarting) return
    setSaveError(null)
    setIsStarting(true)

    try {
      const questions = buildIcaTestQuestions(wordPool.pool)
      if (questions.length !== ICA_TEST_TOTAL_QUESTIONS) {
        throw new Error('No pudimos generar las 15 preguntas del test ICA.')
      }

      const started = await startIcaTestAttempt({
        targetLang,
        nativeLang,
        testMonth: monthDate,
        questions,
      })
      setHasAcceptedDisclaimer(true)
      setAttempt(started)
      setStoredTest(null)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'ICA_TEST_ALREADY_STARTED'
      ) {
        setSaveError(
          'Este test ya fue iniciado. Recarga para ver su estado final.',
        )
      } else if (error instanceof Error) {
        setSaveError(error.message)
      } else {
        setSaveError('No pudimos iniciar el test ICA.')
      }
    } finally {
      setIsStarting(false)
    }
  }

  const {
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeLeft,
    progressPercent,
    score,
    isFinished,
    isAnswering,
    answerQuestion,
  } = useIcaTestRunner({
    questions: runnerQuestions,
    secondsPerQuestion: ICA_TEST_SECONDS_PER_QUESTION,
    onAnswer:
      mode === 'official' && hasRunningOfficialAttempt
        ? async ({ answers, nextQuestionIndex, score: nextScore }) => {
            setSaveError(null)
            const currentAttempt = attemptRef.current
            if (!currentAttempt || currentAttempt.status !== 'running') return

            const updated = await persistIcaTestAnswer({
              attemptId: currentAttempt.id,
              answers,
              currentQuestionIndex: nextQuestionIndex,
              score: nextScore,
            })
            setAttempt((previous) => {
              if (!previous || previous.id !== updated.id) return updated
              return {
                ...updated,
                questions: previous.questions,
              }
            })
          }
        : undefined,
    onAnswerError: (error) => {
      if (
        error instanceof Error &&
        error.message === 'ICA_TEST_ATTEMPT_NOT_RUNNING'
      ) {
        setSaveError(
          'El intento ya no está en curso. Recarga para ver el estado final.',
        )
        return
      }
      if (error instanceof Error && error.message) {
        setSaveError(`No pudimos guardar tu respuesta: ${error.message}`)
        return
      }
      setSaveError(
        'No pudimos guardar tu respuesta. Reintenta; si persiste, recarga.',
      )
    },
    onFinish: async (answers) => {
      if (mode === 'official') {
        const currentAttempt = attemptRef.current
        if (!currentAttempt || currentAttempt.status !== 'running') return

        const nextScore = answers.reduce(
          (value, answer) => value + Number(answer.isCorrect),
          0,
        )

        setIsFinalizing(true)
        try {
          const completed = await finalizeIcaTestAttempt({
            attemptId: currentAttempt.id,
            status: 'completed',
            score: nextScore,
            currentQuestionIndex: ICA_TEST_TOTAL_QUESTIONS,
          })
          setAttempt((previous) => {
            if (!previous || previous.id !== completed.id) return completed
            return {
              ...completed,
              questions: previous.questions,
            }
          })
          setStoredTest(completed)
        } finally {
          setIsFinalizing(false)
        }
      }
    },
  })

  const finalOfficialScore =
    attempt?.status === 'completed' ? attempt.score : null
  const finalOfficialTotal =
    attempt?.status === 'completed' ? attempt.totalQuestions : null
  const isOfficialPerfect =
    finalOfficialScore !== null &&
    finalOfficialTotal !== null &&
    finalOfficialTotal > 0 &&
    finalOfficialScore === finalOfficialTotal
  const isRedoPerfect =
    mode === 'redo' &&
    isFinished &&
    totalQuestions > 0 &&
    score === totalQuestions

  useEffect(() => {
    if (!isOfficialPerfect && !isRedoPerfect) return

    const key = `${mode}:${monthCode}:${isOfficialPerfect ? finalOfficialScore : score}`
    if (lastConfettiKeyRef.current === key) return

    lastConfettiKeyRef.current = key
    return launchCardConfetti()
  }, [
    finalOfficialScore,
    isOfficialPerfect,
    isRedoPerfect,
    isFinished,
    launchCardConfetti,
    mode,
    monthCode,
    score,
  ])

  if (!monthDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ruta inválida</CardTitle>
          <CardDescription>El formato esperado es MMYYYY.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type='button' variant='outline' asChild>
            <Link to={DASHBOARD_ROUTES.testsIca}>Volver a Tests ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoadingStoredTest) {
    return <p className='text-sm text-muted-foreground'>Cargando test ICA...</p>
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pudimos abrir este test</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type='button' variant='outline' asChild>
            <Link to={DASHBOARD_ROUTES.testsIca}>Volver a Tests ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (mode === 'redo' && !storedTest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Este test no existe aún</CardTitle>
          <CardDescription>
            Solo puedes rehacer tests ICA que ya estén completados y guardados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type='button' variant='outline' asChild>
            <Link to={DASHBOARD_ROUTES.testsIca}>Ver Tests ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isOfficialBlockedByFeature) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Test no disponible</CardTitle>
          <CardDescription>
            Los Tests ICA oficiales comienzan en mayo de 2026.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isOfficialBlockedByDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Test bloqueado</CardTitle>
          <CardDescription>
            Solo puedes rendir el test del mes actual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type='button' variant='outline' asChild>
            <Link to={DASHBOARD_ROUTES.testsIca}>Volver a Tests ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isOfficialBlockedByWindow) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fuera de ventana mensual</CardTitle>
          <CardDescription>
            El test oficial se habilita entre los días {windowStartDay} y 28 de
            cada mes.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (mode === 'official' && storedTest && storedTest.status !== 'running') {
    const result = getScoreLiteral(storedTest.score, storedTest.totalQuestions)
    const title =
      storedTest.status === 'completed'
        ? result.title
        : 'Intento oficial cerrado'
    const message =
      storedTest.status === 'completed'
        ? result.message
        : 'Este intento se cerró por salida o recarga antes de completarlo.'

    return (
      <section className='relative mx-auto flex min-h-[68vh] w-full max-w-3xl flex-1 items-center justify-center p-4 pb-24 lg:pb-4'>
        <div ref={handlePerfectCardRef} className='w-full max-w-xl'>
          <IcaTestResultCard
            monthLabel={getIcaTestMonthLabel(monthDate)}
            title={title}
            score={storedTest.score}
            totalQuestions={storedTest.totalQuestions}
            message={message}
            note={getOfficialBlockedMessage(storedTest)}
            actions={
              <div className='flex flex-wrap justify-center gap-2'>
                <Button type='button' variant='outline' asChild>
                  <Link to={getIcaTestMonthRoute(storedTest.monthCode, true)}>
                    Rehacer sin guardar
                  </Link>
                </Button>
                <Button type='button' asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>Ver Tests ICA</Link>
                </Button>
              </div>
            }
          />
        </div>
      </section>
    )
  }

  if (isOfficialBlockedByWords && wordPool) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay palabras suficientes</CardTitle>
          <CardDescription>
            Necesitas al menos {ICA_TEST_REQUIRED_WORDS} palabras ICA entre este
            mes y el anterior.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-1 text-sm text-muted-foreground'>
          <p>Disponibles: {wordPool.availableWords}</p>
          <p>Mes actual: {wordPool.fromCurrentMonth}</p>
          <p>Mes anterior: {wordPool.fromPreviousMonth}</p>
        </CardContent>
      </Card>
    )
  }

  if (mode === 'official' && !attempt) {
    return (
      <section className='mx-auto w-full max-w-2xl flex-1 p-4 pb-24 lg:pb-4'>
        <Card>
          <CardHeader>
            <CardTitle className='capitalize'>
              Antes de comenzar · {getIcaTestMonthLabel(monthDate)}
            </CardTitle>
            <CardDescription>
              Este intento oficial es único. Si sales, cierras o refrescas la
              página, perderás la posibilidad de hacerlo y quedará fallado.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'>
              <strong>⚠️ IMPORTANTE</strong>
              <ul className='list-inside list-disc mt-2'>
                <li>No podrás navegar fuera del test sin finalizarlo.</li>
                <li>
                  Cada respuesta se guarda en tiempo real en la base de datos.
                </li>
                <li>
                  <strong>Posees 6 segundos</strong> para responder cada
                  pregunta. Si el tiempo se agota, la pregunta contará como
                  incorrecta y avanzarás a la siguiente.
                </li>
              </ul>
            </div>
            {saveError && (
              <p className='text-sm text-destructive'>{saveError}</p>
            )}
            <Button
              type='button'
              onClick={() => void handleStartOfficialAttempt()}
              disabled={isStarting || isFinalizing}
            >
              {isStarting ? 'Iniciando...' : 'Entiendo y comenzar test oficial'}
            </Button>
            {!hasAcceptedDisclaimer && (
              <p className='text-xs text-muted-foreground'>
                Al iniciar aceptas las condiciones de bloqueo y cierre por
                salida.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    )
  }

  if (mode === 'official' && attempt?.status === 'failed') {
    return (
      <section className='relative mx-auto flex min-h-[68vh] w-full max-w-3xl flex-1 items-center justify-center p-4 pb-24 lg:pb-4'>
        <div className='w-full max-w-xl'>
          <IcaTestResultCard
            monthLabel={getIcaTestMonthLabel(monthDate)}
            title='Intento oficial cerrado'
            score={attempt.score}
            totalQuestions={attempt.totalQuestions}
            message='Saliste o recargaste durante el test. Este mes ya no admite un nuevo intento oficial.'
            note={getOfficialBlockedMessage(attempt)}
            actions={
              <div className='flex flex-wrap justify-center gap-2'>
                <Button type='button' variant='outline' asChild>
                  <Link to={getIcaTestMonthRoute(monthCode, true)}>
                    Rehacer sin guardar
                  </Link>
                </Button>
                <Button type='button' asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>Volver a Tests ICA</Link>
                </Button>
              </div>
            }
          />
        </div>
      </section>
    )
  }

  if (mode === 'official' && attempt?.status === 'completed') {
    const result = getScoreLiteral(attempt.score, attempt.totalQuestions)

    return (
      <section className='relative mx-auto flex min-h-[68vh] w-full max-w-3xl flex-1 items-center justify-center p-4 pb-24 lg:pb-4'>
        <div ref={handlePerfectCardRef} className='w-full max-w-xl'>
          <IcaTestResultCard
            monthLabel={getIcaTestMonthLabel(monthDate)}
            title={result.title}
            score={attempt.score}
            totalQuestions={attempt.totalQuestions}
            message={result.message}
            note={`Se usaron ${getIcaTestWordsUsed(activeQuestions).length} palabras entre preguntas y opciones.`}
            isSaving={isFinalizing}
            errorMessage={saveError}
            actions={
              <div className='flex flex-wrap justify-center gap-2'>
                <Button type='button' asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>Volver a Tests ICA</Link>
                </Button>
                <Button type='button' variant='outline' asChild>
                  <Link to={getIcaTestMonthRoute(monthCode, true)}>
                    Rehacer otra vez
                  </Link>
                </Button>
              </div>
            }
          />
        </div>
      </section>
    )
  }

  if (mode === 'redo' && isFinished) {
    const result = getScoreLiteral(score, totalQuestions)

    return (
      <section className='relative mx-auto flex min-h-[68vh] w-full max-w-3xl flex-1 items-center justify-center p-4 pb-24 lg:pb-4'>
        <div ref={handlePerfectCardRef} className='w-full max-w-xl'>
          <IcaTestResultCard
            monthLabel={`${getIcaTestMonthLabel(monthDate)} · Rehacer`}
            title={result.title}
            score={score}
            totalQuestions={totalQuestions}
            message={result.message}
            note='Este resultado no cambia el original.'
            actions={
              <div className='flex flex-wrap justify-center gap-2'>
                <Button type='button' asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>Volver a Tests ICA</Link>
                </Button>
              </div>
            }
          />
        </div>
      </section>
    )
  }

  if (!shouldStartRunner || !currentQuestion) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pudimos preparar el test</CardTitle>
          <CardDescription>
            Intenta recargar. Si persiste, revisa que tengas palabras ICA
            válidas.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const handleCancelLeave = () => {
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
  }

  const handleConfirmLeave = () => {
    const pending = pendingLeaveRef.current
    pendingLeaveRef.current = null
    setLeaveDialogOpen(false)
    if (!pending) return

    void failCurrentAttempt(
      pending.kind === 'back' ? 'navigation_back' : 'navigation_exit',
    ).finally(() => {
      allowNavigationRef.current = true
      if (pending.kind === 'back') {
        window.history.back()
        return
      }
      navigate(pending.to)
    })
  }

  const timerSeconds = Math.max(
    0,
    Math.min(ICA_TEST_SECONDS_PER_QUESTION, timeLeft),
  )
  const timerRadius = 18
  const timerCenter = 22
  const timerSegmentGapDeg = 7
  const timerSegmentCount = ICA_TEST_SECONDS_PER_QUESTION
  const timerSegmentAngle =
    (360 - timerSegmentCount * timerSegmentGapDeg) / timerSegmentCount

  const timerColor =
    timerSeconds >= 5 ? '#22c55e' : timerSeconds >= 3 ? '#f97316' : '#ef4444'
  const timerTextClass =
    timerSeconds >= 5
      ? 'text-emerald-600 dark:text-emerald-400'
      : timerSeconds >= 3
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-red-600 dark:text-red-400'

  const polarToCartesian = (angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180
    return {
      x: timerCenter + timerRadius * Math.cos(angleRad),
      y: timerCenter + timerRadius * Math.sin(angleRad),
    }
  }

  const timerSegments = Array.from(
    { length: timerSegmentCount },
    (_, index) => {
      const startDeg =
        -90 +
        index * (timerSegmentAngle + timerSegmentGapDeg) +
        timerSegmentGapDeg / 2
      const endDeg = startDeg + timerSegmentAngle
      const start = polarToCartesian(startDeg)
      const end = polarToCartesian(endDeg)
      const active = index < timerSeconds

      return {
        key: `timer-segment-${index}`,
        d: `M ${start.x} ${start.y} A ${timerRadius} ${timerRadius} 0 0 1 ${end.x} ${end.y}`,
        active,
      }
    },
  )

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 p-4 pb-24 lg:pb-4'>
      <Card>
        <CardHeader>
          <CardTitle className='capitalize'>
            {mode === 'redo' ? 'Rehacer test ICA' : 'Test ICA oficial'} ·{' '}
            {getIcaTestMonthLabel(monthDate)}
          </CardTitle>
          <CardDescription>
            Pregunta {currentQuestionIndex + 1} de {totalQuestions}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {mode === 'official' && (
            <div className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'>
              No cierres ni recargues. Si sales del test oficial, el intento se
              marcará como fallido.
            </div>
          )}

          <div className='h-2 rounded-full bg-muted'>
            <div
              className='h-2 rounded-full bg-primary transition-all'
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {saveError && <p className='text-sm text-destructive'>{saveError}</p>}

          <div className='rounded-lg border bg-card p-4'>
            <div className='flex items-center justify-between gap-4'>
              <div className='min-w-0'>
                <p className='mb-2 text-sm text-muted-foreground'>
                  Elige la equivalencia en {targetLang}:
                </p>
                <p className='text-2xl font-semibold'>
                  {currentQuestion.promptNative}
                </p>
              </div>

              <div className='flex flex-col shrink-0 items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2'>
                <p>Tiempo</p>
                <div className='relative h-12 w-12'>
                  <svg className='h-12 w-12' viewBox='0 0 44 44'>
                    {timerSegments.map((segment) => (
                      <path
                        key={segment.key}
                        d={segment.d}
                        fill='none'
                        stroke={
                          segment.active ? timerColor : 'hsl(var(--muted))'
                        }
                        strokeWidth='4'
                        strokeLinecap='round'
                        style={{ transition: 'stroke 200ms ease' }}
                      />
                    ))}
                  </svg>
                  <span
                    className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${timerTextClass}`}
                  >
                    {timeLeft}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className='grid gap-2'>
            {currentQuestion.options.map((option, index) => (
              <Button
                key={`${currentQuestion.promptLexicardId}-${option}`}
                type='button'
                variant='outline'
                className='h-auto justify-start py-3 text-left'
                onClick={() => answerQuestion(index, false)}
                disabled={isAnswering || isFinalizing}
              >
                {option}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelLeave()
            return
          }
          setLeaveDialogOpen(true)
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            handleCancelLeave()
          }}
        >
          <DialogHeader>
            <DialogTitle>¿Salir del test oficial?</DialogTitle>
            <DialogDescription>
              Si sales del test ICA, perderás este intento oficial del mes y
              quedará marcado como fallido.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={handleCancelLeave}>
              Continuar test
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleConfirmLeave}
            >
              Sí, salir y marcar fallido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
