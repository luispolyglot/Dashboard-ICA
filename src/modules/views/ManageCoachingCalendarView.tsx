import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  CalendarIcon,
  PlusIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  fetchCoachingAccess,
  fetchCoachingManagedUsers,
  type CoachingManagedUser,
  upsertCoachingUser,
} from '../services/coaching'
import { toIsoFromDateAndTime } from './coachingClassResources'

type CoachingCalendarEntry = {
  id: string
  sessionId: string
  sessionWeekKey: string
  scheduledAt: string
  dateKey: string
  timeLabel: string
  studentUserId: string
  studentName: string
  targetLang: string
  level: string
  coachUserId: string | null
  coachDisplayName: string | null
  classJoinUrl: string | null
  loomUrl: string | null
  report: string | null
}

type CalendarCell = {
  dateKey: string
  inCurrentMonth: boolean
}

type AssignClassDraft = {
  sessionId: string
  coachUserId: string
  weekKey: string
  scheduledDate: string
  scheduledTime: string
  classJoinUrl: string
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

function toString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value
  return ''
}

function normalizeProgramWeekKey(value: string): string {
  const normalized = value.trim().toUpperCase()
  const direct = normalized.match(/^W(\d{1,2})$/)
  if (direct) {
    const week = Number(direct[1])
    if (Number.isFinite(week) && week >= 1 && week <= 12) {
      return `W${String(week).padStart(2, '0')}`
    }
  }

  return 'W01'
}

function weekKeyFromNumber(week: number): string {
  return `W${String(Math.min(12, Math.max(1, week))).padStart(2, '0')}`
}

function weekNumberFromKey(value: string): number {
  const normalized = normalizeProgramWeekKey(value)
  const parsed = Number(normalized.slice(1))
  if (!Number.isFinite(parsed)) return 1
  return Math.min(12, Math.max(1, parsed))
}

function getLocalDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getSessionMinAssignableWeek(row: CoachingManagedUser): number {
  const activeWeek = row.weekActivation?.currentActiveWeek
  if (activeWeek && activeWeek >= 1 && activeWeek <= 12) return activeWeek

  const lastWeek = row.weekActivation?.lastActivatedWeek
  if (lastWeek && lastWeek >= 1 && lastWeek <= 12) return lastWeek

  if (row.activatedAt) return 1
  return 1
}

function getClassSessionByWeek(
  classSessions: unknown,
  weekKey: string,
): Record<string, unknown> | null {
  if (!Array.isArray(classSessions)) return null
  return (
    classSessions.find((item) => {
      if (!item || typeof item !== 'object') return false
      const row = item as Record<string, unknown>
      const key = normalizeProgramWeekKey(
        toString(row.key ?? row.weekKey ?? row.week_key ?? row.week),
      )
      return key === weekKey
    }) as Record<string, unknown> | undefined
  ) || null
}

function getClassJoinUrlByWeek(classSessions: unknown, weekKey: string): string {
  const row = getClassSessionByWeek(classSessions, weekKey)
  return toString(row?.classJoinUrl ?? row?.class_join_url)
}

function buildCalendarCells(monthKey: string): CalendarCell[] {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return []

  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: CalendarCell[] = []

  for (let i = startOffset; i > 0; i -= 1) {
    const day = daysInPrevMonth - i + 1
    const prevMonthDate = new Date(year, month - 1, day)
    const key = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ dateKey: key, inCurrentMonth: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      dateKey: `${monthKey}-${String(day).padStart(2, '0')}`,
      inCurrentMonth: true,
    })
  }

  let nextMonthDay = 1
  while (cells.length % 7 !== 0) {
    const nextMonthDate = new Date(year, month + 1, nextMonthDay)
    const key = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthDay).padStart(2, '0')}`
    cells.push({ dateKey: key, inCurrentMonth: false })
    nextMonthDay += 1
  }

  return cells
}

function formatMonthName(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  const label = date.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function mapClassSessions(rows: CoachingManagedUser[]): CoachingCalendarEntry[] {
  const output: CoachingCalendarEntry[] = []

  for (const row of rows) {
    if (!Array.isArray(row.classSessions)) continue

    row.classSessions.forEach((rawSession, index) => {
      if (!rawSession || typeof rawSession !== 'object') return
      const item = rawSession as Record<string, unknown>
      const scheduledAt = toString(item.scheduledAt ?? item.scheduled_at)
      if (!scheduledAt) return

      const parsed = new Date(scheduledAt)
      if (Number.isNaN(parsed.getTime())) return

      const year = parsed.getFullYear()
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      const day = String(parsed.getDate()).padStart(2, '0')

      output.push({
        id: toString(item.id) || `${row.id}-class-${index + 1}`,
        sessionId: row.id,
        sessionWeekKey: normalizeProgramWeekKey(
          toString(item.key ?? item.weekKey ?? item.week_key ?? item.week),
        ),
        scheduledAt,
        dateKey: `${year}-${month}-${day}`,
        timeLabel: parsed.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        studentUserId: row.userId,
        studentName: row.userDisplayName,
        targetLang: row.targetLang,
        level: row.level,
        coachUserId: row.coachUserId,
        coachDisplayName: row.coachDisplayName,
        classJoinUrl: toString(item.classJoinUrl ?? item.class_join_url) || null,
        loomUrl: toString(item.loomUrl ?? item.loom_url) || null,
        report: toString(item.report) || null,
      })
    })
  }

  return output.sort((a, b) => {
    const byDate = a.scheduledAt.localeCompare(b.scheduledAt)
    if (byDate !== 0) return byDate
    return a.studentName.localeCompare(b.studentName, 'es', {
      sensitivity: 'base',
    })
  })
}

export function ManageCoachingCalendarView() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [managedRows, setManagedRows] = useState<CoachingManagedUser[]>([])
  const [entries, setEntries] = useState<CoachingCalendarEntry[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedEntry, setSelectedEntry] =
    useState<CoachingCalendarEntry | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignDraft, setAssignDraft] = useState<AssignClassDraft | null>(null)
  const [savingClass, setSavingClass] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setFeedback(null)

    try {
      const [access, rows] = await Promise.all([
        fetchCoachingAccess(),
        fetchCoachingManagedUsers(),
      ])
      const superAdmin = Boolean(access?.isCoachingSuperAdmin)
      setIsSuperAdmin(superAdmin)

      const scopedRows = superAdmin
        ? rows
        : rows.filter((row) => row.coachUserId === user?.id)

      setManagedRows(scopedRows)
      setEntries(mapClassSessions(scopedRows))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el calendario de coaching.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [user?.id])

  const todayDateKey = useMemo(() => getLocalDateKey(new Date()), [])
  const coaches = useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of managedRows) {
      if (!row.coachUserId) continue
      byId.set(row.coachUserId, row.coachDisplayName || row.coachUserId)
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }, [managedRows])

  const studentsByCoach = useMemo(() => {
    if (!isSuperAdmin) return managedRows
    if (!assignDraft?.coachUserId) return []
    return managedRows.filter((row) => row.coachUserId === assignDraft.coachUserId)
  }, [assignDraft?.coachUserId, isSuperAdmin, managedRows])

  const selectedManagedSession = useMemo(() => {
    if (!assignDraft?.sessionId) return null
    return managedRows.find((row) => row.id === assignDraft.sessionId) || null
  }, [assignDraft?.sessionId, managedRows])

  const minAssignableWeek = useMemo(() => {
    if (!selectedManagedSession) return 1
    return getSessionMinAssignableWeek(selectedManagedSession)
  }, [selectedManagedSession])

  const assignableWeeks = useMemo(() => {
    const weeks: string[] = []
    for (let week = minAssignableWeek; week <= 12; week += 1) {
      weeks.push(weekKeyFromNumber(week))
    }
    return weeks
  }, [minAssignableWeek])

  useEffect(() => {
    if (!assignDraft || !selectedManagedSession) return
    if (weekNumberFromKey(assignDraft.weekKey) >= minAssignableWeek) return
    setAssignDraft((prev) =>
      prev
        ? {
            ...prev,
            weekKey: weekKeyFromNumber(minAssignableWeek),
          }
        : prev,
    )
  }, [assignDraft, minAssignableWeek, selectedManagedSession])

  const handleOpenAssignModal = (dateKey: string) => {
    const initialSession = isSuperAdmin
      ? null
      : managedRows.find((row) => row.coachUserId === user?.id) || null
    const initialWeek = initialSession
      ? weekKeyFromNumber(getSessionMinAssignableWeek(initialSession))
      : 'W01'

    setAssignDraft({
      sessionId: initialSession?.id || '',
      coachUserId: isSuperAdmin ? '' : user?.id || '',
      weekKey: initialWeek,
      scheduledDate: dateKey,
      scheduledTime: '',
      classJoinUrl: getClassJoinUrlByWeek(initialSession?.classSessions, initialWeek),
    })
    setAssignModalOpen(true)
  }

  const handleConfirmAssignClass = async () => {
    if (!assignDraft || !selectedManagedSession) {
      setFeedback('Debes seleccionar alumno para asignar la clase.')
      return
    }

    if (!assignDraft.scheduledDate || !assignDraft.scheduledTime) {
      setFeedback('Completa fecha y horario de clase.')
      return
    }

    if (weekNumberFromKey(assignDraft.weekKey) < minAssignableWeek) {
      setFeedback(`Solo puedes asignar desde la semana W${String(minAssignableWeek).padStart(2, '0')} en adelante.`)
      return
    }

    const nextScheduledAt = toIsoFromDateAndTime(
      assignDraft.scheduledDate,
      assignDraft.scheduledTime,
    )
    if (!nextScheduledAt) {
      setFeedback('La fecha u hora no es valida.')
      return
    }

    setSavingClass(true)
    setFeedback(null)
    try {
      const existingWeekClass = getClassSessionByWeek(
        selectedManagedSession.classSessions,
        assignDraft.weekKey,
      )

      const baseSessions = Array.isArray(selectedManagedSession.classSessions)
        ? selectedManagedSession.classSessions.filter((item) => {
            if (!item || typeof item !== 'object') return false
            const row = item as Record<string, unknown>
            const key = normalizeProgramWeekKey(
              toString(row.key ?? row.weekKey ?? row.week_key ?? row.week),
            )
            return key !== assignDraft.weekKey
          })
        : []

      const nextWeekClass = {
        id: toString(existingWeekClass?.id) || crypto.randomUUID(),
        key: assignDraft.weekKey,
        weekKey: assignDraft.weekKey,
        title: 'Clase semanal',
        loomUrl: toString(existingWeekClass?.loomUrl ?? existingWeekClass?.loom_url) || null,
        report: toString(existingWeekClass?.report) || null,
        reportImagePath:
          toString(
            existingWeekClass?.reportImagePath ??
              existingWeekClass?.report_image_path,
          ) || null,
        reportImageUrl:
          toString(
            existingWeekClass?.reportImageUrl ??
              existingWeekClass?.report_image_url,
          ) || null,
        classJoinUrl:
          assignDraft.classJoinUrl.trim() || null,
        scheduledAt: nextScheduledAt,
        createdAt:
          toString(existingWeekClass?.createdAt ?? existingWeekClass?.created_at) ||
          new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const nextSessions = [nextWeekClass, ...baseSessions]

      await upsertCoachingUser({
        sessionId: selectedManagedSession.id,
        userId: selectedManagedSession.userId,
        targetLang: selectedManagedSession.targetLang,
        nativeLang: selectedManagedSession.nativeLang,
        level: selectedManagedSession.level,
        coachUserId: selectedManagedSession.coachUserId,
        feedbackNmUrl: selectedManagedSession.feedbackNmUrl,
        feedbackNmNotes: selectedManagedSession.feedbackNmNotes,
        notes: selectedManagedSession.notes,
        classSessions: nextSessions,
      })

      setAssignModalOpen(false)
      setAssignDraft(null)
      setFeedback('Clase guardada correctamente en el calendario de coaching.')
      await loadData()
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'No se pudo guardar la clase.',
      )
    } finally {
      setSavingClass(false)
    }
  }

  const availableMonths = useMemo(() => {
    const months = new Set(entries.map((entry) => entry.dateKey.slice(0, 7)))
    return Array.from(months).sort((a, b) => a.localeCompare(b))
  }, [entries])

  useEffect(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (availableMonths.length === 0) {
      setSelectedMonth(currentMonth)
      return
    }

    const fallback =
      availableMonths.find((month) => month === currentMonth) ||
      availableMonths[availableMonths.length - 1]

    setSelectedMonth((previous) => {
      if (previous && availableMonths.includes(previous)) return previous
      return fallback
    })
  }, [availableMonths])

  const calendarCells = useMemo(() => {
    if (!selectedMonth) return []
    return buildCalendarCells(selectedMonth)
  }, [selectedMonth])

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CoachingCalendarEntry[]>()
    for (const entry of entries) {
      const existing = grouped.get(entry.dateKey)
      if (existing) {
        existing.push(entry)
      } else {
        grouped.set(entry.dateKey, [entry])
      }
    }

    for (const [dateKey, sessions] of grouped.entries()) {
      grouped.set(
        dateKey,
        sessions
          .slice()
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      )
    }

    return grouped
  }, [entries])

  const currentUserId = user?.id || ''

  return (
    <section className='mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>
            Calendario Coaching
          </h2>
          <p className='text-sm text-muted-foreground'>
            Vista de clases programadas de coaching por coacher y alumno.
          </p>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button type='button' variant='outline' onClick={() => navigate(-1)}>
            <ArrowLeftIcon className='h-4 w-4' />
            Volver
          </Button>
          <Button type='button' variant='ghost' onClick={() => void loadData()}>
            <RefreshCwIcon className='h-4 w-4' />
            Recargar
          </Button>
        </div>
      </div>

      {isSuperAdmin && (
        <div className='mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground'>
          <p className='inline-flex items-center gap-2'>
            <span className='inline-block h-2.5 w-2.5 rounded-full bg-emerald-500' />
            Mis alumnos
          </p>
          <p className='inline-flex items-center gap-2'>
            <span className='inline-block h-2.5 w-2.5 rounded-full bg-sky-500' />
            Alumnos de otros coachers
          </p>
        </div>
      )}

      {(error || feedback) && (
        <p
          className={`mb-4 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {error || feedback}
        </p>
      )}

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <CardTitle>
              Calendario mensual - {formatMonthName(selectedMonth)}
            </CardTitle>
            <select
              className='h-10 min-w-56 rounded-md border bg-background px-3 text-sm'
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonthName(month)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>Cargando calendario...</p>
          ) : entries.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No hay clases de coaching programadas por ahora.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <div className='min-w-225 overflow-hidden rounded-lg border'>
                <div className='grid grid-cols-7 border-b bg-muted/40'>
                  {WEEKDAY_LABELS.map((label) => (
                    <div
                      key={label}
                      className='px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground'
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className='grid grid-cols-7'>
                  {calendarCells.map((cell, index) => {
                    const dayEntries = entriesByDate.get(cell.dateKey) || []
                    const isOutOfMonth = !cell.inCurrentMonth
                    const isWeekend = index % 7 >= 5
                    const isToday = cell.dateKey === todayDateKey
                    const canAddClass = cell.inCurrentMonth && cell.dateKey >= todayDateKey

                    return (
                      <div
                        key={`${cell.dateKey}-${index}`}
                        className={[
                          'min-h-36 border-r border-b p-2 last:border-r-0',
                          isOutOfMonth ? 'bg-muted/40' : '',
                          isWeekend ? 'bg-muted/20' : '',
                        ].join(' ')}
                      >
                        <div className='mb-2 flex items-center justify-between gap-1'>
                          <p className='text-sm font-semibold'>
                            {Number(cell.dateKey.slice(-2))}
                          </p>
                          <div className='flex items-center gap-1'>
                            {isToday && (
                              <Badge className='h-auto px-1.5 py-0 text-[10px]'>
                                Hoy
                              </Badge>
                            )}
                            {canAddClass && (
                              <Button
                                type='button'
                                size='icon'
                                variant='outline'
                                className='h-6 w-6'
                                aria-label='Asignar clase'
                                onClick={() => handleOpenAssignModal(cell.dateKey)}
                              >
                                <PlusIcon className='h-3.5 w-3.5' />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className='flex flex-col gap-1'>
                          {dayEntries.map((entry) => {
                            const isMine = entry.coachUserId === currentUserId
                            const toneClass = isSuperAdmin
                              ? isMine
                                ? 'border-emerald-300 bg-emerald-500/10'
                                : 'border-sky-300 bg-sky-500/10'
                              : 'border-primary/30 bg-primary/10'

                            return (
                              <button
                                key={entry.id}
                                type='button'
                                className={`w-full rounded-sm border border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-accent/35 ${toneClass}`}
                                onClick={() => setSelectedEntry(entry)}
                              >
                                <p className='truncate font-semibold'>
                                  {entry.timeLabel} - {entry.studentName}
                                </p>
                                <p className='truncate text-muted-foreground'>
                                  {entry.targetLang}
                                  {isSuperAdmin
                                    ? ` - ${entry.coachDisplayName || entry.coachUserId || 'Sin coach'}`
                                    : ''}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={assignModalOpen}
        onOpenChange={(open) => {
          setAssignModalOpen(open)
          if (!open) setAssignDraft(null)
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Asignar clase de coaching</DialogTitle>
            <DialogDescription>
              Selecciona alumno, semana y horario para agendar la clase.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            {isSuperAdmin && (
              <div className='space-y-1.5'>
                <Label htmlFor='assign-coach-select'>Coacher</Label>
                <select
                  id='assign-coach-select'
                  className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                  value={assignDraft?.coachUserId || ''}
                  onChange={(event) => {
                    const coachId = event.target.value
                    const firstSession = managedRows.find(
                      (row) => row.coachUserId === coachId,
                    )
                    setAssignDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            coachUserId: coachId,
                            sessionId: firstSession?.id || '',
                            weekKey: firstSession
                              ? weekKeyFromNumber(
                                  getSessionMinAssignableWeek(firstSession),
                                )
                              : 'W01',
                            classJoinUrl: firstSession
                              ? getClassJoinUrlByWeek(
                                  firstSession.classSessions,
                                  firstSession
                                    ? weekKeyFromNumber(
                                        getSessionMinAssignableWeek(firstSession),
                                      )
                                    : 'W01',
                                )
                              : '',
                          }
                        : prev,
                    )
                  }}
                >
                  <option value=''>Selecciona coacher</option>
                  {coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className='space-y-1.5'>
              <Label htmlFor='assign-student-select'>Alumno</Label>
              <select
                id='assign-student-select'
                className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                value={assignDraft?.sessionId || ''}
                onChange={(event) => {
                  const sessionId = event.target.value
                  const selected = managedRows.find((row) => row.id === sessionId)
                  setAssignDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          sessionId,
                          weekKey: selected
                            ? weekKeyFromNumber(
                                getSessionMinAssignableWeek(selected),
                              )
                            : prev.weekKey,
                          classJoinUrl: selected
                            ? getClassJoinUrlByWeek(
                                selected.classSessions,
                                weekKeyFromNumber(
                                  getSessionMinAssignableWeek(selected),
                                ),
                              )
                            : prev.classJoinUrl,
                        }
                      : prev,
                  )
                }}
                disabled={isSuperAdmin && !assignDraft?.coachUserId}
              >
                <option value=''>Selecciona alumno</option>
                {studentsByCoach
                  .slice()
                  .sort((a, b) =>
                    a.userDisplayName.localeCompare(b.userDisplayName, 'es', {
                      sensitivity: 'base',
                    }),
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.userDisplayName} - {row.targetLang} ({row.level})
                    </option>
                  ))}
              </select>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='assign-week-select'>Semana (W0x)</Label>
              <select
                id='assign-week-select'
                className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                value={assignDraft?.weekKey || ''}
                onChange={(event) => {
                  const nextWeek = event.target.value
                  setAssignDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          weekKey: nextWeek,
                          classJoinUrl: selectedManagedSession
                            ? getClassJoinUrlByWeek(
                                selectedManagedSession.classSessions,
                                nextWeek,
                              )
                            : prev.classJoinUrl,
                        }
                      : prev,
                  )
                }}
                disabled={!selectedManagedSession}
              >
                {assignableWeeks.map((weekKey) => (
                  <option key={weekKey} value={weekKey}>
                    {weekKey}
                  </option>
                ))}
              </select>
              {selectedManagedSession && (
                <p className='text-xs text-muted-foreground'>
                  Puedes asignar desde {weekKeyFromNumber(minAssignableWeek)} en
                  adelante.
                </p>
              )}
            </div>

            <div className='space-y-1.5'>
              <Label>Fecha de la clase</Label>
              <p className='rounded-md border bg-muted/30 px-3 py-2 text-sm'>
                {assignDraft?.scheduledDate
                  ? new Date(`${assignDraft.scheduledDate}T00:00:00`).toLocaleDateString(
                      'es-ES',
                      {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      },
                    )
                  : '-'}
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='assign-time'>Horario</Label>
              <Input
                id='assign-time'
                type='time'
                value={assignDraft?.scheduledTime || ''}
                onChange={(event) => {
                  const nextTime = event.target.value
                  setAssignDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          scheduledTime: nextTime,
                        }
                      : prev,
                  )
                }}
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='assign-class-join-url'>Link clase en vivo (opcional)</Label>
              <Input
                id='assign-class-join-url'
                value={assignDraft?.classJoinUrl || ''}
                onChange={(event) => {
                  const value = event.target.value
                  setAssignDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          classJoinUrl: value,
                        }
                      : prev,
                  )
                }}
                placeholder='Ej: https://meet.google.com/...'
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setAssignModalOpen(false)
                setAssignDraft(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              onClick={() => void handleConfirmAssignClass()}
              disabled={
                savingClass ||
                !assignDraft?.sessionId ||
                !assignDraft?.weekKey ||
                !assignDraft?.scheduledDate ||
                !assignDraft?.scheduledTime
              }
            >
              {savingClass ? 'Guardando...' : 'Guardar clase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null)
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Clase de coaching 🗓️</DialogTitle>
            <DialogDescription>
              {selectedEntry
                ? new Date(selectedEntry.scheduledAt).toLocaleString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className='space-y-3 text-sm'>
              <p className='rounded-md bg-muted/40 px-3 py-2'>
                <span className='font-medium'>👤 Alumno:</span>{' '}
                {selectedEntry.studentName}
              </p>
              <p>
                <span className='font-medium'>🌍 Idioma:</span>{' '}
                {selectedEntry.targetLang} ({selectedEntry.level})
              </p>
              <p>
                <span className='font-medium'>📚 Semana:</span>{' '}
                {selectedEntry.sessionWeekKey}
              </p>
              {isSuperAdmin && (
                <p>
                  <span className='font-medium'>🧑‍🏫 Coacher:</span>{' '}
                  {selectedEntry.coachDisplayName ||
                    selectedEntry.coachUserId ||
                    'Sin coach asignado'}
                </p>
              )}

              <div className='flex flex-wrap gap-2 pt-2'>
                {selectedEntry.classJoinUrl && (
                  <Button type='button' variant='outline' asChild>
                    <a
                      href={selectedEntry.classJoinUrl}
                      target='_blank'
                      rel='noreferrer'
                    >
                      <CalendarIcon className='h-4 w-4' />
                      Link clase en vivo
                    </a>
                  </Button>
                )}

                {selectedEntry.loomUrl && (
                  <Button type='button' variant='outline' asChild>
                    <a href={selectedEntry.loomUrl} target='_blank' rel='noreferrer'>
                      Ver clase en Loom
                    </a>
                  </Button>
                )}

                {selectedEntry.coachUserId === currentUserId && (
                  <Badge variant='secondary'>Alumno propio</Badge>
                )}
              </div>

              {selectedEntry.report && (
                <p className='rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground'>
                  <span className='mr-1'>📝</span>
                  {selectedEntry.report}
                </p>
              )}

              <DialogFooter>
                <Button type='button' onClick={() => setSelectedEntry(null)}>
                  Aceptar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
