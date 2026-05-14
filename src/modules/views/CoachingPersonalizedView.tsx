import { useEffect, useMemo, useState } from 'react'
import { BookOpenIcon, GoalIcon, RefreshCwIcon, RepeatIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchMyCoachingDashboard,
  type CoachingMembership,
} from '../services/coaching'

type CoachingPersonalizedViewProps = {
  targetLang?: string
}

type ClassSession = {
  key: string
  title: string
  loomUrl: string | null
  report: string | null
  createdAt: string | null
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

function normalizeClassSessions(value: unknown[]): ClassSession[] {
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .map((item, index) => ({
      key:
        toString(item.key) ||
        toString(item.weekKey) ||
        toString(item.week_key) ||
        toString(item.week) ||
        `legacy-${index + 1}`,
      title: toString(item.title) || `Clase ${index + 1}`,
      loomUrl: toString(item.loomUrl ?? item.loom_url),
      report: toString(item.report),
      createdAt: toString(item.createdAt ?? item.created_at),
    }))
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

function getWeekOfMonth(date: Date): number {
  return Math.min(5, Math.max(1, Math.ceil(date.getDate() / 7)))
}

export function CoachingPersonalizedView({
  targetLang,
}: CoachingPersonalizedViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<CoachingMembership[]>([])
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [selectedMonth, setSelectedMonth] = useState(
    String(now.getMonth() + 1).padStart(2, '0'),
  )
  const [selectedWeek, setSelectedWeek] = useState('1')

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
    if (memberships.length === 0) return null
    if (!targetLang) return memberships[0]
    return (
      memberships.find(
        (row) => row.targetLang.toLowerCase() === targetLang.toLowerCase(),
      ) || memberships[0]
    )
  }, [memberships, targetLang])

  const membershipStartDate = useMemo(() => {
    const raw = selectedMembership?.createdAt
    if (!raw) return null
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }, [selectedMembership?.createdAt])

  const classSessions = selectedMembership
    ? normalizeClassSessions(selectedMembership.classSessions)
    : []
  const weekKey = `${selectedYear}-${selectedMonth}-S${selectedWeek}`

  const objectivesByWeek = normalizeWeeklyObjectiveMap(
    selectedMembership?.weeklyObjectives,
  )
  const objectives =
    objectivesByWeek[weekKey] ||
    (() => {
      const raw = selectedMembership?.weeklyObjectives
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      const record = raw as Record<string, unknown>
      const hasFlatFields =
        'wordsTarget' in record ||
        'nmTarget' in record ||
        'icaStreakTargetPct' in record ||
        'icaStreakAchievedPct' in record ||
        'reportExerciseUrl' in record
      return hasFlatFields ? record : {}
    })()

  const classSessionsForWeek = classSessions.filter(
    (session) => session.key === weekKey,
  )

  const minYear = membershipStartDate
    ? membershipStartDate.getFullYear()
    : now.getFullYear()
  const minMonth = membershipStartDate
    ? membershipStartDate.getMonth() + 1
    : now.getMonth() + 1
  const minWeek = membershipStartDate ? getWeekOfMonth(membershipStartDate) : 1
  const maxYear = now.getFullYear()
  const maxMonth = now.getMonth() + 1
  const maxWeek = getWeekOfMonth(now)

  const years = useMemo(() => {
    const values: string[] = []
    for (let year = minYear; year <= maxYear; year += 1) {
      values.push(String(year))
    }
    return values
  }, [minYear, maxYear])

  const selectedYearNumber = Number(selectedYear)
  const monthOptions = useMemo(() => {
    return MONTH_OPTIONS.filter((month) => {
      const numeric = Number(month.value)
      if (selectedYearNumber === minYear && numeric < minMonth) return false
      if (selectedYearNumber === maxYear && numeric > maxMonth) return false
      return true
    })
  }, [selectedYearNumber, minYear, minMonth, maxYear, maxMonth])

  const selectedMonthNumber = Number(selectedMonth)
  const weekOptions = useMemo(() => {
    const values = [1, 2, 3, 4, 5]
    return values.filter((week) => {
      if (
        selectedYearNumber === minYear &&
        selectedMonthNumber === minMonth &&
        week < minWeek
      ) {
        return false
      }

      if (
        selectedYearNumber === maxYear &&
        selectedMonthNumber === maxMonth &&
        week > maxWeek
      ) {
        return false
      }

      return true
    })
  }, [
    selectedYearNumber,
    selectedMonthNumber,
    minYear,
    minMonth,
    minWeek,
    maxYear,
    maxMonth,
    maxWeek,
  ])

  useEffect(() => {
    if (years.length === 0) return
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0])
    }
  }, [years, selectedYear])

  useEffect(() => {
    if (monthOptions.length === 0) return
    const allowed = monthOptions.some((month) => month.value === selectedMonth)
    if (!allowed) {
      setSelectedMonth(monthOptions[0].value)
    }
  }, [monthOptions, selectedMonth])

  useEffect(() => {
    if (weekOptions.length === 0) return
    const numericWeek = Number(selectedWeek)
    if (!weekOptions.includes(numericWeek)) {
      setSelectedWeek(String(weekOptions[0]))
    }
  }, [weekOptions, selectedWeek])
  const wordsObjective = toNumber(objectives.wordsTarget)
  const nmObjective = toNumber(objectives.nmTarget)
  const streakObjective = toNumber(objectives.icaStreakTargetPct)
  const streakAchieved = toNumber(objectives.icaStreakAchievedPct)
  const reportExerciseUrl = toString(objectives.reportExerciseUrl)

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>
            Coaching Personalizado
          </h2>
          <p className='text-sm text-muted-foreground'>
            Tu seguimiento semanal con clases, feedback de Notas Maestras y
            objetivos ICA.
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
            Todavía no tienes una asignación activa en coaching.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4'>
          <Card>
            <CardContent className='space-y-3 pt-6 text-sm text-muted-foreground'>
              <p>
                Idioma:{' '}
                <span className='font-medium text-foreground'>
                  {selectedMembership.targetLang}
                </span>{' '}
                · Nivel:{' '}
                <span className='font-medium text-foreground'>
                  {selectedMembership.level}
                </span>
                {selectedMembership.coachDisplayName
                  ? ` · Coach: ${selectedMembership.coachDisplayName}`
                  : ''}
              </p>

              <div className='flex flex-wrap items-end gap-2'>
                <div className='space-y-1.5'>
                  <p className='text-xs text-muted-foreground'>Año</p>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className='w-24'>
                      <SelectValue placeholder='Año' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {years.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1.5'>
                  <p className='text-xs text-muted-foreground'>Mes</p>
                  <Select
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
                  >
                    <SelectTrigger className='w-36'>
                      <SelectValue placeholder='Mes' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {monthOptions.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1.5'>
                  <p className='text-xs text-muted-foreground'>Semana</p>
                  <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                    <SelectTrigger className='w-32'>
                      <SelectValue placeholder='Semana' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {weekOptions.map((week) => (
                          <SelectItem key={String(week)} value={String(week)}>
                            Semana {week}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className='text-xs text-muted-foreground'>
                Semana seleccionada: {weekKey}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BookOpenIcon className='h-4 w-4' />
                👨‍🏫 Mis clases
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              {classSessionsForWeek.length === 0 ? (
                <p className='text-muted-foreground'>
                  Aún no hay grabaciones ni reportes cargados.
                </p>
              ) : (
                classSessionsForWeek.map((session, index) => (
                  <div
                    key={`${session.title}-${index}`}
                    className='rounded-md border p-3'
                  >
                    <p className='font-medium'>{session.title}</p>
                    <p className='text-xs text-muted-foreground'>
                      Semana: {session.key}
                    </p>
                    {session.loomUrl && (
                      <a
                        href={session.loomUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='text-sm text-blue-600 underline underline-offset-2'
                      >
                        Ver grabación en Loom
                      </a>
                    )}
                    {session.report && (
                      <p className='mt-1 text-sm'>{session.report}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <RepeatIcon className='h-4 w-4' />
                🔁 Feedback Notas Maestras
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {selectedMembership.feedbackNmUrl ? (
                <a
                  href={selectedMembership.feedbackNmUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='text-blue-600 underline underline-offset-2'
                >
                  Ver vídeo feedback de Notas Maestras
                </a>
              ) : (
                <p className='text-muted-foreground'>
                  Todavía no hay vídeo de feedback de Notas Maestras.
                </p>
              )}
              {selectedMembership.feedbackNmNotes && (
                <p>{selectedMembership.feedbackNmNotes}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <GoalIcon className='h-4 w-4' />
                🎯 Objetivos semanales
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              <p className='text-xs text-muted-foreground'>
                Semana seleccionada: {weekKey}
              </p>
              <p>Palabras ICA objetivo: {wordsObjective ?? 'No definido'}</p>
              <p>Notas Maestras objetivo: {nmObjective ?? 'No definido'}</p>
              <p>
                Racha ICA objetivo:{' '}
                {streakObjective !== null
                  ? `${streakObjective}%`
                  : 'No definido'}
              </p>
              <p>
                Racha ICA alcanzada:{' '}
                {streakAchieved !== null ? `${streakAchieved}%` : 'No definido'}
              </p>
              {reportExerciseUrl && (
                <a
                  href={reportExerciseUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='text-blue-600 underline underline-offset-2'
                >
                  Abrir ejercicio de reporte
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
