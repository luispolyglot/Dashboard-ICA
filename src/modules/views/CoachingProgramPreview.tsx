import { useMemo, useState } from 'react'
import {
  CheckSquareIcon,
  DownloadIcon,
  GoalIcon,
  RepeatIcon,
  SearchIcon,
  SquareIcon,
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

type ClassSession = {
  key: string
  loomUrl: string | null
  report: string | null
  reportImageUrl: string | null
}

type ProgramPreviewMembership = {
  id: string
  targetLang: string
  level: string
  coachDisplayName?: string | null
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  activatedAt: string | null
  durationWeeks: number
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
      closedAt: string
      feedbackLoomUrl: string | null
    }>
  >
}

type CoachingProgramPreviewProps = {
  membership: ProgramPreviewMembership
  allowExerciseCompletion?: boolean
  completingExerciseWeek?: string | null
  onCompleteExercise?: (weekKey: string) => void
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
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
      reportImageUrl: toString(item.reportImageUrl ?? item.report_image_url),
    }))
}

function getEmbeddableVideoUrl(value: string | null): string | null {
  if (!value) return null
  if (/loom\.com/i.test(value)) {
    return value.replace('/share/', '/embed/').replace('/shared/', '/embed/')
  }
  return null
}

function getCurrentProgramWeek(
  activatedAt: string | null,
  durationWeeks = 12,
): number {
  if (!activatedAt) return 1
  const start = new Date(activatedAt)
  if (Number.isNaN(start.getTime())) return 1
  const week = Math.floor((Date.now() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return Math.min(durationWeeks, Math.max(1, week))
}

function objectiveStatus(target: number | null, actual: number): { label: string; done: boolean } {
  if (target === null) return { label: 'No definido', done: false }
  return { label: `${actual}/${target}`, done: actual >= target }
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
  return { url, status: url && status === 'completed' ? 'completed' : 'pending' }
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
  const currentProgramWeek = useMemo(
    () => getCurrentProgramWeek(membership.activatedAt, durationWeeks),
    [membership.activatedAt, durationWeeks],
  )

  const unlockedWeeks = membership.status === 'active' ? currentProgramWeek : durationWeeks

  return (
    <div className='grid gap-4'>
      <Card>
        <CardContent className='space-y-2 text-sm text-muted-foreground'>
          <p>
            Idioma: <span className='font-medium text-foreground'>{membership.targetLang}</span> · Nivel:{' '}
            <span className='font-medium text-foreground'>{membership.level}</span>
            {membership.coachDisplayName ? ` · Coach: ${membership.coachDisplayName}` : ''}
          </p>
          <p>Semana actual del programa: {currentProgramWeek}</p>
        </CardContent>
      </Card>

      <Accordion type='multiple' className='w-full rounded-md border px-4'>
        {Array.from({ length: unlockedWeeks }, (_, index) => {
          const week = index + 1
          const weekKey = `W${String(week).padStart(2, '0')}`
          const objectives = objectivesByWeek[weekKey] || {}
          const progress = membership.weekProgress?.[weekKey] || {
            wordsCreated: 0,
            closedMasterNotes: 0,
            icaStreakPct: 0,
            flashcardsStreakPct: 0,
          }
          const weekClasses = classSessionsByWeek.get(weekKey) || []
          const latestClass = weekClasses[0] || null
          const closedNotes = membership.closedMasterNotesByWeek?.[weekKey] || []

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

          const wordsStatus = objectiveStatus(wordsTarget, progress.wordsCreated)
          const notesStatus = objectiveStatus(nmTarget, progress.closedMasterNotes)
          const icaStatus = objectiveStatus(icaStreakTarget, progress.icaStreakPct)
          const flashcardsStatus = objectiveStatus(flashcardsTarget, progress.flashcardsStreakPct)
          const exerciseDone = exercise.status === 'completed'

          return (
            <AccordionItem value={weekKey} key={weekKey}>
              <AccordionTrigger>Semana {week}</AccordionTrigger>
              <AccordionContent className='space-y-3 pb-4 text-sm'>
                <Card>
                  <CardHeader>
                    <CardTitle>Clase grabada</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-2'>
                    {!latestClass ? (
                      <p className='text-muted-foreground'>Aun no hay clase cargada para esta semana.</p>
                    ) : (
                      <>
                        {getEmbeddableVideoUrl(latestClass.loomUrl) && (
                          <div className='overflow-hidden rounded-md border'>
                            <iframe
                              src={getEmbeddableVideoUrl(latestClass.loomUrl) || ''}
                              title={`Video semana ${week}`}
                              className='aspect-video w-full'
                              allow='autoplay; fullscreen; picture-in-picture'
                              allowFullScreen
                            />
                          </div>
                        )}
                        {latestClass.report && <p>{latestClass.report}</p>}
                        {latestClass.reportImageUrl && (
                          <div className='space-y-2'>
                            <button
                              type='button'
                              onClick={() => setImagePreviewUrl(latestClass.reportImageUrl)}
                              className='group relative block cursor-zoom-in overflow-hidden rounded-md border text-left'
                            >
                              <img
                                src={latestClass.reportImageUrl}
                                alt='Imagen del reporte de clase'
                                className='max-h-48 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]'
                              />
                              <div className='absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100'>
                                <SearchIcon className='h-5 w-5 text-white' />
                              </div>
                            </button>
                            <a
                              href={latestClass.reportImageUrl}
                              download
                              target='_blank'
                              rel='noreferrer'
                              className='inline-flex items-center gap-1 text-blue-600 underline underline-offset-2'
                            >
                              <DownloadIcon className='h-3.5 w-3.5' />
                              Descargar imagen del reporte
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <GoalIcon className='h-4 w-4' /> Objetivos semanales
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-1'>
                    <p className={wordsStatus.done ? 'text-green-600' : 'text-foreground'}>
                      {wordsStatus.done ? '✅' : '❌'} Palabras ICA: {wordsStatus.label}
                    </p>
                    <p className={notesStatus.done ? 'text-green-600' : 'text-foreground'}>
                      {notesStatus.done ? '✅' : '❌'} Notas maestras cerradas: {notesStatus.label}
                    </p>
                    <p className={icaStatus.done ? 'text-green-600' : 'text-foreground'}>
                      {icaStatus.done ? '✅' : '❌'} Objetivo % racha ICA: {icaStatus.label}
                    </p>
                    <p className={flashcardsStatus.done ? 'text-green-600' : 'text-foreground'}>
                      {flashcardsStatus.done ? '✅' : '❌'} Objetivo % racha flashcards: {flashcardsStatus.label}
                    </p>
                    <div className={exerciseDone ? 'text-green-600' : 'text-foreground'}>
                      <p>
                        {exerciseDone ? '✅' : '❌'} Objetivo Ejercicio:{' '}
                        {exercise.url ? (exerciseDone ? 'Completado' : 'Pendiente') : 'No definido'}
                      </p>
                      {exercise.url && (
                        <div className='mt-1 flex flex-wrap items-center gap-3'>
                          <a href={exercise.url} target='_blank' rel='noreferrer' className='text-blue-600 underline underline-offset-2'>
                            Abrir ejercicio
                          </a>
                          {allowExerciseCompletion && (
                            <button
                              type='button'
                              onClick={() => {
                                if (exerciseDone || !onCompleteExercise) return
                                onCompleteExercise(weekKey)
                              }}
                              disabled={exerciseDone || completingExerciseWeek === weekKey}
                              className='inline-flex items-center gap-1 text-xs text-foreground disabled:opacity-50'
                            >
                              {exerciseDone ? <CheckSquareIcon className='h-4 w-4' /> : <SquareIcon className='h-4 w-4' />}
                              {exerciseDone
                                ? 'Confirmado por ti'
                                : completingExerciseWeek === weekKey
                                  ? 'Guardando...'
                                  : 'Marcar como hecho'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <RepeatIcon className='h-4 w-4' /> Revision Notas Maestras
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-2'>
                    {closedNotes.length === 0 ? (
                      <p className='text-muted-foreground'>Aun no hay notas maestras cerradas en esta semana.</p>
                    ) : (
                      closedNotes.map((note) => (
                        <div key={note.id} className='rounded-md border p-3'>
                          <p className='mb-2 font-medium'>{note.name}</p>
                          {getEmbeddableVideoUrl(note.feedbackLoomUrl) ? (
                            <div className='overflow-hidden rounded-md border'>
                              <iframe
                                src={getEmbeddableVideoUrl(note.feedbackLoomUrl) || ''}
                                title={`Revision ${note.name}`}
                                className='aspect-video w-full'
                                allow='autoplay; fullscreen; picture-in-picture'
                                allowFullScreen
                              />
                            </div>
                          ) : (
                            <p className='text-muted-foreground'>Aun no hay video de revision para esta nota.</p>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
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
