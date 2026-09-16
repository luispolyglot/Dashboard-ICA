import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useIcaTestRunner } from '../hooks/useIcaTestRunner'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  buildOwnWordsChallengeQuestions,
  getIcaChallengeById,
  getOwnWordsChallengeConfig,
  hasOwnWordsResult,
  ICA_CHALLENGE_SLUG_OWN_WORDS,
  listIcaChallengePlays,
  submitIcaOwnWordsChallengeResult,
} from '../services/icaChallenges'
import type {
  IcaChallengePlayRecord,
  IcaChallengeRecord,
  IcaTestQuestion,
  Lexicard,
} from '../types'

type IcaChallengePlayViewProps = {
  challengeId: string
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
}

export function IcaChallengePlayView({
  challengeId,
  targetLang,
  nativeLang,
  cards,
}: IcaChallengePlayViewProps) {
  const renderPage = (content: ReactNode) => (
    <section className='mx-auto w-full max-w-4xl flex-1 p-4 pb-24 lg:pb-4'>{content}</section>
  )

  const [challenge, setChallenge] = useState<IcaChallengeRecord | null>(null)
  const [plays, setPlays] = useState<IcaChallengePlayRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [{ data }, challengeData] = await Promise.all([
          supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null }, error: null }),
          getIcaChallengeById(challengeId),
        ])

        const playRows = await listIcaChallengePlays(challengeId)

        if (!active) return
        setCurrentUserId(data.user?.id ?? null)
        setChallenge(challengeData)
        setPlays(playRows)
      } catch {
        if (!active) return
        setError('No pudimos cargar el desafío.')
      } finally {
        if (!active) return
        setIsLoading(false)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [challengeId])

  const config = useMemo(
    () => getOwnWordsChallengeConfig(challenge?.gameMetadata || {}),
    [challenge?.gameMetadata],
  )

  const questions: IcaTestQuestion[] = useMemo(() => {
    if (!challenge || !hasStarted) return []
    return buildOwnWordsChallengeQuestions(cards, targetLang, nativeLang, config.rounds)
  }, [cards, challenge, config.rounds, hasStarted, nativeLang, targetLang])

  const myCompetitor = useMemo(() => {
    if (!challenge || !currentUserId) return null
    return challenge.competitors.find((item) => item.userId === currentUserId) ?? null
  }, [challenge, currentUserId])

  const alreadyPlayed = useMemo(() => {
    if (!challenge || !currentUserId) return false
    return hasOwnWordsResult(challenge, currentUserId, plays)
  }, [challenge, currentUserId, plays])

  const rivalCompetitor = useMemo(() => {
    if (!challenge || !currentUserId) return null
    return challenge.competitors.find((item) => item.userId !== currentUserId) ?? null
  }, [challenge, currentUserId])

  const isMyTurn = useMemo(() => {
    if (!challenge || !currentUserId) return false
    return !challenge.turnUserId || challenge.turnUserId === currentUserId
  }, [challenge, currentUserId])

  const runner = useIcaTestRunner({
    questions,
    secondsPerQuestion: config.responseSeconds,
    onFinish: async (answers) => {
      if (!challenge) return
      setIsSubmitting(true)
      try {
        await submitIcaOwnWordsChallengeResult({
          challengeId: challenge.id,
          score: answers.filter((item) => item.isCorrect).length,
          totalQuestions: questions.length,
          answers,
          rounds: config.rounds,
          responseSeconds: config.responseSeconds,
        })
        const updated = await getIcaChallengeById(challenge.id)
        const updatedPlays = await listIcaChallengePlays(challenge.id)
        setChallenge(updated)
        setPlays(updatedPlays)
        toast.success('Resultado enviado.')
      } catch (submitError) {
        toast.error(
          submitError instanceof Error
            ? submitError.message
            : 'No se pudo enviar el resultado.',
        )
      } finally {
        setIsSubmitting(false)
      }
    },
  })

  if (isLoading) {
    return renderPage(<p className='text-sm text-muted-foreground'>Cargando desafío...</p>)
  }

  if (error || !challenge) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>No se pudo abrir el desafío</CardTitle>
          <CardDescription>{error || 'No encontramos el desafío.'}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (challenge.challengeSlug !== ICA_CHALLENGE_SLUG_OWN_WORDS) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>Desafío no soportado</CardTitle>
          <CardDescription>
            Este modo todavía no tiene pantalla de juego.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!myCompetitor || myCompetitor.invitationStatus !== 'accepted') {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>Aún no puedes jugar</CardTitle>
          <CardDescription>
            Debes ser competidor aceptado para iniciar este desafío.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (challenge.status !== 'in_progress' && !alreadyPlayed) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>El desafío no está en curso</CardTitle>
          <CardDescription>
            Estado actual: {challenge.status}. Revisa la pantalla de desafíos.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (challenge.status === 'in_progress' && !alreadyPlayed && !isMyTurn) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>Aún no es tu turno</CardTitle>
          <CardDescription>
            Tu rival debe jugar primero. Vuelve desde Desafíos ICA cuando el turno cambie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant='outline'>
            <Link to={DASHBOARD_ROUTES.challengesIca}>Volver a Desafíos ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (alreadyPlayed) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>Ya jugaste este desafío</CardTitle>
          <CardDescription>
            Tu resultado ya fue enviado. Espera al rival o revisa el resultado final.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='rounded-lg border bg-muted/20 px-3 py-2 text-sm'>
            <p className='font-medium'>Marcador actual</p>
            <p className='text-muted-foreground'>
              Tú: {myCompetitor.score ?? 0} · Rival: {rivalCompetitor?.score ?? 0}
            </p>
          </div>
          <Button asChild>
            <Link to={DASHBOARD_ROUTES.challengesIca}>Volver a Desafíos ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!hasStarted) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>Palabras ICA propias</CardTitle>
          <CardDescription>
            {config.rounds} rondas y {config.responseSeconds}s por respuesta.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p className='text-sm text-muted-foreground'>
            Tendrás opciones múltiples y reloj en cuenta regresiva. Al terminar,
            guardamos tu puntuación automáticamente.
          </p>
          <Button type='button' onClick={() => setHasStarted(true)}>
            Empezar ahora
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (questions.length === 0) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>No hay palabras suficientes</CardTitle>
          <CardDescription>
            Necesitas al menos 4 palabras ICA para generar opciones.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!runner.currentQuestion) {
    return renderPage(
      <Card>
        <CardHeader>
          <CardTitle>Finalizando...</CardTitle>
          <CardDescription>Estamos cerrando tu intento.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return renderPage(
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>
            Ronda {runner.currentQuestionIndex + 1}/{runner.totalQuestions}
          </CardTitle>
          <CardDescription>
            Tiempo restante: {runner.timeLeft}s · Aciertos: {runner.score}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='h-2 overflow-hidden rounded-full border bg-muted'>
            <div
              className='h-full bg-primary transition-all duration-300'
              style={{ width: `${runner.progressPercent}%` }}
            />
          </div>
          <div className='rounded-lg border bg-muted/20 p-3 text-center text-lg font-semibold'>
            {runner.currentQuestion.promptNative}
          </div>
          <div className='grid gap-2'>
            {runner.currentQuestion.options.map((option, index) => (
              <Button
                key={option}
                type='button'
                variant='outline'
                disabled={runner.isAnswering || isSubmitting}
                onClick={() => runner.answerQuestion(index)}
              >
                {option}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>,
  )
}
