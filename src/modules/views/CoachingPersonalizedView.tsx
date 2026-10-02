import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightIcon, CrownIcon, TrophyIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  completeCoachingExerciseObjective,
  fetchMyCoachingDashboard,
  type CoachingMembership,
} from '../services/coaching'
import { getCoachingPersonalizedSessionRoute } from '../routes/paths'
import { CoachingProgramPreview } from './CoachingProgramPreview'
import { CoachingV3SessionBoard } from './CoachingV3SessionBoard'
import { t, langName } from '@/i18n'
import { EmptyState, GamePage, IconTile, ListRow, PageTitle, RowGroup, SectionLabel } from '../game/ui'

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
          : t('No se pudo cargar tu sección de coaching.')
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

  const coachLabel = (membership: CoachingMembership) => {
    const mainCoach = (membership.coachDisplayName || '').trim()
    if (!mainCoach || mainCoach.toLowerCase() === 'luis') return 'Luis'
    return t('Luis y {coach}', { coach: mainCoach })
  }

  return (
    <GamePage className='gap-6 lg:max-w-3xl'>
      <PageTitle
        icon={
          <IconTile tone='gold' size={52} solid>
            <CrownIcon className='size-7' strokeWidth={2.6} aria-hidden='true' />
          </IconTile>
        }
        subtitle={t('Tus 12 semanas de Coaching ICA, en un solo sitio.')}
      >
        {t('Tu coaching')}
      </PageTitle>

      {loading ? (
        <div className='h-48 animate-pulse rounded-[32px] bg-muted' aria-hidden='true' />
      ) : error ? (
        <p className='m-0 rounded-2xl px-3 py-2 text-sm font-bold' style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}>
          {error}
        </p>
      ) : memberships.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone='gold' size={72}>
              <CrownIcon className='size-9' strokeWidth={2.4} aria-hidden='true' />
            </IconTile>
          }
          title={t('Todavía no tienes coaching')}
          text={t('Cuando empieces tu Coaching ICA, aquí verás tus clases, focos y reportes.')}
        />
      ) : (
        <>
          {activeMemberships.length > 0 ? (
            <div className='flex flex-col gap-4'>
              {activeMemberships.map((membership) => (
                <button
                  key={membership.id}
                  type='button'
                  onClick={() => navigate(getCoachingPersonalizedSessionRoute(membership.id))}
                  className='coaching-hero ica-press relative w-full overflow-hidden rounded-[32px] px-6 py-6 text-left text-white'
                >
                  <span className='coaching-hero-glow pointer-events-none absolute -top-20 -right-12 size-64 rounded-full' aria-hidden='true' />
                  <span className='relative flex items-start justify-between gap-4'>
                    <span className='min-w-0'>
                      <span
                        className='inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black tracking-[0.14em] uppercase'
                        style={{ color: 'var(--ica-gold)' }}
                      >
                        <CrownIcon className='size-3.5' strokeWidth={2.8} aria-hidden='true' />
                        Coaching ICA
                      </span>
                      <span className='mt-3 block font-display text-4xl leading-none font-black tracking-tight'>
                        {langName(membership.targetLang)}
                      </span>
                      <span className='mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-white/80'>
                        <span className='rounded-full px-2.5 py-0.5 text-xs font-black' style={{ background: 'var(--ica-gold)', color: '#4a3200' }}>
                          {membership.level}
                        </span>
                        {t('Con {coach}', { coach: coachLabel(membership) })}
                      </span>
                    </span>
                    <span
                      className='flex size-12 shrink-0 items-center justify-center rounded-2xl'
                      style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 4px 0 var(--ica-gold-edge)' }}
                    >
                      <ArrowRightIcon className='size-6' strokeWidth={2.8} aria-hidden='true' />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {finalizedMemberships.length > 0 ? (
            <div>
              <SectionLabel>{t('Coachings terminados')}</SectionLabel>
              <RowGroup>
                {finalizedMemberships.map((membership) => (
                  <ListRow
                    key={membership.id}
                    onClick={() => navigate(getCoachingPersonalizedSessionRoute(membership.id))}
                    icon={
                      <IconTile tone='gold' size={44}>
                        <TrophyIcon className='size-5' strokeWidth={2.4} aria-hidden='true' />
                      </IconTile>
                    }
                    title={`${langName(membership.targetLang)} · ${membership.level}`}
                    text={t('Con {coach}', { coach: coachLabel(membership) })}
                  />
                ))}
              </RowGroup>
            </div>
          ) : null}
        </>
      )}
    </GamePage>
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
          : t('No se pudo cargar tu sección de coaching.')
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
            : t('No se pudo marcar el ejercicio como completado.'),
        )
      })
      .finally(() => {
        setCompletingExerciseWeek((current) =>
          current === weekKey ? null : current,
        )
      })
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-8 lg:px-8'>
      {loading ? (
        <div className='h-64 animate-pulse rounded-[32px] bg-muted' aria-hidden='true' />
      ) : error ? (
        <p className='text-sm text-destructive'>{error}</p>
      ) : !selectedMembership ? (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            {t('No se encontró esta sesión en tu historial de coaching.')}
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
