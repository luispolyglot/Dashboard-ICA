import { useEffect, useMemo, useState } from 'react'
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
  submitIcaOwnWordsChallengeResult,
} from '../services/icaChallenges'
import type { IcaChallengeRecord, IcaTestQuestion, Lexicard } from '../types'

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
  const [challenge, setChallenge] = useState<IcaChallengeRecord | null>(null)
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

        if (!active) return
        setCurrentUserId(data.user?.id ?? null)
        setChallenge(challengeData)
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
    return hasOwnWordsResult(challenge, currentUserId)
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
        setChallenge(updated)
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
    return <p className='text-sm text-muted-foreground'>Cargando desafío...</p>
  }

  if (error || !challenge) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No se pudo abrir el desafío</CardTitle>
          <CardDescription>{error || 'No encontramos el desafío.'}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (challenge.challengeSlug !== ICA_CHALLENGE_SLUG_OWN_WORDS) {
    return (
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
    return (
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
    return (
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

  if (alreadyPlayed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ya jugaste este desafío</CardTitle>
          <CardDescription>
            Tu resultado ya fue enviado. Espera al rival o revisa el resultado final.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to={DASHBOARD_ROUTES.challengesIca}>Volver a Desafíos ICA</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!hasStarted) {
    return (
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
    return (
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
    return (
      <Card>
        <CardHeader>
          <CardTitle>Finalizando...</CardTitle>
          <CardDescription>Estamos cerrando tu intento.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
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
    </div>
  )
}
