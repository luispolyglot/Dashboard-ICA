import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchCoachingUserInsights,
  fetchCoachingUserMemberships,
  type CoachingUserInsights,
  type CoachingUserMembership,
  upsertCoachingUser,
} from '../services/coaching'

type ManageCoachingUserViewProps = {
  userId: string
  initialTargetLang?: string | null
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

function toInputValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value
  return ''
}

function normalizeWeeklyObjectiveMap(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    output[key] = raw as Record<string, unknown>
  }
  return output
}

type ClassSessionItem = {
  key: string
  title: string
  loomUrl: string | null
  report: string | null
  createdAt: string | null
  updatedAt: string | null
}

function normalizeClassSessions(value: unknown): ClassSessionItem[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const row = item as Record<string, unknown>
      const key = toInputValue(row.key) || toInputValue(row.weekKey)
      const legacyWeek = toInputValue(row.week)
      const resolvedKey = key || (legacyWeek ? `legacy-${legacyWeek}` : `legacy-${index + 1}`)

      return {
        key: resolvedKey,
        title: toInputValue(row.title) || 'Clase semanal',
        loomUrl: toInputValue(row.loomUrl ?? row.loom_url) || null,
        report: toInputValue(row.report) || null,
        createdAt: toInputValue(row.createdAt ?? row.created_at) || null,
        updatedAt: toInputValue(row.updatedAt ?? row.updated_at) || null,
      }
    })
}

function upsertSessionByKey(
  current: ClassSessionItem[],
  key: string,
  payload: { title: string; loomUrl: string | null; report: string | null },
): ClassSessionItem[] {
  const now = new Date().toISOString()
  const index = current.findIndex((item) => item.key === key)

  if (index === -1) {
    return [
      {
        key,
        title: payload.title,
        loomUrl: payload.loomUrl,
        report: payload.report,
        createdAt: now,
        updatedAt: now,
      },
      ...current,
    ]
  }

  return current.map((item, itemIndex) =>
    itemIndex !== index
      ? item
      : {
          ...item,
          title: payload.title,
          loomUrl: payload.loomUrl,
          report: payload.report,
          updatedAt: now,
        },
  )
}

const MONTH_OPTIONS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

export function ManageCoachingUserView({ userId, initialTargetLang }: ManageCoachingUserViewProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<CoachingUserMembership[]>([])
  const [selectedTargetLang, setSelectedTargetLang] = useState<string>('')
  const [insights, setInsights] = useState<CoachingUserInsights | null>(null)
  const [savingObjective, setSavingObjective] = useState(false)

  const today = new Date()
  const [objectiveYear, setObjectiveYear] = useState(String(today.getFullYear()))
  const [objectiveMonth, setObjectiveMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'))
  const [objectiveWeek, setObjectiveWeek] = useState('1')
  const [objectiveWords, setObjectiveWords] = useState('')
  const [objectiveNm, setObjectiveNm] = useState('')
  const [objectiveStreakTarget, setObjectiveStreakTarget] = useState('')
  const [objectiveStreakAchieved, setObjectiveStreakAchieved] = useState('')
  const [objectiveReportUrl, setObjectiveReportUrl] = useState('')
  const [classTitle, setClassTitle] = useState('Clase semanal')
  const [classLoomUrl, setClassLoomUrl] = useState('')
  const [classReport, setClassReport] = useState('')
  const [savingClass, setSavingClass] = useState(false)

  const objectiveKey = `${objectiveYear}-${objectiveMonth}-S${objectiveWeek}`

  const selectedMembership = useMemo(
    () => memberships.find((row) => row.targetLang === selectedTargetLang) || null,
    [memberships, selectedTargetLang],
  )

  const classSessions = useMemo(
    () => normalizeClassSessions(selectedMembership?.classSessions),
    [selectedMembership?.classSessions],
  )

  const classSessionForWeek = useMemo(
    () => classSessions.find((session) => session.key === objectiveKey) || null,
    [classSessions, objectiveKey],
  )

  const weekData = useMemo(() => {
    const map = normalizeWeeklyObjectiveMap(insights?.weeklyObjectives)
    if (map[objectiveKey]) return map[objectiveKey]

    if (insights?.weeklyObjectives && typeof insights.weeklyObjectives === 'object' && !Array.isArray(insights.weeklyObjectives)) {
      const asRecord = insights.weeklyObjectives as Record<string, unknown>
      const hasFlatFields =
        'wordsTarget' in asRecord ||
        'nmTarget' in asRecord ||
        'icaStreakTargetPct' in asRecord ||
        'icaStreakAchievedPct' in asRecord ||
        'reportExerciseUrl' in asRecord
      if (hasFlatFields) return asRecord
    }

    return {}
  }, [insights?.weeklyObjectives, objectiveKey])

  useEffect(() => {
    setObjectiveWords(toInputValue(weekData.wordsTarget))
    setObjectiveNm(toInputValue(weekData.nmTarget))
    setObjectiveStreakTarget(toInputValue(weekData.icaStreakTargetPct))
    setObjectiveStreakAchieved(toInputValue(weekData.icaStreakAchievedPct))
    setObjectiveReportUrl(toInputValue(weekData.reportExerciseUrl))
  }, [weekData])

  useEffect(() => {
    if (!classSessionForWeek) {
      setClassTitle('Clase semanal')
      setClassLoomUrl('')
      setClassReport('')
      return
    }

    setClassTitle(classSessionForWeek.title || 'Clase semanal')
    setClassLoomUrl(classSessionForWeek.loomUrl || '')
    setClassReport(classSessionForWeek.report || '')
  }, [classSessionForWeek])

  const loadAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const membershipRows = await fetchCoachingUserMemberships(userId)
      setMemberships(membershipRows)

      const targetLang =
        initialTargetLang && membershipRows.some((row) => row.targetLang === initialTargetLang)
          ? initialTargetLang
          : membershipRows[0]?.targetLang || ''

      setSelectedTargetLang(targetLang)

      if (targetLang) {
        const insightsData = await fetchCoachingUserInsights({ userId, targetLang })
        setInsights(insightsData)
      } else {
        setInsights(null)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar el usuario de coaching.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [userId])

  useEffect(() => {
    if (!selectedTargetLang) return

    let active = true
    setLoading(true)
    setError(null)

    void fetchCoachingUserInsights({ userId, targetLang: selectedTargetLang })
      .then((data) => {
        if (!active) return
        setInsights(data)
      })
      .catch((err) => {
        if (!active) return
        const message = err instanceof Error ? err.message : 'No se pudo cargar el detalle del usuario.'
        setError(message)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedTargetLang, userId])

  const handleSaveObjective = async () => {
    if (!selectedMembership || !insights) return

    setSavingObjective(true)
    setFeedback(null)

    try {
      const existing = normalizeWeeklyObjectiveMap(insights.weeklyObjectives)
      const nextWeekly = {
        ...existing,
        [objectiveKey]: {
          wordsTarget: objectiveWords.trim() || null,
          nmTarget: objectiveNm.trim() || null,
          icaStreakTargetPct: objectiveStreakTarget.trim() || null,
          icaStreakAchievedPct: objectiveStreakAchieved.trim() || null,
          reportExerciseUrl: objectiveReportUrl.trim() || null,
        },
      }

      await upsertCoachingUser({
        userId: selectedMembership.userId,
        targetLang: selectedMembership.targetLang,
        nativeLang: selectedMembership.nativeLang,
        level: selectedMembership.level,
        classSessions: selectedMembership.classSessions,
        feedbackNmUrl: selectedMembership.feedbackNmUrl,
        feedbackNmNotes: selectedMembership.feedbackNmNotes,
        weeklyObjectives: nextWeekly,
        notes: selectedMembership.notes,
        isActive: selectedMembership.isActive,
      })

      setInsights((prev) => (prev ? { ...prev, weeklyObjectives: nextWeekly } : prev))
      setMemberships((prev) =>
        prev.map((membership) =>
          membership.id !== selectedMembership.id
            ? membership
            : { ...membership, weeklyObjectives: nextWeekly },
        ),
      )
      setFeedback('Objetivo semanal guardado.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el objetivo semanal.'
      setFeedback(message)
    } finally {
      setSavingObjective(false)
    }
  }

  const handleSaveClassSession = async () => {
    if (!selectedMembership) return

    setSavingClass(true)
    setFeedback(null)

    try {
      const currentSessions = normalizeClassSessions(selectedMembership.classSessions)
      const nextSessions = upsertSessionByKey(currentSessions, objectiveKey, {
        title: classTitle.trim() || 'Clase semanal',
        loomUrl: classLoomUrl.trim() || null,
        report: classReport.trim() || null,
      })

      await upsertCoachingUser({
        userId: selectedMembership.userId,
        targetLang: selectedMembership.targetLang,
        nativeLang: selectedMembership.nativeLang,
        level: selectedMembership.level,
        classSessions: nextSessions,
        feedbackNmUrl: selectedMembership.feedbackNmUrl,
        feedbackNmNotes: selectedMembership.feedbackNmNotes,
        weeklyObjectives: selectedMembership.weeklyObjectives,
        notes: selectedMembership.notes,
        isActive: selectedMembership.isActive,
      })

      setMemberships((prev) =>
        prev.map((membership) =>
          membership.id !== selectedMembership.id
            ? membership
            : { ...membership, classSessions: nextSessions },
        ),
      )
      setFeedback('Clase semanal guardada.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la clase semanal.'
      setFeedback(message)
    } finally {
      setSavingClass(false)
    }
  }

  const yearOptions = useMemo(() => {
    const current = Number(objectiveYear) || today.getFullYear()
    return [current - 1, current, current + 1].map((year) => String(year))
  }, [objectiveYear])

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-2'>
        <Button type='button' variant='outline' onClick={() => navigate(-1)}>
          <ArrowLeftIcon className='h-4 w-4' />
          Volver
        </Button>

        <Button type='button' variant='ghost' onClick={() => void loadAll()}>
          Recargar
        </Button>
      </div>

      {(error || feedback) && (
        <p className={`mb-4 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error || feedback}
        </p>
      )}

      <Card className='mb-4'>
        <CardHeader>
          <CardTitle>Usuario de coaching</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-wrap items-center gap-3'>
          <Select value={selectedTargetLang} onValueChange={setSelectedTargetLang}>
            <SelectTrigger className='min-w-56'>
              <SelectValue placeholder='Selecciona idioma coaching' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {memberships.map((membership) => (
                  <SelectItem key={membership.id} value={membership.targetLang}>
                    {membership.userDisplayName} · {membership.targetLang} ({membership.level})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {selectedMembership && (
            <p className='text-sm text-muted-foreground'>
              Idioma: <span className='font-medium text-foreground'>{selectedMembership.targetLang}</span> · Nivel:{' '}
              <span className='font-medium text-foreground'>{selectedMembership.level}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p className='text-sm text-muted-foreground'>Cargando detalle...</p>
      ) : !insights ? (
        <p className='text-sm text-muted-foreground'>No hay datos disponibles para este usuario.</p>
      ) : (
        <div className='grid gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Objetivos semanales</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex flex-wrap items-end gap-2'>
                <div className='space-y-1.5'>
                  <Label>Año</Label>
                  <Select value={objectiveYear} onValueChange={setObjectiveYear}>
                    <SelectTrigger className='w-24'>
                      <SelectValue placeholder='Año' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {yearOptions.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1.5'>
                  <Label>Mes</Label>
                  <Select value={objectiveMonth} onValueChange={setObjectiveMonth}>
                    <SelectTrigger className='w-40'>
                      <SelectValue placeholder='Mes' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {MONTH_OPTIONS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1.5'>
                  <Label>Semana</Label>
                  <Select value={objectiveWeek} onValueChange={setObjectiveWeek}>
                    <SelectTrigger className='w-32'>
                      <SelectValue placeholder='Semana' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='1'>Semana 1</SelectItem>
                        <SelectItem value='2'>Semana 2</SelectItem>
                        <SelectItem value='3'>Semana 3</SelectItem>
                        <SelectItem value='4'>Semana 4</SelectItem>
                        <SelectItem value='5'>Semana 5</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className='text-xs text-muted-foreground'>Clave objetivo: {objectiveKey}</p>

              <div className='grid gap-2 md:grid-cols-2'>
                <Input value={objectiveWords} onChange={(event) => setObjectiveWords(event.target.value)} placeholder='Objetivo palabras ICA' />
                <Input value={objectiveNm} onChange={(event) => setObjectiveNm(event.target.value)} placeholder='Objetivo NM' />
                <Input value={objectiveStreakTarget} onChange={(event) => setObjectiveStreakTarget(event.target.value)} placeholder='Objetivo % racha' />
                <Input value={objectiveStreakAchieved} onChange={(event) => setObjectiveStreakAchieved(event.target.value)} placeholder='% racha alcanzado' />
              </div>

              <Input value={objectiveReportUrl} onChange={(event) => setObjectiveReportUrl(event.target.value)} placeholder='Link ejercicio reporte' />

              <Button type='button' variant='outline' onClick={() => void handleSaveObjective()} disabled={savingObjective}>
                {savingObjective ? 'Guardando...' : 'Guardar objetivo semanal'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mis clases por semana</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-xs text-muted-foreground'>Semana seleccionada: {objectiveKey}</p>

              <Input
                value={classTitle}
                onChange={(event) => setClassTitle(event.target.value)}
                placeholder='Título clase semanal'
              />
              <Input
                value={classLoomUrl}
                onChange={(event) => setClassLoomUrl(event.target.value)}
                placeholder='Loom URL de la clase'
              />
              <Input
                value={classReport}
                onChange={(event) => setClassReport(event.target.value)}
                placeholder='Reporte clase'
              />

              <Button
                type='button'
                variant='outline'
                onClick={() => void handleSaveClassSession()}
                disabled={savingClass}
              >
                {savingClass ? 'Guardando...' : 'Guardar clase semanal'}
              </Button>

              <div className='max-h-52 space-y-2 overflow-y-auto rounded-md border p-2'>
                {classSessions.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>No hay clases cargadas.</p>
                ) : (
                  classSessions.map((session) => (
                    <div key={session.key} className='rounded border p-2 text-sm'>
                      <p className='font-medium'>{session.title}</p>
                      <p className='text-xs text-muted-foreground'>Semana: {session.key}</p>
                      {session.loomUrl && (
                        <a
                          href={session.loomUrl}
                          target='_blank'
                          rel='noreferrer'
                          className='text-blue-600 underline underline-offset-2'
                        >
                          Ver en Loom
                        </a>
                      )}
                      {session.report && <p>{session.report}</p>}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Todas las palabras ICA ({insights.wordsCount})</CardTitle>
            </CardHeader>
            <CardContent>
              {insights.words.length === 0 ? (
                <p className='text-sm text-muted-foreground'>Sin palabras ICA.</p>
              ) : (
                <div className='max-h-72 space-y-1 overflow-y-auto rounded-md border p-2 text-sm'>
                  {insights.words.map((word) => (
                    <p key={word.id}>
                      {word.target} → {word.native} ({word.importance})
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Todas las notas maestras ({insights.masterNotesCount})</CardTitle>
            </CardHeader>
            <CardContent>
              {insights.masterNotes.length === 0 ? (
                <p className='text-sm text-muted-foreground'>Sin notas maestras.</p>
              ) : (
                <div className='max-h-[60dvh] space-y-2 overflow-y-auto'>
                  {insights.masterNotes.map((note) => (
                    <div key={note.id} className='rounded-md border p-3 text-sm'>
                      <p>
                        {note.name} · {note.state} · {formatDateTime(note.created_at)}
                      </p>

                      {note.audioUrl ? (
                        <audio controls className='mt-2 w-full'>
                          <source src={note.audioUrl} />
                        </audio>
                      ) : (
                        <p className='mt-2 text-xs text-muted-foreground'>Sin audio principal disponible.</p>
                      )}

                      {note.audioChunks.length > 0 && (
                        <div className='mt-2 space-y-1'>
                          <p className='text-xs text-muted-foreground'>Fragmentos disponibles:</p>
                          {note.audioChunks.map((chunk) => (
                            <div key={chunk.id} className='rounded border p-2'>
                              <p className='mb-1 text-xs text-muted-foreground'>Chunk #{chunk.sort_order}</p>
                              {chunk.audioUrl ? (
                                <audio controls className='w-full'>
                                  <source src={chunk.audioUrl} />
                                </audio>
                              ) : (
                                <p className='text-xs text-muted-foreground'>Sin URL de audio para este fragmento.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
