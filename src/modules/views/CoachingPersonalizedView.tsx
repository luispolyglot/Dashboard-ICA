import { useEffect, useMemo, useState } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  completeCoachingExerciseObjective,
  fetchMyCoachingDashboard,
  type CoachingMembership,
} from '../services/coaching'
import { CoachingProgramPreview } from './CoachingProgramPreview'
import { CoachingV2SessionBoard } from './CoachingV2SessionBoard'

type CoachingPersonalizedViewProps = {
  targetLang?: string
}

function normalizeWeeklyObjectiveMap(
  value: unknown,
): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    output[key] = raw as Record<string, unknown>
  }
  return output
}

export function CoachingPersonalizedView({
  targetLang,
}: CoachingPersonalizedViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<CoachingMembership[]>([])
  const [completingExerciseWeek, setCompletingExerciseWeek] = useState<
    string | null
  >(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMyCoachingDashboard(targetLang)
      setMemberships(data)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar tu sección de coaching.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [targetLang])

  const selectedMembership = useMemo(() => {
    const activeSessions = memberships.filter((row) => row.status === 'active')
    if (activeSessions.length === 0) return null

    if (targetLang) {
      return (
        activeSessions.find(
          (row) => row.targetLang.toLowerCase() === targetLang.toLowerCase(),
        ) || null
      )
    }

    return activeSessions[0]
  }, [memberships, targetLang])

  const handleCompleteExercise = (weekKey: string) => {
    if (!selectedMembership) return

    setCompletingExerciseWeek(weekKey)
    void completeCoachingExerciseObjective({
      sessionId: selectedMembership.id,
      weekKey,
    })
      .then(() => {
        setMemberships((prev) =>
          prev.map((membership) => {
            if (membership.id !== selectedMembership.id) return membership

            const nextObjectivesByWeek = normalizeWeeklyObjectiveMap(
              membership.weeklyObjectives,
            )
            const weekObjective = nextObjectivesByWeek[weekKey] || {}
            const currentExercise =
              weekObjective.exercise &&
              typeof weekObjective.exercise === 'object' &&
              !Array.isArray(weekObjective.exercise)
                ? (weekObjective.exercise as Record<string, unknown>)
                : {}

            nextObjectivesByWeek[weekKey] = {
              ...weekObjective,
              exercise: {
                ...currentExercise,
                status: 'completed',
                completedAt: new Date().toISOString(),
              },
            }

            return {
              ...membership,
              weeklyObjectives: nextObjectivesByWeek,
            }
          }),
        )
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo marcar el ejercicio como completado.',
        )
      })
      .finally(() => {
        setCompletingExerciseWeek((current) =>
          current === weekKey ? null : current,
        )
      })
  }

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>
            Coaching Personalizado
          </h2>
          <p className='text-sm text-muted-foreground'>
            Programa de 12 semanas con tus clases, objetivos y feedback.
          </p>
        </div>

        <Button type='button' variant='outline' onClick={() => void loadData()}>
          <RefreshCwIcon className='h-4 w-4' />
          Recargar
        </Button>
      </div>

      {loading ? (
        <p className='text-sm text-muted-foreground'>Cargando coaching...</p>
      ) : error ? (
        <p className='text-sm text-destructive'>{error}</p>
      ) : !selectedMembership ? (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            Todavía no tienes una sesión activa en coaching para tu idioma
            actual.
          </CardContent>
        </Card>
      ) : (
        selectedMembership.programVersion === 'v2' ? (
          <CoachingV2SessionBoard
            sessionId={selectedMembership.id}
            mode='student'
            targetLang={selectedMembership.targetLang}
            userId={selectedMembership.userId}
            coachDisplayName={selectedMembership.coachDisplayName}
          />
        ) : (
          <CoachingProgramPreview
            membership={selectedMembership}
            allowExerciseCompletion
            completingExerciseWeek={completingExerciseWeek}
            onCompleteExercise={handleCompleteExercise}
          />
        )
      )}
    </section>
  )
}
