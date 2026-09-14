import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  completeCoachingExerciseObjective,
  fetchMyCoachingDashboard,
  type CoachingMembership,
} from '../services/coaching'
import { getCoachingPersonalizedSessionRoute } from '../routes/paths'
import { CoachingProgramPreview } from './CoachingProgramPreview'
import { CoachingV3SessionBoard } from './CoachingV3SessionBoard'

type CoachingPersonalizedViewProps = {
  targetLang?: string
}

type CoachingPersonalizedSessionViewProps = {
  sessionId: string
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
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<CoachingMembership[]>([])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMyCoachingDashboard()
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

  const activeMemberships = useMemo(
    () => memberships.filter((row) => row.status === 'active'),
    [memberships],
  )

  const finalizedMemberships = useMemo(
    () =>
      memberships.filter(
        (row) => row.status === 'completed' || row.status === 'cancelled',
      ),
    [memberships],
  )

  const renderSessionList = (rows: CoachingMembership[]) => {
    return rows.map((membership) => (
      <button
        key={membership.id}
        type='button'
        className='w-full rounded-lg border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-accent'
        onClick={() =>
          navigate(getCoachingPersonalizedSessionRoute(membership.id))
        }
      >
        <div className='mb-2 flex items-start justify-between gap-2'>
          <p className='font-semibold text-foreground'>
            {membership.targetLang} - {membership.level}
          </p>
          <span
            className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${membership.status === 'active' ? 'bg-primary' : 'bg-foreground/50'}`}
            aria-hidden='true'
          />
        </div>
        <p className='text-sm text-muted-foreground'>
          Coach: {membership.coachDisplayName || 'Sin coach asignado'}
        </p>
      </button>
    ))
  }

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>
            Coaching Personalizado
          </h2>
          <p className='text-sm text-muted-foreground'>
            Sesiones activas y finalizadas de tu coaching.
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
      ) : memberships.length === 0 ? (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            Todavía no tienes sesiones de coaching personalizadas.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-6'>
          <Card>
            <CardContent className='space-y-3 py-5'>
              <h3 className='text-lg font-semibold'>Sesiones activas</h3>
              {activeMemberships.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No tienes sesiones activas.
                </p>
              ) : (
                <div className='grid gap-3'>
                  {renderSessionList(activeMemberships)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className='space-y-3 py-5'>
              <h3 className='text-lg font-semibold'>Sesiones finalizadas</h3>
              {finalizedMemberships.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No tienes sesiones finalizadas.
                </p>
              ) : (
                <div className='grid gap-3'>
                  {renderSessionList(finalizedMemberships)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}

export function CoachingPersonalizedSessionView({
  sessionId,
}: CoachingPersonalizedSessionViewProps) {
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
      const data = await fetchMyCoachingDashboard()
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
  }, [sessionId])

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.id === sessionId) || null,
    [memberships, sessionId],
  )

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
          <h2 className='mb-1 font-serif text-3xl font-bold'>Detalle de sesión</h2>
          <p className='text-sm text-muted-foreground'>
            Visualiza el contenido completo de esta sesión.
          </p>
        </div>

        <Button type='button' variant='outline' onClick={() => void loadData()}>
          <RefreshCwIcon className='h-4 w-4' />
          Recargar
        </Button>
      </div>

      {loading ? (
        <p className='text-sm text-muted-foreground'>Cargando sesión...</p>
      ) : error ? (
        <p className='text-sm text-destructive'>{error}</p>
      ) : !selectedMembership ? (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            No se encontró esta sesión en tu historial de coaching.
          </CardContent>
        </Card>
      ) : selectedMembership.programVersion === 'v2' ? (
        <CoachingV3SessionBoard
          sessionId={selectedMembership.id}
          mode='student'
          targetLang={selectedMembership.targetLang}
          userId={selectedMembership.userId}
          coachDisplayName={selectedMembership.coachDisplayName}
        />
      ) : (
        <CoachingProgramPreview
          membership={selectedMembership}
          allowExerciseCompletion={selectedMembership.status === 'active'}
          completingExerciseWeek={completingExerciseWeek}
          onCompleteExercise={handleCompleteExercise}
        />
      )}
    </section>
  )
}
