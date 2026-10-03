import { AppSelect } from '@/components/ui/app-select'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CalendarHeartIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  GlobeIcon,
  GraduationCapIcon,
  InfoIcon,
  PlusIcon,
  RefreshCwIcon,
  UserIcon,
  VideoIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, IconTile, PageTitle, Panel, Pill, SectionLabel, StatTile, tone, type Tone } from '../game/ui'
import {
  ClassFlag,
  DateBadge,
  getLanguageName,
  getLanguageTone,
  type CalendarClassMeta,
} from '../components/calendar-icademy/calendarIcademyUi'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  upsertCoachingV2ClassCoachGuidelines,
  upsertCoachingUser,
} from '../services/coaching'
import { toDateAndTimeFromIso, toIsoFromDateAndTime } from './coachingClassResources'
import { BlockLoading } from '@/components/ui/loading-state'
import { useSoftLoading } from '../hooks/useSoftLoading'

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
  classIndex: 1 | 2
  programVersion: 'v1' | 'v2'
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
}

type EditClassDraft = {
  weekKey: string
  scheduledDate: string
  scheduledTime: string
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const OWNER_SUPPORT_COACH_USER_ID = '68890bd8-894d-422d-b865-08806acdb312'
const OWNER_SUPPORT_COACH_LABEL = 'Luis'

function toString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value
  return ''
}

function normalizeProgramWeekKey(value: string, maxWeeks = 12): string {
  const normalized = value.trim().toUpperCase()
  const direct = normalized.match(/^W(\d{1,2})$/)
  if (direct) {
    const week = Number(direct[1])
    if (Number.isFinite(week) && week >= 1 && week <= maxWeeks) {
      return `W${String(week).padStart(2, '0')}`
    }
  }

  return 'W01'
}

function weekKeyFromNumber(week: number, maxWeeks = 12): string {
  return `W${String(Math.min(maxWeeks, Math.max(1, week))).padStart(2, '0')}`
}

function weekNumberFromKey(value: string, maxWeeks = 12): number {
  const normalized = normalizeProgramWeekKey(value, maxWeeks)
  const parsed = Number(normalized.slice(1))
  if (!Number.isFinite(parsed)) return 1
  return Math.min(maxWeeks, Math.max(1, parsed))
}

function normalizeClassIndex(value: unknown): 1 | 2 {
  const num = Number(value)
  return num === 2 ? 2 : 1
}

function getSessionMaxWeeks(row: CoachingManagedUser): number {
  return row.programVersion === 'v2' ? 10 : 12
}

function buildSessionClassKey(weekKey: string, classIndex: 1 | 2, programVersion?: 'v1' | 'v2'): string {
  if (programVersion === 'v2') {
    return `${weekKey}_${classIndex}`
  }
  return weekKey
}

function parseSessionClassKey(
  value: string,
  programVersion?: 'v1' | 'v2',
  maxWeeks = 12,
): { weekKey: string; classIndex: 1 | 2 } {
  const normalized = value.trim().toUpperCase()
  if (programVersion === 'v2') {
    const match = normalized.match(/^W(\d{1,2})_([12])$/)
    if (match) {
      const weekKey = normalizeProgramWeekKey(`W${match[1]}`, maxWeeks)
      const classIndex = normalizeClassIndex(match[2])
      return { weekKey, classIndex }
    }
  }

  return {
    weekKey: normalizeProgramWeekKey(normalized, maxWeeks),
    classIndex: 1,
  }
}

function getLocalDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getSessionMinAssignableWeek(row: CoachingManagedUser): number {
  const maxWeeks = getSessionMaxWeeks(row)
  const activeWeek = row.weekActivation?.currentActiveWeek
  if (activeWeek && activeWeek >= 1 && activeWeek <= maxWeeks) return activeWeek

  const lastWeek = row.weekActivation?.lastActivatedWeek
  if (lastWeek && lastWeek >= 1 && lastWeek <= maxWeeks) return lastWeek

  if (row.activatedAt) return 1
  return 1
}

function getClassSessionByWeek(
  classSessions: unknown,
  sessionClassKey: string,
  programVersion?: 'v1' | 'v2',
): Record<string, unknown> | null {
  if (!Array.isArray(classSessions)) return null
  const maxWeeks = programVersion === 'v2' ? 10 : 12
  const target = parseSessionClassKey(sessionClassKey, programVersion, maxWeeks)

  return (
    classSessions.find((item) => {
      if (!item || typeof item !== 'object') return false
      const row = item as Record<string, unknown>
      const weekKey = normalizeProgramWeekKey(
        toString(row.key ?? row.weekKey ?? row.week_key ?? row.week),
        maxWeeks,
      )
      const classIndex = normalizeClassIndex(row.classIndex ?? row.class_index)
      if (weekKey !== target.weekKey) return false
      if (programVersion === 'v2') return classIndex === target.classIndex
      return true
    }) as Record<string, unknown> | undefined
  ) || null
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
    const maxWeeks = getSessionMaxWeeks(row)
    const programVersion: 'v1' | 'v2' = row.programVersion === 'v2' ? 'v2' : 'v1'

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
        sessionWeekKey: buildSessionClassKey(
          normalizeProgramWeekKey(
            toString(item.key ?? item.weekKey ?? item.week_key ?? item.week),
            maxWeeks,
          ),
          normalizeClassIndex(item.classIndex ?? item.class_index),
          programVersion,
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
        coachUserId:
          toString(
            item.assignedByCoachUserId ?? item.assigned_by_coach_user_id,
          ) || row.coachUserId,
        coachDisplayName:
          toString(
            item.assignedByCoachDisplayName ?? item.assigned_by_coach_display_name,
          ) ||
          (toString(
            item.assignedByCoachUserId ?? item.assigned_by_coach_user_id,
          ) === OWNER_SUPPORT_COACH_USER_ID
            ? OWNER_SUPPORT_COACH_LABEL
            : row.coachDisplayName),
        classJoinUrl: row.classJoinUrl,
        loomUrl: toString(item.loomUrl ?? item.loom_url) || null,
        report: toString(item.report) || null,
        classIndex: normalizeClassIndex(item.classIndex ?? item.class_index),
        programVersion,
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

const LANGUAGE_FLAGS: Record<string, string> = {
  pl: '\u{1F1F5}\u{1F1F1}',
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  it: '\u{1F1EE}\u{1F1F9}',
  de: '\u{1F1E9}\u{1F1EA}',
}

/** «Italiano», «Inglés», «English»... → código de idioma (para el color y la bandera). */
function coachingLangCode(targetLang: string): string {
  const clean = targetLang
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (clean.startsWith('ital')) return 'it'
  if (clean.startsWith('ingl') || clean.startsWith('engl')) return 'en'
  if (clean.startsWith('fran') || clean.startsWith('fren')) return 'fr'
  if (clean.startsWith('pola') || clean.startsWith('poli')) return 'pl'
  if (clean.startsWith('alem') || clean.startsWith('germ') || clean.startsWith('deut')) return 'de'
  return clean.slice(0, 2)
}

function coachingLangMeta(targetLang: string): CalendarClassMeta {
  const code = coachingLangCode(targetLang)
  return {
    classKey: code,
    className: targetLang,
    languageCode: code,
    flag: LANGUAGE_FLAGS[code] || null,
    tone: getLanguageTone(code),
  }
}

const BUTTON_BY_TONE: Partial<Record<Tone, 'i' | 'c' | 'a' | 'gold' | 'success'>> = {
  i: 'i',
  c: 'c',
  a: 'a',
  gold: 'gold',
  ok: 'success',
}

function buttonVariantForTone(value: Tone) {
  return BUTTON_BY_TONE[value] || 'default'
}

/** «18:00» → «18h», «19:30» → «19h30» (como en el Calendario ICADEMY). */
function formatHourLabel(time: string): string {
  return time.endsWith(':00') ? `${time.slice(0, 2)}h` : time.replace(':', 'h')
}

/** «W03» → «Semana 3»; «W03-C2» → «Semana 3 · clase 2». */
function formatWeekLabel(weekKey: string): string {
  const match = weekKey.match(/W(\d+)(?:\D+(\d))?/i)
  if (!match) return weekKey
  const week = Number(match[1])
  return match[2] && match[2] !== '1' ? `Semana ${week} · clase ${match[2]}` : `Semana ${week}`
}

function formatLongDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const label = new Date(year || 2000, (month || 1) - 1, day || 1)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })
    .replace(',', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function ManageCoachingCalendarView() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading, refreshing] = useSoftLoading(true)
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
  const [editingSelectedClass, setEditingSelectedClass] = useState(false)
  const [editClassDraft, setEditClassDraft] = useState<EditClassDraft | null>(null)
  const [deletingSelectedClass, setDeletingSelectedClass] = useState(false)
  const [pickedDay, setPickedDay] = useState<string | null>(null)

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
        : rows.filter(
            (row) =>
              row.coachUserId === user?.id || row.supportCoachUserId === user?.id,
          )

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
  const currentMonthKey = useMemo(() => todayDateKey.slice(0, 7), [todayDateKey])
  const activeManagedRows = useMemo(
    () => managedRows.filter((row) => row.isActive && row.status === 'active'),
    [managedRows],
  )

  const coaches = useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of activeManagedRows) {
      if (!row.coachUserId) continue
      byId.set(row.coachUserId, row.coachDisplayName || row.coachUserId)
    }
    if (
      activeManagedRows.some(
        (row) => row.supportCoachUserId === OWNER_SUPPORT_COACH_USER_ID,
      )
    ) {
      byId.set(OWNER_SUPPORT_COACH_USER_ID, OWNER_SUPPORT_COACH_LABEL)
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }, [activeManagedRows])

  const studentsByCoach = useMemo(() => {
    if (!isSuperAdmin) return activeManagedRows
    if (!assignDraft?.coachUserId) return []
    if (assignDraft.coachUserId === OWNER_SUPPORT_COACH_USER_ID) {
      return activeManagedRows
    }
    return activeManagedRows.filter(
      (row) => row.coachUserId === assignDraft.coachUserId,
    )
  }, [activeManagedRows, assignDraft?.coachUserId, isSuperAdmin])

  const selectedManagedSession = useMemo(() => {
    if (!assignDraft?.sessionId) return null
    return managedRows.find((row) => row.id === assignDraft.sessionId) || null
  }, [assignDraft?.sessionId, managedRows])

  const minAssignableWeek = useMemo(() => {
    if (!selectedManagedSession) return 1
    return getSessionMinAssignableWeek(selectedManagedSession)
  }, [selectedManagedSession])

  const selectedSessionMaxWeeks = useMemo(() => {
    if (!selectedManagedSession) return 12
    return getSessionMaxWeeks(selectedManagedSession)
  }, [selectedManagedSession])

  const selectedSessionProgramVersion: 'v1' | 'v2' =
    selectedManagedSession?.programVersion === 'v2' ? 'v2' : 'v1'

  const assignableWeeks = useMemo(() => {
    const weeks: string[] = []
    for (let week = minAssignableWeek; week <= selectedSessionMaxWeeks; week += 1) {
      const weekKey = weekKeyFromNumber(week, selectedSessionMaxWeeks)
      if (selectedSessionProgramVersion === 'v2') {
        weeks.push(buildSessionClassKey(weekKey, 1, 'v2'))
        weeks.push(buildSessionClassKey(weekKey, 2, 'v2'))
      } else {
        weeks.push(weekKey)
      }
    }
    return weeks
  }, [minAssignableWeek, selectedSessionMaxWeeks, selectedSessionProgramVersion])

  useEffect(() => {
    if (!assignDraft || !selectedManagedSession) return
    const parsed = parseSessionClassKey(
      assignDraft.weekKey,
      selectedSessionProgramVersion,
      selectedSessionMaxWeeks,
    )
    if (parsed.weekKey && weekNumberFromKey(parsed.weekKey, selectedSessionMaxWeeks) >= minAssignableWeek) {
      if (assignableWeeks.includes(assignDraft.weekKey)) return
    }
    setAssignDraft((prev) =>
      prev
        ? {
            ...prev,
            weekKey: assignableWeeks[0] || weekKeyFromNumber(minAssignableWeek, selectedSessionMaxWeeks),
          }
        : prev,
    )
  }, [
    assignDraft,
    minAssignableWeek,
    selectedManagedSession,
    selectedSessionProgramVersion,
    selectedSessionMaxWeeks,
    assignableWeeks,
  ])

  const handleOpenAssignModal = (dateKey: string) => {
    const initialSession = isSuperAdmin
      ? null
      : activeManagedRows.find(
          (row) =>
            row.coachUserId === user?.id || row.supportCoachUserId === user?.id,
        ) || null
    const initialWeek = initialSession
      ? buildSessionClassKey(
          weekKeyFromNumber(
            getSessionMinAssignableWeek(initialSession),
            getSessionMaxWeeks(initialSession),
          ),
          1,
          initialSession.programVersion === 'v2' ? 'v2' : 'v1',
        )
      : 'W01'

    setAssignDraft({
      sessionId: initialSession?.id || '',
      coachUserId: isSuperAdmin ? '' : user?.id || '',
      weekKey: initialWeek,
      scheduledDate: dateKey,
      scheduledTime: '',
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

    const maxWeeks = getSessionMaxWeeks(selectedManagedSession)
    const programVersion: 'v1' | 'v2' =
      selectedManagedSession.programVersion === 'v2' ? 'v2' : 'v1'
    const parsedSessionClassKey = parseSessionClassKey(
      assignDraft.weekKey,
      programVersion,
      maxWeeks,
    )

    if (weekNumberFromKey(parsedSessionClassKey.weekKey, maxWeeks) < minAssignableWeek) {
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
      if (programVersion === 'v2') {
        const existingWeekClass = getClassSessionByWeek(
          selectedManagedSession.classSessions,
          assignDraft.weekKey,
          'v2',
        )

        await upsertCoachingV2ClassCoachGuidelines({
          sessionId: selectedManagedSession.id,
          periodNumber: weekNumberFromKey(parsedSessionClassKey.weekKey, maxWeeks),
          classIndex: parsedSessionClassKey.classIndex,
          title:
            toString(existingWeekClass?.title) ||
            `Clase ${parsedSessionClassKey.classIndex}`,
          assignedByCoachUserId: user?.id || null,
          loomUrl:
            toString(existingWeekClass?.loomUrl ?? existingWeekClass?.loom_url) ||
            null,
          report: toString(existingWeekClass?.report) || null,
          reportImagePath:
            toString(
              existingWeekClass?.reportImagePath ??
                existingWeekClass?.report_image_path,
            ) || null,
          scheduledAt: nextScheduledAt,
          coachGuideline1:
            toString(
              existingWeekClass?.coachGuideline1 ??
                existingWeekClass?.coach_guideline_1,
            ) ||
            null,
          coachGuideline2:
            toString(
              existingWeekClass?.coachGuideline2 ??
                existingWeekClass?.coach_guideline_2,
            ) ||
            null,
          coachGuideline3:
            toString(
              existingWeekClass?.coachGuideline3 ??
                existingWeekClass?.coach_guideline_3,
            ) ||
            null,
        })

        setAssignModalOpen(false)
        setAssignDraft(null)
        setFeedback('Clase guardada correctamente en el calendario de coaching.')
        await loadData()
        return
      }

      const existingWeekClass = getClassSessionByWeek(
        selectedManagedSession.classSessions,
        parsedSessionClassKey.weekKey,
        'v1',
      )

      const baseSessions = Array.isArray(selectedManagedSession.classSessions)
        ? selectedManagedSession.classSessions.filter((item) => {
            if (!item || typeof item !== 'object') return false
            const row = item as Record<string, unknown>
            const key = normalizeProgramWeekKey(
              toString(row.key ?? row.weekKey ?? row.week_key ?? row.week),
            )
            return key !== parsedSessionClassKey.weekKey
          })
        : []

      const nextWeekClass = {
        id: toString(existingWeekClass?.id) || crypto.randomUUID(),
        key: parsedSessionClassKey.weekKey,
        weekKey: parsedSessionClassKey.weekKey,
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
        assignedByCoachUserId: user?.id || null,
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
        classJoinUrl: selectedManagedSession.classJoinUrl,
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
    const [year, month] = currentMonthKey.split('-').map(Number)
    for (let offset = 0; offset <= 2; offset += 1) {
      const date = new Date(year, month - 1 + offset, 1)
      months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(months).sort((a, b) => a.localeCompare(b))
  }, [currentMonthKey, entries])

  useEffect(() => {
    if (availableMonths.length === 0) {
      setSelectedMonth(currentMonthKey)
      return
    }

    const fallback =
      availableMonths.find((month) => month === currentMonthKey) ||
      availableMonths[availableMonths.length - 1]

    setSelectedMonth((previous) => {
      if (previous && availableMonths.includes(previous)) return previous
      return fallback
    })
  }, [availableMonths, currentMonthKey])

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

  const selectedEntrySession = useMemo(() => {
    if (!selectedEntry) return null
    return managedRows.find((row) => row.id === selectedEntry.sessionId) || null
  }, [managedRows, selectedEntry])

  const editWeekOptions = useMemo(() => {
    if (!selectedEntrySession) {
      return Array.from({ length: 12 }, (_, index) => weekKeyFromNumber(index + 1))
    }

    const maxWeeks = getSessionMaxWeeks(selectedEntrySession)
    const minWeek = getSessionMinAssignableWeek(selectedEntrySession)
    const isV2 = selectedEntrySession.programVersion === 'v2'
    const options: string[] = []

    for (let week = minWeek; week <= maxWeeks; week += 1) {
      const weekKey = weekKeyFromNumber(week, maxWeeks)
      if (isV2) {
        options.push(buildSessionClassKey(weekKey, 1, 'v2'))
        options.push(buildSessionClassKey(weekKey, 2, 'v2'))
      } else {
        options.push(weekKey)
      }
    }

    return options
  }, [selectedEntrySession])

  useEffect(() => {
    if (!selectedEntry) {
      setEditingSelectedClass(false)
      setEditClassDraft(null)
      return
    }

    const scheduledDraft = toDateAndTimeFromIso(selectedEntry.scheduledAt)
    setEditClassDraft({
      weekKey: selectedEntry.sessionWeekKey,
      scheduledDate: scheduledDraft.date,
      scheduledTime: scheduledDraft.time,
    })
    setEditingSelectedClass(false)
  }, [selectedEntry])

  const handleSaveSelectedClass = async () => {
    if (!selectedEntry || !editClassDraft) return

    const selectedSession =
      managedRows.find((row) => row.id === selectedEntry.sessionId) || null
    if (!selectedSession) {
      setFeedback('No se encontró la sesión para editar la clase.')
      return
    }

    const nextScheduledAt = toIsoFromDateAndTime(
      editClassDraft.scheduledDate,
      editClassDraft.scheduledTime,
    )
    if (!nextScheduledAt) {
      setFeedback('La fecha u hora no es valida.')
      return
    }

    const maxWeeks = getSessionMaxWeeks(selectedSession)
    const programVersion: 'v1' | 'v2' =
      selectedSession.programVersion === 'v2' ? 'v2' : 'v1'
    const currentSessionClass = parseSessionClassKey(
      selectedEntry.sessionWeekKey,
      programVersion,
      maxWeeks,
    )
    const nextSessionClass = parseSessionClassKey(
      editClassDraft.weekKey,
      programVersion,
      maxWeeks,
    )

    if (programVersion === 'v2') {
      const existingTargetClass = getClassSessionByWeek(
        selectedSession.classSessions,
        editClassDraft.weekKey,
        'v2',
      )

      await upsertCoachingV2ClassCoachGuidelines({
        sessionId: selectedSession.id,
        periodNumber: weekNumberFromKey(nextSessionClass.weekKey, maxWeeks),
        classIndex: nextSessionClass.classIndex,
        title:
          toString(existingTargetClass?.title) ||
          `Clase ${nextSessionClass.classIndex}`,
        assignedByCoachUserId:
          toString(
            existingTargetClass?.assignedByCoachUserId ??
              existingTargetClass?.assigned_by_coach_user_id,
          ) ||
          selectedEntry.coachUserId ||
          null,
        loomUrl:
          toString(existingTargetClass?.loomUrl ?? existingTargetClass?.loom_url) ||
          selectedEntry.loomUrl ||
          null,
        report: toString(existingTargetClass?.report) || selectedEntry.report || null,
        reportImagePath:
          toString(
            existingTargetClass?.reportImagePath ??
              existingTargetClass?.report_image_path,
          ) || null,
        scheduledAt: nextScheduledAt,
        coachGuideline1:
          toString(
            existingTargetClass?.coachGuideline1 ??
              existingTargetClass?.coach_guideline_1,
          ) || null,
        coachGuideline2:
          toString(
            existingTargetClass?.coachGuideline2 ??
              existingTargetClass?.coach_guideline_2,
          ) || null,
        coachGuideline3:
          toString(
            existingTargetClass?.coachGuideline3 ??
              existingTargetClass?.coach_guideline_3,
          ) || null,
      })

      setEditingSelectedClass(false)
      setSelectedEntry(null)
      setFeedback('Clase actualizada correctamente.')
      await loadData()
      return
    }

    const existingCurrentWeekClass = getClassSessionByWeek(
      selectedSession.classSessions,
      currentSessionClass.weekKey,
      'v1',
    )
    const existingTargetWeekClass = getClassSessionByWeek(
      selectedSession.classSessions,
      nextSessionClass.weekKey,
      'v1',
    )
    const rowBase =
      nextSessionClass.weekKey === currentSessionClass.weekKey
        ? existingCurrentWeekClass
        : existingTargetWeekClass

    const baseSessions = Array.isArray(selectedSession.classSessions)
      ? selectedSession.classSessions.filter((item) => {
          if (!item || typeof item !== 'object') return false
          const row = item as Record<string, unknown>
            const key = normalizeProgramWeekKey(
              toString(row.key ?? row.weekKey ?? row.week_key ?? row.week),
            )
            return (
            key !== currentSessionClass.weekKey && key !== nextSessionClass.weekKey
          )
        })
      : []

    const nextWeekClass = {
      id:
        toString(rowBase?.id) ||
        toString(existingCurrentWeekClass?.id) ||
        selectedEntry.id ||
        crypto.randomUUID(),
      key: nextSessionClass.weekKey,
      weekKey: nextSessionClass.weekKey,
      title: 'Clase semanal',
      loomUrl: toString(rowBase?.loomUrl ?? rowBase?.loom_url) || null,
      report: toString(rowBase?.report) || null,
      reportImagePath:
        toString(rowBase?.reportImagePath ?? rowBase?.report_image_path) || null,
      reportImageUrl:
        toString(rowBase?.reportImageUrl ?? rowBase?.report_image_url) || null,
      assignedByCoachUserId:
        toString(
          rowBase?.assignedByCoachUserId ?? rowBase?.assigned_by_coach_user_id,
        ) || null,
      scheduledAt: nextScheduledAt,
      createdAt:
        toString(rowBase?.createdAt ?? rowBase?.created_at) ||
        toString(existingCurrentWeekClass?.createdAt ?? existingCurrentWeekClass?.created_at) ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const nextSessions = [nextWeekClass, ...baseSessions]

    setSavingClass(true)
    setFeedback(null)
    try {
      await upsertCoachingUser({
        sessionId: selectedSession.id,
        userId: selectedSession.userId,
        targetLang: selectedSession.targetLang,
        nativeLang: selectedSession.nativeLang,
        level: selectedSession.level,
        coachUserId: selectedSession.coachUserId,
        classJoinUrl: selectedSession.classJoinUrl,
        feedbackNmUrl: selectedSession.feedbackNmUrl,
        feedbackNmNotes: selectedSession.feedbackNmNotes,
        notes: selectedSession.notes,
        classSessions: nextSessions,
      })

      setEditingSelectedClass(false)
      setSelectedEntry(null)
      setFeedback('Clase actualizada correctamente.')
      await loadData()
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'No se pudo actualizar la clase.',
      )
    } finally {
      setSavingClass(false)
    }
  }

  const handleDeleteSelectedClass = async () => {
    if (!selectedEntry) return

    const selectedSession =
      managedRows.find((row) => row.id === selectedEntry.sessionId) || null
    if (!selectedSession) {
      setFeedback('No se encontró la sesión para eliminar la clase.')
      return
    }

    const maxWeeks = getSessionMaxWeeks(selectedSession)
    const programVersion: 'v1' | 'v2' =
      selectedSession.programVersion === 'v2' ? 'v2' : 'v1'

    if (programVersion === 'v2') {
      const parsed = parseSessionClassKey(
        selectedEntry.sessionWeekKey,
        'v2',
        maxWeeks,
      )

      setDeletingSelectedClass(true)
      setFeedback(null)
      try {
        const existingTargetClass = getClassSessionByWeek(
          selectedSession.classSessions,
          selectedEntry.sessionWeekKey,
          'v2',
        )

        await upsertCoachingV2ClassCoachGuidelines({
          sessionId: selectedSession.id,
          periodNumber: weekNumberFromKey(parsed.weekKey, maxWeeks),
          classIndex: parsed.classIndex,
          title:
            toString(existingTargetClass?.title) || `Clase ${parsed.classIndex}`,
          assignedByCoachUserId:
            toString(
              existingTargetClass?.assignedByCoachUserId ??
                existingTargetClass?.assigned_by_coach_user_id,
            ) || null,
          loomUrl:
            toString(existingTargetClass?.loomUrl ?? existingTargetClass?.loom_url) ||
            null,
          report: toString(existingTargetClass?.report) || null,
          reportImagePath:
            toString(
              existingTargetClass?.reportImagePath ??
                existingTargetClass?.report_image_path,
            ) || null,
          scheduledAt: null,
          coachGuideline1:
            toString(
              existingTargetClass?.coachGuideline1 ??
                existingTargetClass?.coach_guideline_1,
            ) || null,
          coachGuideline2:
            toString(
              existingTargetClass?.coachGuideline2 ??
                existingTargetClass?.coach_guideline_2,
            ) || null,
          coachGuideline3:
            toString(
              existingTargetClass?.coachGuideline3 ??
                existingTargetClass?.coach_guideline_3,
            ) || null,
        })

        setSelectedEntry(null)
        setFeedback('Clase eliminada correctamente.')
        await loadData()
      } catch (err) {
        setFeedback(
          err instanceof Error ? err.message : 'No se pudo eliminar la clase.',
        )
      } finally {
        setDeletingSelectedClass(false)
      }
      return
    }

    const nextSessions = Array.isArray(selectedSession.classSessions)
      ? selectedSession.classSessions.filter((item) => {
          if (!item || typeof item !== 'object') return false
          const row = item as Record<string, unknown>
          const itemId = toString(row.id)
          if (itemId && itemId === selectedEntry.id) return false
          const key = normalizeProgramWeekKey(
            toString(row.key ?? row.weekKey ?? row.week_key ?? row.week),
          )
          const scheduledAt = toString(row.scheduledAt ?? row.scheduled_at)
          return !(
            key === selectedEntry.sessionWeekKey &&
            scheduledAt === selectedEntry.scheduledAt
          )
        })
      : []

    setDeletingSelectedClass(true)
    setFeedback(null)
    try {
      await upsertCoachingUser({
        sessionId: selectedSession.id,
        userId: selectedSession.userId,
        targetLang: selectedSession.targetLang,
        nativeLang: selectedSession.nativeLang,
        level: selectedSession.level,
        coachUserId: selectedSession.coachUserId,
        classJoinUrl: selectedSession.classJoinUrl,
        feedbackNmUrl: selectedSession.feedbackNmUrl,
        feedbackNmNotes: selectedSession.feedbackNmNotes,
        notes: selectedSession.notes,
        classSessions: nextSessions,
      })

      setSelectedEntry(null)
      setFeedback('Clase eliminada correctamente.')
      await loadData()
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'No se pudo eliminar la clase.',
      )
    } finally {
      setDeletingSelectedClass(false)
    }
  }

  const monthCellsWithEntries = calendarCells
  const monthLabel = formatMonthName(selectedMonth)
  const shiftMonth = (delta: number) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const date = new Date(year || 2000, (month || 1) - 1 + delta, 1)
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
    setPickedDay(null)
  }
  // Día elegido: el que tocaste; si no, hoy (si es este mes) o el primer día con clases.
  const selectedDay =
    pickedDay && pickedDay.startsWith(selectedMonth)
      ? pickedDay
      : todayDateKey.startsWith(selectedMonth)
        ? todayDateKey
        : entries.find((entry) => entry.dateKey.startsWith(selectedMonth))?.dateKey ||
          `${selectedMonth}-01`
  const selectedDayEntries = entriesByDate.get(selectedDay) || []
  const nextEntry = entries.find((entry) => new Date(entry.scheduledAt).getTime() >= Date.now() - 60 * 60 * 1000) || null
  const monthEntriesCount = entries.filter((entry) => entry.dateKey.startsWith(selectedMonth)).length
  const monthStudentsCount = new Set(
    entries.filter((entry) => entry.dateKey.startsWith(selectedMonth)).map((entry) => entry.studentUserId),
  ).size
  const legendLanguages = Array.from(
    new Set(entries.filter((entry) => entry.dateKey.startsWith(selectedMonth)).map((entry) => coachingLangCode(entry.targetLang))),
  )

  const renderClassRow = (entry: CoachingCalendarEntry) => {
    const meta = coachingLangMeta(entry.targetLang)
    const colors = tone(meta.tone)
    const isMine = isSuperAdmin && entry.coachUserId === currentUserId
    return (
      <button
        key={entry.id}
        type='button'
        onClick={() => setSelectedEntry(entry)}
        className='flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left transition-colors hover:bg-muted/60'
      >
        <span
          className='flex h-11 w-[62px] shrink-0 items-center justify-center rounded-2xl text-sm font-black tabular-nums'
          style={{ background: colors.soft, color: colors.ink }}
        >
          {formatHourLabel(entry.timeLabel)}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='flex items-center gap-1.5'>
            <ClassFlag meta={meta} className='text-base' />
            <span className='truncate text-[15px] font-extrabold'>{entry.studentName}</span>
            {isMine ? <Pill tone='ok'>Tú</Pill> : null}
          </span>
          <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
            {entry.targetLang} {entry.level} · {formatWeekLabel(entry.sessionWeekKey)}
          </span>
          {entry.coachDisplayName ? (
            <span className='block text-xs font-bold text-muted-foreground'>con {entry.coachDisplayName}</span>
          ) : null}
        </span>
        <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' strokeWidth={2.6} aria-hidden='true' />
      </button>
    )
  }

  const renderHero = () => {
    if (!nextEntry) return null
    const meta = coachingLangMeta(nextEntry.targetLang)
    const colors = tone(meta.tone)
    const isToday = nextEntry.dateKey === todayDateKey
    return (
      <div
        className='ica-panel flex flex-wrap items-center gap-4 p-4 sm:p-5'
        style={{ background: `color-mix(in oklab, ${colors.solid} 9%, var(--card))`, borderColor: `color-mix(in oklab, ${colors.solid} 35%, var(--border))` }}
      >
        <DateBadge dateKey={nextEntry.dateKey} tone={meta.tone} size={68} />
        <div className='min-w-0 flex-1'>
          <p className='m-0 text-[11px] font-black tracking-[0.08em] uppercase' style={{ color: colors.ink }}>
            Próxima clase de coaching
          </p>
          <p className='m-0 mt-0.5 flex items-center gap-2 text-xl leading-tight font-black'>
            <ClassFlag meta={meta} />
            <span className='truncate'>{nextEntry.studentName}</span>
          </p>
          <p className='m-0 mt-0.5 text-sm font-bold' style={{ color: colors.ink }}>
            {isToday ? 'Hoy' : formatLongDay(nextEntry.dateKey)} · {formatHourLabel(nextEntry.timeLabel)} ·{' '}
            {formatWeekLabel(nextEntry.sessionWeekKey)}
          </p>
          <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>
            {nextEntry.targetLang} {nextEntry.level}
            {nextEntry.coachDisplayName ? ` · con ${nextEntry.coachDisplayName}` : ''}
          </p>
        </div>
        <div className='flex w-full gap-2 sm:w-auto'>
          {nextEntry.classJoinUrl ? (
            <Button asChild size='lg' variant={buttonVariantForTone(meta.tone)} className='flex-1 rounded-2xl sm:flex-none'>
              <a href={nextEntry.classJoinUrl} target='_blank' rel='noopener noreferrer'>
                <VideoIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
                Entrar
              </a>
            </Button>
          ) : null}
          <Button type='button' size='lg' variant='outline' className='flex-1 rounded-2xl sm:flex-none' onClick={() => setSelectedEntry(nextEntry)}>
            <InfoIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
            Detalles
          </Button>
        </div>
      </div>
    )
  }

  const renderMonthHeader = () => (
    <div className='mb-3 flex items-center gap-2'>
      <p className='m-0 flex-1 text-lg font-extrabold'>{monthLabel}</p>
      <span className='flex shrink-0 gap-2'>
        <button
          type='button'
          onClick={() => shiftMonth(-1)}
          className='flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted'
          aria-label='Mes anterior'
        >
          <ChevronLeftIcon className='size-5' strokeWidth={2.6} />
        </button>
        <button
          type='button'
          onClick={() => shiftMonth(1)}
          className='flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted'
          aria-label='Mes siguiente'
        >
          <ChevronRightIcon className='size-5' strokeWidth={2.6} />
        </button>
      </span>
    </div>
  )

  const renderLegend = () =>
    legendLanguages.length > 0 ? (
      <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1.5'>
        {legendLanguages.map((code) => (
          <span key={code} className='flex items-center gap-1.5 text-xs font-bold text-muted-foreground'>
            <span className='size-2.5 rounded-full' style={{ background: tone(getLanguageTone(code)).solid }} />
            {getLanguageName(code)}
          </span>
        ))}
      </div>
    ) : null

  // Ordenador: casillas redondeadas con un chip por clase (bandera, hora y alumno)
  const renderMonthGrid = () => (
    <div>
      {renderMonthHeader()}
      <div className='grid grid-cols-7 gap-2'>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className='pb-1 text-center text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
            {label}
          </div>
        ))}
        {monthCellsWithEntries.map((cell) => {
          const dayNumber = Number(cell.dateKey.slice(-2))
          const dayEntries = entriesByDate.get(cell.dateKey) || []
          const isSelected = cell.dateKey === selectedDay
          const isToday = cell.dateKey === todayDateKey
          const isPastDay = cell.dateKey < todayDateKey
          const visibleEntries = dayEntries.slice(0, 3)
          const hiddenCount = dayEntries.length - visibleEntries.length

          const inner = (
            <>
              <span className='flex items-center justify-between gap-1'>
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full text-sm font-extrabold tabular-nums',
                    !isToday && dayEntries.length === 0 && 'text-muted-foreground',
                  )}
                  style={isToday ? { background: 'var(--primary)', color: 'var(--primary-foreground)' } : undefined}
                >
                  {dayNumber}
                </span>
                {isToday ? <span className='text-[10px] font-black tracking-[0.08em] text-primary uppercase'>Hoy</span> : null}
              </span>
              <span className='flex flex-col gap-1'>
                {visibleEntries.map((entry) => {
                  const meta = coachingLangMeta(entry.targetLang)
                  const colors = tone(meta.tone)
                  return (
                    <span
                      key={entry.id}
                      className='flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-[11px] leading-4 font-extrabold'
                      style={{ background: colors.soft, color: colors.ink }}
                      title={`${entry.studentName} · ${entry.targetLang} ${entry.level} · ${formatHourLabel(entry.timeLabel)}`}
                    >
                      <ClassFlag meta={meta} className='text-xs' />
                      <span className='shrink-0 tabular-nums'>{formatHourLabel(entry.timeLabel)}</span>
                      <span className='truncate font-bold opacity-80'>{firstName(entry.studentName)}</span>
                    </span>
                  )
                })}
                {hiddenCount > 0 ? (
                  <span className='px-1.5 text-[11px] font-extrabold text-muted-foreground'>+{hiddenCount} más</span>
                ) : null}
              </span>
            </>
          )

          if (!cell.inCurrentMonth) {
            return (
              <div key={cell.dateKey} className='flex min-h-[6.75rem] flex-col gap-1 rounded-2xl p-1.5 opacity-35'>
                {inner}
              </div>
            )
          }

          return (
            <button
              key={cell.dateKey}
              type='button'
              onClick={() => setPickedDay(cell.dateKey)}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-[6.75rem] min-w-0 flex-col gap-1 rounded-2xl border-2 bg-card p-1.5 text-left transition-colors hover:border-primary/50',
                isSelected ? 'border-primary' : 'border-border',
                isPastDay && !isSelected && 'opacity-60',
              )}
              style={
                isSelected
                  ? { background: 'color-mix(in oklab, var(--primary) 9%, var(--card))', boxShadow: '0 3px 0 var(--primary-edge)' }
                  : { boxShadow: '0 3px 0 var(--border)' }
              }
            >
              {inner}
            </button>
          )
        })}
      </div>
      {renderLegend()}
    </div>
  )

  // Móvil: el mes en círculos con puntos de color por idioma
  const renderMonthCircles = () => (
    <div>
      {renderMonthHeader()}
      <div className='grid grid-cols-7 gap-1.5'>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => (
          <div key={day} className='pb-1 text-center text-xs font-extrabold text-muted-foreground'>
            {day}
          </div>
        ))}
        {monthCellsWithEntries.map((cell) => {
          const dayNumber = Number(cell.dateKey.slice(-2))
          if (!cell.inCurrentMonth) {
            return (
              <div key={cell.dateKey} className='flex aspect-square items-center justify-center text-sm font-bold text-muted-foreground opacity-35'>
                {dayNumber}
              </div>
            )
          }
          const dayEntries = entriesByDate.get(cell.dateKey) || []
          const isSelected = cell.dateKey === selectedDay
          const isToday = cell.dateKey === todayDateKey
          const hasClasses = dayEntries.length > 0
          const dotTones = Array.from(new Set(dayEntries.map((entry) => coachingLangMeta(entry.targetLang).tone))).slice(0, 3)
          return (
            <button
              key={cell.dateKey}
              type='button'
              onClick={() => setPickedDay(cell.dateKey)}
              aria-pressed={isSelected}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-full text-sm font-extrabold tabular-nums transition-colors',
                isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                cell.dateKey < todayDateKey && !isSelected && 'opacity-55',
              )}
              style={{
                background: isSelected
                  ? 'var(--primary)'
                  : hasClasses
                    ? 'color-mix(in oklab, var(--primary) 10%, var(--card))'
                    : 'transparent',
                color: isSelected ? 'var(--primary-foreground)' : hasClasses ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
            >
              {dayNumber}
              {dotTones.length > 0 ? (
                <span className='absolute bottom-[14%] left-1/2 flex -translate-x-1/2 gap-0.5'>
                  {dotTones.map((dotTone) => (
                    <span
                      key={dotTone}
                      className='size-1.5 rounded-full'
                      style={{ background: isSelected ? 'var(--primary-foreground)' : tone(dotTone).solid }}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {renderLegend()}
    </div>
  )

  const canAddOnSelectedDay = selectedDay >= todayDateKey

  const renderDayPanel = () => (
    <div className='ica-panel p-4'>
      <div className='flex items-center gap-3'>
        <DateBadge dateKey={selectedDay} tone='primary' size={56} />
        <div className='min-w-0 flex-1'>
          <p className='m-0 text-lg leading-tight font-extrabold'>{formatLongDay(selectedDay)}</p>
          <p className='m-0 mt-0.5 text-sm font-semibold text-muted-foreground'>
            {selectedDay === todayDateKey ? 'Hoy · ' : ''}
            {selectedDayEntries.length === 0
              ? 'Sin clases'
              : `${selectedDayEntries.length} ${selectedDayEntries.length === 1 ? 'clase' : 'clases'}`}
          </p>
        </div>
      </div>
      {selectedDayEntries.length > 0 ? (
        <div className='mt-2 divide-y-2 divide-border'>{selectedDayEntries.map((entry) => renderClassRow(entry))}</div>
      ) : (
        <p className='m-0 mt-3 rounded-2xl bg-muted px-3 py-3 text-sm font-semibold text-muted-foreground'>
          Este día no hay clases de coaching.
        </p>
      )}
      {canAddOnSelectedDay ? (
        <Button
          type='button'
          variant='outline'
          size='lg'
          className='mt-3 w-full rounded-2xl'
          onClick={() => handleOpenAssignModal(selectedDay)}
        >
          <PlusIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
          Añadir clase este día
        </Button>
      ) : null}
    </div>
  )

  const renderStats = () => (
    <div className='grid grid-cols-2 gap-3'>
      <StatTile tone='i' value={String(monthEntriesCount)} label={`clases en ${monthLabel.split(' ')[0].toLowerCase()}`} />
      <StatTile tone='c' value={String(monthStudentsCount)} label={monthStudentsCount === 1 ? 'alumno' : 'alumnos'} />
    </div>
  )

  return (
    <section className='mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='c' size={48} className='hidden sm:flex'>
            <CalendarHeartIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle={isSuperAdmin ? 'Todas las clases, por alumno y coacher.' : 'Tus clases, por alumno.'}
        right={
          <span className='flex gap-2'>
            <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => navigate(-1)} aria-label='Volver'>
              <ArrowLeftIcon className='size-5' strokeWidth={2.6} />
            </Button>
            <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => void loadData()} disabled={refreshing} aria-label='Recargar'>
              <RefreshCwIcon className={refreshing ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
            </Button>
          </span>
        }
      >
        Calendario Coaching
      </PageTitle>

      {error || feedback ? (
        <Panel tone={error ? 'bad' : 'neutral'} className='text-sm font-bold'>
          {error || feedback}
        </Panel>
      ) : null}

      {loading ? (
        <Panel>
          <BlockLoading label='Cargando calendario...' className='h-[420px]' />
        </Panel>
      ) : entries.length === 0 ? (
        <Panel>
          <EmptyState
            icon={
              <IconTile tone='c' size={64}>
                <CalendarHeartIcon className='size-8' strokeWidth={2.4} />
              </IconTile>
            }
            title='Todavía no hay clases'
            text='Cuando programes clases de coaching, aparecerán aquí.'
          />
          <Button type='button' size='lg' className='mt-3 w-full rounded-2xl' onClick={() => handleOpenAssignModal(todayDateKey)}>
            <PlusIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
            Añadir una clase
          </Button>
        </Panel>
      ) : (
        <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]'>
          <div className='flex min-w-0 flex-col gap-6'>
            {renderHero()}
            <div className='hidden lg:block'>{renderMonthGrid()}</div>
            <div className='flex flex-col gap-4 lg:hidden'>
              {renderMonthCircles()}
              {renderDayPanel()}
            </div>
          </div>
          <aside className='flex flex-col gap-6 lg:sticky lg:top-6'>
            <div className='hidden lg:block'>{renderDayPanel()}</div>
            <div>
              <SectionLabel>Este mes</SectionLabel>
              {renderStats()}
            </div>
          </aside>
        </div>
      )}
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
                <AppSelect
                  id='assign-coach-select'
                  className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                  value={assignDraft?.coachUserId || ''}
                  onChange={(event) => {
                    const coachId = event.target.value
                    const firstSession = activeManagedRows.find((row) =>
                      coachId === OWNER_SUPPORT_COACH_USER_ID
                        ? row.supportCoachUserId === OWNER_SUPPORT_COACH_USER_ID
                        : row.coachUserId === coachId,
                    )
                    setAssignDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            coachUserId: coachId,
                            sessionId: firstSession?.id || '',
                            weekKey: firstSession
                              ? buildSessionClassKey(
                                  weekKeyFromNumber(
                                    getSessionMinAssignableWeek(firstSession),
                                    getSessionMaxWeeks(firstSession),
                                  ),
                                  1,
                                  firstSession.programVersion === 'v2'
                                    ? 'v2'
                                    : 'v1',
                                )
                              : 'W01',
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
                </AppSelect>
              </div>
            )}

            <div className='space-y-1.5'>
              <Label htmlFor='assign-student-select'>Alumno</Label>
              <AppSelect
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
                            ? buildSessionClassKey(
                                weekKeyFromNumber(
                                  getSessionMinAssignableWeek(selected),
                                  getSessionMaxWeeks(selected),
                                ),
                                1,
                                selected.programVersion === 'v2' ? 'v2' : 'v1',
                              )
                            : prev.weekKey,
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
              </AppSelect>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='assign-week-select'>Semana</Label>
              <AppSelect
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
              </AppSelect>
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
            <DialogTitle>Clase de coaching</DialogTitle>
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
              <p className='flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2'>
                <UserIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
                <span className='font-bold'>Alumno:</span>
                {selectedEntry.studentName}
              </p>
              <p className='flex items-center gap-2'>
                <GlobeIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
                <span className='font-bold'>Idioma:</span>
                {selectedEntry.targetLang} ({selectedEntry.level})
              </p>
              <p className='flex items-center gap-2'>
                <BookOpenIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
                <span className='font-bold'>Semana:</span>
                {selectedEntry.sessionWeekKey}
              </p>
              {isSuperAdmin && (
                <p className='flex items-center gap-2'>
                  <GraduationCapIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
                  <span className='font-bold'>Coacher:</span>{' '}
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
                <p className='flex items-start gap-2 rounded-xl border-2 border-border bg-muted/30 p-2 text-xs text-muted-foreground'>
                  <FileTextIcon className='mt-px size-3.5 shrink-0' aria-hidden='true' />
                  {selectedEntry.report}
                </p>
              )}

              {editingSelectedClass && editClassDraft && (
                <div className='space-y-3 rounded-md border bg-muted/20 p-3'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Editar clase
                  </p>

                  <div className='space-y-1.5'>
                    <Label htmlFor='edit-week-select'>Semana</Label>
                    <AppSelect
                      id='edit-week-select'
                      className='h-10 w-full rounded-md border bg-background px-3 text-sm'
                      value={editClassDraft.weekKey}
                      onChange={(event) =>
                        setEditClassDraft((prev) =>
                          prev
                              ? {
                                  ...prev,
                                  weekKey: event.target.value,
                                }
                              : prev,
                          )
                      }
                    >
                      {editWeekOptions.map((weekKey) => (
                        <option key={weekKey} value={weekKey}>
                          {weekKey}
                        </option>
                      ))}
                    </AppSelect>
                  </div>

                  <div className='space-y-1.5'>
                    <Label htmlFor='edit-class-date'>Fecha</Label>
                    <Input
                      id='edit-class-date'
                      type='date'
                      value={editClassDraft.scheduledDate}
                      onChange={(event) =>
                        setEditClassDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                scheduledDate: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>

                  <div className='space-y-1.5'>
                    <Label htmlFor='edit-class-time'>Horario</Label>
                    <Input
                      id='edit-class-time'
                      type='time'
                      value={editClassDraft.scheduledTime}
                      onChange={(event) =>
                        setEditClassDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                scheduledTime: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                {!editingSelectedClass ? (
                  <>
                    <Button
                      type='button'
                      variant='destructive'
                      onClick={() => {
                        const confirmed = window.confirm(
                          '¿Seguro que quieres eliminar esta clase? Esta acción no se puede deshacer.',
                        )
                        if (!confirmed) return
                        void handleDeleteSelectedClass()
                      }}
                      disabled={deletingSelectedClass || savingClass}
                    >
                      {deletingSelectedClass ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setEditingSelectedClass(true)}
                      disabled={deletingSelectedClass || savingClass}
                    >
                      Editar
                    </Button>
                    <Button
                      type='button'
                      onClick={() => setSelectedEntry(null)}
                      disabled={deletingSelectedClass || savingClass}
                    >
                      Cerrar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setEditingSelectedClass(false)}
                      disabled={savingClass}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type='button'
                      onClick={() => void handleSaveSelectedClass()}
                      disabled={
                        savingClass ||
                        !editClassDraft?.weekKey ||
                        !editClassDraft?.scheduledDate ||
                        !editClassDraft?.scheduledTime
                      }
                    >
                      {savingClass ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
