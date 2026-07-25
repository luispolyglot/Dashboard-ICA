import { useMemo, useState } from 'react'
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckSquareIcon,
  DownloadIcon,
  GoalIcon,
  LanguagesIcon,
  PlayCircleIcon,
  RepeatIcon,
  SearchIcon,
  SquareIcon,
  UserIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatScheduledClassDateTime,
  hasPostClassResources,
  shouldRenderUpcomingClassResources,
} from './coachingClassResources'

type ClassSession = {
  key: string
  loomUrl: string | null
  report: string | null
  reportImagePath: string | null
  reportImageUrl: string | null
  scheduledAt: string | null
  classJoinUrl: string | null
}

type ProgramPreviewMembership = {
  id: string
  targetLang: string
  level: string
  coachDisplayName?: string | null
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  activatedAt: string | null
  durationWeeks: number
  weekActivation?: {
    lastActivatedWeek: number
    activatedWeeks: string[]
    currentActiveWeek: number | null
    nextWeekEligible: number | null
    nextWeekBlockedReason:
      | 'missing_objectives'
      | 'previous_week_not_finished'
      | null
  }
  weekTimeline?: Array<{
    weekNumber: number
    weekKey: string
    activatedAt: string
    endedAt: string | null
  }>
  classSessions: unknown[]
  weeklyObjectives: Record<string, unknown>
  weekProgress?: Record<
    string,
    {
      wordsCreated: number
      closedMasterNotes: number
      icaStreakPct: number
      flashcardsStreakPct: number
    }
  >
  closedMasterNotesByWeek?: Record<
    string,
    Array<{
      id: string
      name: string
      createdAt?: string
      closedAt: string
      feedbackLoomUrl: string | null
      feedbackNotes?: string | null
    }>
  >
}

type CoachingProgramPreviewProps = {
  membership: ProgramPreviewMembership
  allowExerciseCompletion?: boolean
  completingExerciseWeek?: string | null
  onCompleteExercise?: (weekKey: string) => void
}

type ObjectiveStatusResult = {
  label: string
  done: boolean
  fillPct: number | null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.length === 0) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeProgramWeekKey(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  const direct = normalized.match(/^W(\d{1,2})$/)
  if (direct) {
    const week = Number(direct[1])
    if (Number.isFinite(week) && week >= 1 && week <= 12) {
      return `W${String(week).padStart(2, '0')}`
    }
  }

  const legacy = normalized.match(/-S(\d)$/)
  if (legacy) {
    const week = Number(legacy[1])
    if (Number.isFinite(week) && week >= 1) {
      return `W${String(week).padStart(2, '0')}`
    }
  }

  return null
}

function weekNumberFromKey(value: string): number {
  const normalized = normalizeProgramWeekKey(value)
  if (!normalized) return 1
  const parsed = Number(normalized.slice(1))
  if (!Number.isFinite(parsed)) return 1
  return Math.min(12, Math.max(1, parsed))
}

function normalizeWeeklyObjectiveMap(
  value: unknown,
): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    output[normalizeProgramWeekKey(key) || key] = raw as Record<string, unknown>
  }
  return output
}

function normalizeClassSessions(value: unknown[]): ClassSession[] {
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      key:
        normalizeProgramWeekKey(toString(item.key)) ||
        normalizeProgramWeekKey(toString(item.weekKey)) ||
        normalizeProgramWeekKey(toString(item.week_key)) ||
        normalizeProgramWeekKey(toString(item.week)) ||
        'W01',
      loomUrl: toString(item.loomUrl ?? item.loom_url),
      report: toString(item.report),
      reportImagePath: toString(item.reportImagePath ?? item.report_image_path),
      reportImageUrl: toString(item.reportImageUrl ?? item.report_image_url),
      scheduledAt: toString(item.scheduledAt ?? item.scheduled_at),
      classJoinUrl: toString(item.classJoinUrl ?? item.class_join_url),
    }))
}

function getEmbeddableVideoUrl(value: string | null): string | null {
  if (!value) return null
  if (/loom\.com/i.test(value)) {
    return value.replace('/share/', '/embed/').replace('/shared/', '/embed/')
  }
  return null
}

function objectiveStatus(
  target: number | null,
  actual: number,
): ObjectiveStatusResult {
  if (target === null)
    return { label: 'No definido', done: false, fillPct: null }
  if (target <= 0)
    return { label: `${actual}/${target}`, done: true, fillPct: 100 }
  const ratio = Math.max(0, Math.min(100, Math.round((actual / target) * 100)))
  return {
    label: `${actual}/${target}`,
    done: actual >= target,
    fillPct: ratio,
  }
}

function normalizeExerciseObjective(value: unknown): {
  url: string | null
  status: 'pending' | 'completed'
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { url: null, status: 'pending' }
  }
  const record = value as Record<string, unknown>
  const url = toString(record.url)
  const status = record.status === 'completed' ? 'completed' : 'pending'
  return {
    url,
    status: url && status === 'completed' ? 'completed' : 'pending',
  }
}

function formatDateLabel(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible'
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTimelineDateLabel(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible'
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function statusLabel(status: ProgramPreviewMembership['status']): string {
  if (status === 'active') return 'Activo'
  if (status === 'completed') return 'Completado'
  if (status === 'cancelled') return 'Archivado'
  return 'Borrador'
}

function statusVariant(
  status: ProgramPreviewMembership['status'],
): 'default' | 'secondary' | 'outline' {
  if (status === 'active') return 'default'
  if (status === 'completed') return 'secondary'
  return 'outline'
}

type ObjectiveItemProps = {
  title: string
  status: ObjectiveStatusResult
}

function ObjectiveItem({ title, status }: ObjectiveItemProps) {
  const isDefined = status.fillPct !== null

  return (
    <div className='rounded-lg border bg-muted/30 p-3'>
      <div className='mb-2 flex items-center justify-between gap-3'>
        <p className='text-sm'>{title}</p>
        <Badge variant={status.done ? 'default' : 'outline'}>
          {status.done ? 'Cumplido' : status.label}
        </Badge>
      </div>

      {isDefined ? (
        <div className='h-2 overflow-hidden rounded-full bg-muted'>
          <div
            className={`h-full rounded-full transition-all ${
              status.done ? 'bg-primary' : 'bg-primary/45'
            }`}
            style={{ width: `${status.fillPct || 0}%` }}
          />
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>Sin objetivo asignado.</p>
      )}
    </div>
  )
}

export function CoachingProgramPreview({
  membership,
  allowExerciseCompletion = false,
  completingExerciseWeek = null,
  onCompleteExercise,
}: CoachingProgramPreviewProps) {
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  const classSessionsByWeek = useMemo(() => {
    const map = new Map<string, ClassSession[]>()
    for (const session of normalizeClassSessions(membership.classSessions)) {
      const existing = map.get(session.key) || []
      existing.push(session)
      map.set(session.key, existing)
    }
    return map
  }, [membership.classSessions])

  const objectivesByWeek = useMemo(
    () => normalizeWeeklyObjectiveMap(membership.weeklyObjectives),
    [membership.weeklyObjectives],
  )

  const durationWeeks = membership.durationWeeks || 12
  const activatedWeekKeys = useMemo(
    () =>
      (membership.weekActivation?.activatedWeeks || [])
        .map((value) => normalizeProgramWeekKey(value))
        .filter((value): value is string => Boolean(value)),
    [membership.weekActivation?.activatedWeeks],
  )
  const currentProgramWeek =
    membership.weekActivation?.currentActiveWeek || null
  const unlockedWeeks = activatedWeekKeys.length
  const unlockedProgressPct = Math.round((unlockedWeeks / durationWeeks) * 100)
  const weekTimelineByKey = useMemo(() => {
    const map = new Map<
      string,
      { activatedAt: string; endedAt: string | null }
    >()
    for (const item of membership.weekTimeline || []) {
      const normalizedKey = normalizeProgramWeekKey(item.weekKey)
      if (!normalizedKey) continue
      map.set(normalizedKey, {
        activatedAt: item.activatedAt,
        endedAt: item.endedAt || null,
      })
    }
    return map
  }, [membership.weekTimeline])

  return (
    <div className='grid gap-4'>
      <Card className='border-primary/20 bg-linear-to-br from-primary/10 via-background to-muted'>
        <CardContent className='grid gap-4 py-1 md:grid-cols-[1fr_auto] md:items-start'>
          <div className='flex flex-col justify-between gap-4 h-full'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={statusVariant(membership.status)}>
                {statusLabel(membership.status)}
              </Badge>
              <Badge variant='outline'>Programa {durationWeeks} semanas</Badge>
            </div>

            <div className='grid gap-2 text-sm sm:grid-cols-3'>
              <p className='inline-flex items-center gap-2 text-muted-foreground'>
                <LanguagesIcon className='h-4 w-4 text-primary' />
                Idioma:{' '}
                <span className='font-medium text-foreground'>
                  {membership.targetLang}
                </span>
              </p>
              <p className='inline-flex items-center gap-2 text-muted-foreground'>
                <BookOpenIcon className='h-4 w-4 text-primary' />
                Nivel:{' '}
                <span className='font-medium text-foreground'>
                  {membership.level}
                </span>
              </p>
              <p className='inline-flex items-center gap-2 text-muted-foreground'>
                <UserIcon className='h-4 w-4 text-primary' />
                Coach:{' '}
                <span className='font-medium text-foreground'>
                  {membership.coachDisplayName || 'Por asignar'}
                </span>
              </p>
            </div>
          </div>

          <div className='w-full min-w-52 rounded-lg border bg-card/80 p-3 md:w-64'>
            <p className='mb-1 text-xs uppercase tracking-wide text-muted-foreground'>
              Semana actual
            </p>
            <p className='mb-2 text-2xl font-semibold text-foreground'>
              {currentProgramWeek || '-'}
              <span className='ml-1 text-sm font-normal text-muted-foreground'>
                / {durationWeeks}
              </span>
            </p>
            <div className='h-2 overflow-hidden rounded-full bg-muted'>
              <div
                className='h-full rounded-full bg-primary transition-all'
                style={{ width: `${unlockedProgressPct}%` }}
              />
            </div>
            <p className='mt-2 text-xs text-muted-foreground'>
              {unlockedWeeks > 0
                ? `${unlockedProgressPct}% del programa habilitado`
                : 'Esperando activación del coach'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Accordion
        type='multiple'
        className='w-full rounded-xl border bg-card/70'
      >
        {activatedWeekKeys.map((weekKey) => {
          const week = weekNumberFromKey(weekKey)
          const objectives = objectivesByWeek[weekKey] || {}
          const progress = membership.weekProgress?.[weekKey] || {
            wordsCreated: 0,
            closedMasterNotes: 0,
            icaStreakPct: 0,
            flashcardsStreakPct: 0,
          }
          const weekClasses = classSessionsByWeek.get(weekKey) || []
          const latestClass = weekClasses[0] || null
          const hasRecordedClassResources = latestClass
            ? hasPostClassResources(latestClass)
            : false
          const closedNotes = [
            ...(membership.closedMasterNotesByWeek?.[weekKey] || []),
          ].sort((a, b) =>
            a.name.localeCompare(b.name, 'es', {
              numeric: true,
              sensitivity: 'base',
            }),
          )

          const wordsTarget = toNumber(objectives.wordsTarget)
          const nmTarget = toNumber(objectives.nmTarget)
          const icaStreakTarget = toNumber(
            objectives.icaStreakObjectivePct ?? objectives.icaStreakTargetPct,
          )
          const flashcardsTarget = toNumber(
            objectives.flashcardsStreakObjectivePct ??
              objectives.flashcardsStreakAchievedPct ??
              objectives.icaStreakAchievedPct,
          )
          const exercise = normalizeExerciseObjective(
            objectives.exercise ||
              (toString(objectives.reportExerciseUrl)
                ? {
                    url: toString(objectives.reportExerciseUrl),
                    status: 'pending',
                  }
                : null),
          )

          const wordsStatus = objectiveStatus(
            wordsTarget,
            progress.wordsCreated,
          )
          const notesStatus = objectiveStatus(
            nmTarget,
            progress.closedMasterNotes,
          )
          const icaStatus = objectiveStatus(
            icaStreakTarget,
            progress.icaStreakPct,
          )
          const flashcardsStatus = objectiveStatus(
            flashcardsTarget,
            progress.flashcardsStreakPct,
          )
          const exerciseDone = exercise.status === 'completed'
          const canCompleteExerciseThisWeek =
            allowExerciseCompletion &&
            membership.status === 'active' &&
            week === currentProgramWeek
          const baseObjectiveStatuses = [
            wordsStatus,
            notesStatus,
            icaStatus,
            flashcardsStatus,
          ]
          const definedBaseObjectiveCount = baseObjectiveStatuses.filter(
            (status) => status.fillPct !== null,
          ).length
          const completedBaseObjectiveCount = baseObjectiveStatuses.filter(
            (status) => status.fillPct !== null && status.done,
          ).length
          const hasExerciseObjective = Boolean(exercise.url)
          const objectiveTotal =
            definedBaseObjectiveCount + (hasExerciseObjective ? 1 : 0)
          const objectiveDone =
            completedBaseObjectiveCount +
            (hasExerciseObjective && exerciseDone ? 1 : 0)
          const hasAnyObjective = objectiveTotal > 0
          const isWeekActivated = activatedWeekKeys.includes(weekKey)
          const isCurrentWeek = currentProgramWeek === week
          const isPastWeek = isWeekActivated && !isCurrentWeek
          const accordionBgClass = isPastWeek
            ? 'bg-muted'
            : isCurrentWeek
              ? 'bg-primary/10'
              : ''
          const weekTimeline = weekTimelineByKey.get(weekKey) || null
          const weekActivatedAt = weekTimeline?.activatedAt || null
          const weekClosedAt = weekTimeline?.endedAt || null

          return (
            <AccordionItem
              value={weekKey}
              key={weekKey}
              className={`border-b px-2 first:rounded-t-xl last:rounded-b-xl last:border-b-0 sm:px-4 ${accordionBgClass}`}
            >
              <AccordionTrigger className='py-4 hover:no-underline'>
                <div className='flex flex-1 flex-wrap items-center justify-between gap-2 pr-3 text-left'>
                  <div className='flex items-center gap-2'>
                    <span>Semana {week}</span>
                    {isCurrentWeek && <Badge variant='default'>Activa</Badge>}
                    {isPastWeek && (
                      <Badge variant='secondary'>Finalizada</Badge>
                    )}
                    {weekActivatedAt && weekClosedAt && (
                      <Badge variant='outline' className='gap-1'>
                        <span>{formatTimelineDateLabel(weekActivatedAt)}</span>
                        <ArrowRightIcon className='h-3 w-3' />
                        <span>{formatTimelineDateLabel(weekClosedAt)}</span>
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant={
                      !hasAnyObjective
                        ? 'outline'
                        : objectiveDone === objectiveTotal
                          ? 'default'
                          : 'secondary'
                    }
                  >
                    {hasAnyObjective
                      ? `${objectiveDone}/${objectiveTotal} objetivos`
                      : 'Sin objetivos'}
                  </Badge>
                </div>
              </AccordionTrigger>

              <AccordionContent className='pb-4'>
                <div className='mt-4 flex flex-col gap-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='flex items-center gap-2'>
                        <GoalIcon className='h-4 w-4 text-primary' />
                        Objetivos semanales
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                      <ObjectiveItem
                        title='Palabras ICA'
                        status={wordsStatus}
                      />
                      <ObjectiveItem
                        title='Notas maestras cerradas'
                        status={notesStatus}
                      />
                      <ObjectiveItem title='Racha ICA (%)' status={icaStatus} />
                      <ObjectiveItem
                        title='Racha flashcards (%)'
                        status={flashcardsStatus}
                      />

                      <div className='rounded-lg border bg-muted/30 p-3'>
                        <div className='mb-2 flex items-center justify-between gap-2'>
                          <p className='text-sm'>Objetivo ejercicio</p>
                          <Badge
                            variant={exerciseDone ? 'default' : 'outline'}
                            className={
                              exerciseDone
                                ? 'bg-primary text-primary-foreground'
                                : undefined
                            }
                          >
                            {exercise.url
                              ? exerciseDone
                                ? 'Cumplido'
                                : 'Pendiente'
                              : 'No definido'}
                          </Badge>
                        </div>

                        {exercise.url ? (
                          <div className='space-y-2'>
                            <a
                              href={exercise.url}
                              target='_blank'
                              rel='noreferrer'
                              className='inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2'
                            >
                              Abrir ejercicio
                            </a>

                            {allowExerciseCompletion && (
                              <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                  if (exerciseDone || !onCompleteExercise)
                                    return
                                  onCompleteExercise(weekKey)
                                }}
                                disabled={
                                  exerciseDone ||
                                  !canCompleteExerciseThisWeek ||
                                  completingExerciseWeek === weekKey
                                }
                                className='w-full justify-start'
                              >
                                {exerciseDone ? (
                                  <CheckSquareIcon className='h-4 w-4' />
                                ) : (
                                  <SquareIcon className='h-4 w-4' />
                                )}
                                {exerciseDone
                                  ? 'Confirmado por ti'
                                  : completingExerciseWeek === weekKey
                                    ? 'Guardando...'
                                    : 'Marcar como hecho'}
                              </Button>
                            )}

                            {allowExerciseCompletion &&
                              !canCompleteExerciseThisWeek &&
                              !exerciseDone && (
                                <p className='text-xs text-muted-foreground'>
                                  Solo puedes marcar este ejercicio durante la
                                  semana {week}.
                                </p>
                              )}
                          </div>
                        ) : (
                          <p className='text-xs text-muted-foreground'>
                            Tu coach aún no definió un ejercicio para esta
                            semana.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='flex items-center gap-2'>
                        <PlayCircleIcon className='h-4 w-4 text-primary' />
                        Mi clase
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                      {!latestClass ? (
                        <div className='rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground'>
                          Aún no hay clase cargada para esta semana.
                        </div>
                      ) : shouldRenderUpcomingClassResources(latestClass) ? (
                        <div className='rounded-lg border bg-muted/20 p-3'>
                          <p className='mb-1 text-xs font-medium tracking-wide text-muted-foreground'>
                            Fecha y hora de la clase, y enlace de acceso
                          </p>
                          <div className='flex flex-col gap-0'>
                            {latestClass.scheduledAt && (
                              <p className='inline-flex items-center gap-1 text-sm text-foreground'>
                                <CalendarIcon className='h-4 w-4 text-primary' />
                                {formatScheduledClassDateTime(
                                  latestClass.scheduledAt,
                                )}
                              </p>
                            )}
                            {latestClass.classJoinUrl && (
                              <a
                                href={latestClass.classJoinUrl}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='inline-flex w-fit items-center gap-2 text-sm text-primary underline underline-offset-2'
                              >
                                <PlayCircleIcon className='h-4 w-4' />
                                Ir a mi clase en vivo
                              </a>
                            )}
                          </div>
                        </div>
                      ) : hasRecordedClassResources ? (
                        <>
                          <div className='grid gap-3 md:grid-cols-2'>
                            <div className='space-y-2'>
                              {getEmbeddableVideoUrl(latestClass.loomUrl) ? (
                                <div className='overflow-hidden rounded-lg border'>
                                  <iframe
                                    src={
                                      getEmbeddableVideoUrl(
                                        latestClass.loomUrl,
                                      ) || ''
                                    }
                                    title={`Video semana ${week}`}
                                    className='aspect-video w-full'
                                    allow='autoplay; fullscreen; picture-in-picture'
                                    allowFullScreen
                                  />
                                </div>
                              ) : latestClass.loomUrl ? (
                                <a
                                  href={latestClass.loomUrl}
                                  target='_blank'
                                  rel='noopener noreferrer'
                                  className='inline-flex w-fit items-center gap-2 text-sm text-primary underline underline-offset-2'
                                >
                                  <PlayCircleIcon className='h-4 w-4' />
                                  Abrir clase en Loom
                                </a>
                              ) : (
                                <p className='text-sm text-muted-foreground'>
                                  Aún no hay video de clase para esta semana.
                                </p>
                              )}
                            </div>

                            <div className='space-y-2'>
                              {latestClass.reportImageUrl ? (
                                <>
                                  <button
                                    type='button'
                                    onClick={() =>
                                      setImagePreviewUrl(
                                        latestClass.reportImageUrl,
                                      )
                                    }
                                    className='group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border text-left'
                                  >
                                    <img
                                      src={latestClass.reportImageUrl}
                                      alt='Imagen del reporte de clase'
                                      className='max-h-56 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]'
                                    />
                                    <div className='absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100'>
                                      <SearchIcon className='h-5 w-5 text-white' />
                                    </div>
                                  </button>
                                  <a
                                    href={latestClass.reportImageUrl}
                                    download
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className='inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2'
                                  >
                                    <DownloadIcon className='h-3.5 w-3.5' />
                                    Descargar imagen del reporte
                                  </a>
                                </>
                              ) : (
                                <p className='text-sm text-muted-foreground'>
                                  Aún no hay imagen de reporte para esta semana.
                                </p>
                              )}
                            </div>
                          </div>

                          {latestClass.report && (
                            <div className='rounded-lg border bg-muted/30 p-3'>
                              <p className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                                Reporte
                              </p>
                              <p className='text-sm'>{latestClass.report}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className='rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground'>
                          Aún no hay recursos de clase disponibles.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='flex items-center gap-2'>
                        <RepeatIcon className='h-4 w-4 text-primary' />
                        Revision de notas maestras
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                      {closedNotes.length === 0 ? (
                        <div className='rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground'>
                          Aún no hay notas maestras cerradas en esta semana.
                        </div>
                      ) : (
                        closedNotes.map((note) => (
                          <div key={note.id} className='rounded-lg border p-3'>
                            <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                              <p className='font-medium text-foreground'>
                                {note.name}
                              </p>
                              <p className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
                                <CalendarIcon className='h-3.5 w-3.5' />
                                {formatDateLabel(note.closedAt)}
                              </p>
                            </div>

                            <div className='grid gap-3 md:grid-cols-[1.25fr_1fr] md:items-start'>
                              <div>
                                {getEmbeddableVideoUrl(note.feedbackLoomUrl) ? (
                                  <div className='overflow-hidden rounded-md border'>
                                    <iframe
                                      src={
                                        getEmbeddableVideoUrl(
                                          note.feedbackLoomUrl,
                                        ) || ''
                                      }
                                      title={`Revision ${note.name}`}
                                      className='aspect-video w-full'
                                      allow='autoplay; fullscreen; picture-in-picture'
                                      allowFullScreen
                                    />
                                  </div>
                                ) : (
                                  <p className='text-sm text-muted-foreground'>
                                    Aún no hay video de revisión para esta nota.
                                  </p>
                                )}
                              </div>

                              <div className='rounded-md border bg-muted/20 p-3'>
                                <p className='mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                                  Notas del coach
                                </p>
                                {note.feedbackNotes ? (
                                  <p className='whitespace-pre-wrap text-sm text-foreground'>
                                    {note.feedbackNotes}
                                  </p>
                                ) : (
                                  <p className='text-sm text-muted-foreground'>
                                    Aún no hay notas del coach para esta nota.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>

      <Dialog
        open={Boolean(imagePreviewUrl)}
        onOpenChange={(open) => {
          if (!open) setImagePreviewUrl(null)
        }}
      >
        <DialogContent className='max-h-[92dvh] overflow-y-auto sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>Imagen del reporte</DialogTitle>
          </DialogHeader>
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl}
              alt='Imagen ampliada del reporte de clase'
              className='h-auto w-full rounded-md border object-contain'
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
