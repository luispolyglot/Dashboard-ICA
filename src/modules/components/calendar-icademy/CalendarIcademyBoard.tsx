import { getUiLang, langName, t, tn, uiLocale } from '@/i18n'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  CalendarDaysIcon,
  CalendarHeartIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  Check,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  InfoIcon,
  ListIcon,
  PlusIcon,
  Volume1,
  VolumeOff,
  XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import useBreakpoints from '@/modules/hooks/useBreakpoints'
import {
  EmptyState,
  GamePage,
  IconTile,
  PageTitle,
  Panel,
  Pill,
  RowGroup,
  SectionLabel,
  SegmentedTabs,
  tone,
  type Tone,
} from '../../game/ui'
import type { CalendarIcademyEntry } from '../../types'
import {
  CALENDAR_ICADEMY_TIMEZONE,
  getCalendarIcademyTodayKey,
  parseCalendarIcademySessionDateTime,
} from '../../utils/calendarIcademyTime'
import { useCalendarIcademyExport } from '../../hooks/useCalendarIcademyExport'
import {
  ClassFlag,
  DateBadge,
  FlagTile,
  getClassMeta,
  getLanguageName,
  getLanguageTone,
} from './calendarIcademyUi'

type CalendarIcademyBoardProps = {
  title: string
  description: string
  entries: CalendarIcademyEntry[]
  loading: boolean
  error: string | null
  emptyMessage: string
  allowMonthNavigation?: boolean
  lockToCurrentMonth?: boolean
  /** Botones grandes debajo del título (los usa la gestión de admin). */
  topActions?: ReactNode
  /** Aviso debajo del título (p. ej. dónde se entra a las clases). */
  notice?: ReactNode
  /** Algo pequeño a la derecha del título (p. ej. la campana de recordatorios). */
  headerRight?: ReactNode
  /** Filas extra para la sección «Ajustes» (p. ej. recordatorios). */
  settingsRows?: ReactNode
  onEntryClick?: (entry: CalendarIcademyEntry) => void
  onLocalTimePreferenceChange?: (enabled: boolean) => void
  canMuteEntry?: (entry: CalendarIcademyEntry) => boolean
  isEntryMuted?: (entry: CalendarIcademyEntry) => boolean
  onToggleEntryMute?: (entry: CalendarIcademyEntry) => void
}

type CalendarCell = {
  dateKey: string
  inCurrentMonth: boolean
}

type ClassOption = {
  classKey: string
  className: string
  languageCode: string
}

type Scope = 'mine' | 'all'
type MobileView = 'agenda' | 'month'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const WEEKDAY_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const SELECTED_CLASSES_STORAGE_KEY = 'calendar-icademy-selected-classes'
const LOCAL_TIME_STORAGE_KEY = 'calendar-icademy-show-local-time'
const SPECIAL_ALWAYS_ALLOWED_CLASS_KEY = 'destripando_niveles'
const MAX_NON_SPECIAL_CLASSES = 2
// Duración de una clase (la misma que se usa al exportar)
const CLASS_DURATION_MS = 60 * 60 * 1000
// Días que enseña la agenda hacia delante aunque cambie el mes
const AGENDA_MIN_DAYS_AHEAD = 13
// Días con clase que enseña la agenda antes de «Ver más días»
const AGENDA_PAGE_DAYS = 7

// Botón de juego del color de cada idioma
const BUTTON_BY_TONE: Record<Tone, 'i' | 'c' | 'a' | 'gold' | 'fire' | 'success' | 'default'> = {
  i: 'i',
  c: 'c',
  a: 'a',
  gold: 'gold',
  fire: 'fire',
  ok: 'success',
  bad: 'a',
  primary: 'default',
  neutral: 'default',
}

function getMonthKey(sessionDate: string): string {
  return sessionDate.slice(0, 7)
}

function formatMonthName(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  const label = date.toLocaleDateString(uiLocale(), {
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatSessionDayLabel(sessionDate: string): string {
  const date = new Date(`${sessionDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return sessionDate
  return `${t(DAY_NAMES[date.getDay()])} ${date.getDate()}`
}

function formatSessionTimeLabel(sessionTime: string): string {
  return sessionTime.endsWith(':00')
    ? `${sessionTime.slice(0, 2)}h`
    : sessionTime.replace(':', 'h')
}

function compareTime(a: string, b: string): number {
  return a.localeCompare(b)
}

function getDateKeyInTimezone(date: Date, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '0000'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

function formatTimeLabelInTimezone(date: Date, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat(uiLocale(), {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value || '00'
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  return minute === '00' ? `${hour}h` : `${hour}h${minute}`
}

/** Día de la fecha (sin hora): suma o resta días a una clave AAAA-MM-DD. */
function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year || 2000, (month || 1) - 1, (day || 1) + days))
  return date.toISOString().slice(0, 10)
}

function weekdayOfDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year || 2000, (month || 1) - 1, day || 1).getDay()
}

/** «Miércoles 30» (y «de octubre» si no es el mes que se está viendo). */
function formatLongDayLabel(dateKey: string, withMonth = false): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year || 2000, (month || 1) - 1, day || 1)
  const label = date.toLocaleDateString(uiLocale(), {
    weekday: 'long',
    day: 'numeric',
    ...(withMonth ? { month: 'long' } : {}),
  })
  const clean = label.replace(',', '')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function joinWithY(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return t('{a} y {b}', { a: items.slice(0, -1).join(', '), b: items[items.length - 1] })
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

/**
 * CALENDARIO ICADEMY: la próxima clase en grande, tus clases (eliges hasta 2 + Destripando
 * Niveles), la agenda por días y el mes con puntos de color por idioma. Lo usan el alumno
 * y la gestión de admin (con navegación de meses).
 */
export function CalendarIcademyBoard({
  title,
  description,
  entries,
  loading,
  error,
  emptyMessage,
  allowMonthNavigation = false,
  lockToCurrentMonth = false,
  topActions,
  notice,
  headerRight,
  settingsRows,
  onEntryClick,
  onLocalTimePreferenceChange,
  canMuteEntry,
  isEntryMuted,
  onToggleEntryMute,
}: CalendarIcademyBoardProps) {
  const [selectedClassKeys, setSelectedClassKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(SELECTED_CLASSES_STORAGE_KEY)
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (value): value is string => typeof value === 'string',
      )
    } catch {
      return []
    }
  })
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  // Qué clases se ven en la agenda y el mes: solo las tuyas o todas
  const [scope, setScope] = useState<Scope>('mine')
  const [mobileView, setMobileView] = useState<MobileView>('agenda')
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [showPastDays, setShowPastDays] = useState(false)
  const [agendaDaysLimit, setAgendaDaysLimit] = useState(AGENDA_PAGE_DAYS)
  // Las pastillas para cambiar de clase se pliegan cuando ya has elegido
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [showLocalTime, setShowLocalTime] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(LOCAL_TIME_STORAGE_KEY) === '1'
  })
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())
  const { isLg } = useBreakpoints()
  const localTimezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined
  const canUseLocalTime =
    Boolean(localTimezone) && localTimezone !== CALENDAR_ICADEMY_TIMEZONE
  const effectiveTimezone =
    showLocalTime && canUseLocalTime ? localTimezone : undefined

  const classOptions = useMemo<ClassOption[]>(() => {
    const byClassKey = new Map<string, ClassOption>()
    for (const entry of entries) {
      if (!byClassKey.has(entry.classKey)) {
        const meta = getClassMeta(entry.classKey, entry)
        byClassKey.set(entry.classKey, {
          classKey: entry.classKey,
          className: meta.className,
          languageCode: meta.languageCode,
        })
      }
    }

    return Array.from(byClassKey.values()).sort((a, b) => {
      const byName = a.className.localeCompare(b.className)
      if (byName !== 0) return byName
      return a.classKey.localeCompare(b.classKey)
    })
  }, [entries])

  const availableMonths = useMemo(() => {
    const unique = new Set(
      entries.map((entry) => getMonthKey(entry.sessionDate)),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [entries])

  useEffect(() => {
    if (classOptions.length === 0) return

    setSelectedClassKeys((prev) =>
      prev.filter((classKey) =>
        classOptions.some((item) => item.classKey === classKey),
      ),
    )
  }, [classOptions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      SELECTED_CLASSES_STORAGE_KEY,
      JSON.stringify(selectedClassKeys),
    )
  }, [selectedClassKeys])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      LOCAL_TIME_STORAGE_KEY,
      showLocalTime ? '1' : '0',
    )
  }, [showLocalTime])

  useEffect(() => {
    onLocalTimePreferenceChange?.(showLocalTime)
  }, [onLocalTimePreferenceChange, showLocalTime])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now())
    }, 30000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    if (lockToCurrentMonth) {
      setSelectedMonth(currentMonth)
      return
    }

    if (availableMonths.length === 0) {
      setSelectedMonth(currentMonth)
      return
    }

    const fallbackMonth =
      availableMonths.find((month) => month === currentMonth) ||
      availableMonths[availableMonths.length - 1]

    setSelectedMonth((prev) => {
      if (prev && availableMonths.includes(prev)) return prev
      return fallbackMonth
    })
  }, [availableMonths, lockToCurrentMonth])

  const entriesForMonth = useMemo(() => {
    if (!selectedMonth) return []
    return entries.filter(
      (entry) => getMonthKey(entry.sessionDate) === selectedMonth,
    )
  }, [entries, selectedMonth])

  const calendarCells = useMemo(() => {
    if (!selectedMonth) return []
    return buildCalendarCells(selectedMonth)
  }, [selectedMonth])

  // Todas las clases agrupadas por día (ordenadas por hora)
  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarIcademyEntry[]>()

    for (const entry of entries) {
      const list = grouped.get(entry.sessionDate)
      if (list) {
        list.push(entry)
      } else {
        grouped.set(entry.sessionDate, [entry])
      }
    }

    for (const [dateKey, sessions] of grouped) {
      grouped.set(
        dateKey,
        sessions
          .slice()
          .sort((a, b) => compareTime(a.sessionTime, b.sessionTime)),
      )
    }

    return grouped
  }, [entries])

  // Momento exacto (hora de España) de cada clase
  const entryTimes = useMemo(() => {
    const times = new Map<string, number>()
    for (const entry of entries) {
      const sessionDateTime = parseCalendarIcademySessionDateTime({
        sessionDate: entry.sessionDate,
        sessionTime: entry.sessionTime,
      })
      if (sessionDateTime) times.set(entry.id, sessionDateTime.getTime())
    }
    return times
  }, [entries])

  const selectedSessions = useMemo(() => {
    if (selectedClassKeys.length === 0) return []
    return entriesForMonth
      .filter((entry) => selectedClassKeys.includes(entry.classKey))
      .sort((a, b) => {
        const byDate = a.sessionDate.localeCompare(b.sessionDate)
        if (byDate !== 0) return byDate
        return compareTime(a.sessionTime, b.sessionTime)
      })
  }, [entriesForMonth, selectedClassKeys])

  // Resumen de cada clase elegida: qué días, a qué hora y con quién
  const selectedClassSummaries = useMemo(() => {
    return selectedClassKeys
      .map((classKey) => {
        const sessions = entriesForMonth
          .filter((entry) => entry.classKey === classKey)
          .sort((a, b) => {
            const byDate = a.sessionDate.localeCompare(b.sessionDate)
            if (byDate !== 0) return byDate
            return compareTime(a.sessionTime, b.sessionTime)
          })

        if (sessions.length === 0) return null

        const weekdays = new Set<number>()
        const hours: string[] = []
        for (const session of sessions) {
          const sessionDateTime = parseCalendarIcademySessionDateTime({
            sessionDate: session.sessionDate,
            sessionTime: session.sessionTime,
          })
          const dateKey =
            effectiveTimezone && sessionDateTime
              ? getDateKeyInTimezone(sessionDateTime, effectiveTimezone)
              : session.sessionDate
          weekdays.add(weekdayOfDateKey(dateKey))
          const hour =
            effectiveTimezone && sessionDateTime
              ? formatTimeLabelInTimezone(sessionDateTime, effectiveTimezone)
              : formatSessionTimeLabel(session.sessionTime)
          if (!hours.includes(hour)) hours.push(hour)
        }
        const orderedWeekdays = Array.from(weekdays)
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
          .map((day) => t(WEEKDAY_PLURAL[day]))
        const teachers = Array.from(
          new Set(sessions.map((item) => item.teacher)),
        ).join(' / ')

        return {
          classKey,
          label: `${orderedWeekdays.length > 3 ? t('Varios días') : t('Los {days}', { days: joinWithY(orderedWeekdays) })} · ${hours.slice(0, 3).join(' / ')}`,
          teachers,
          sessionsCount: sessions.length,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  }, [effectiveTimezone, entriesForMonth, selectedClassKeys])

  const {
    sessionOptions,
    selectedEntryIds,
    isTimeZoneModalOpen,
    isSelectionModalOpen,
    timeZoneChoiceUseLocal,
    exportTimeZone,
    exportButtonLabel,
    canExport,
    startExportFlow,
    cancelTimeZoneStep,
    confirmTimeZoneStep,
    cancelSelectionStep,
    toggleEntrySelection,
    selectAllEntries,
    clearSelectedEntries,
    setTimeZoneChoiceUseLocal,
    exportSelectedAsIcs,
  } = useCalendarIcademyExport({
    entries: selectedSessions,
    showLocalTime,
    canUseLocalTime,
    localTimezone,
    onShowLocalTimeChange: setShowLocalTime,
  })

  const handleToggleClass = (classKey: string) => {
    setSelectedClassKeys((prev) => {
      if (prev.includes(classKey)) {
        return prev.filter((item) => item !== classKey)
      }

      if (classKey === SPECIAL_ALWAYS_ALLOWED_CLASS_KEY) {
        return [...prev, classKey]
      }

      const nonSpecialSelected = prev.filter(
        (item) => item !== SPECIAL_ALWAYS_ALLOWED_CLASS_KEY,
      )

      if (nonSpecialSelected.length >= MAX_NON_SPECIAL_CLASSES) return prev

      return [...prev, classKey]
    })
  }

  const hasSelection = selectedClassKeys.length > 0
  const showOnlyMine = hasSelection && scope === 'mine'
  const nonSpecialSelectedCount = selectedClassKeys.filter(
    (item) => item !== SPECIAL_ALWAYS_ALLOWED_CLASS_KEY,
  ).length
  const now = new Date()
  const todayKey = getCalendarIcademyTodayKey(now)
  // «Hoy» en la zona en la que se leen las horas (España o la tuya)
  const displayTodayKey = effectiveTimezone
    ? getDateKeyInTimezone(now, effectiveTimezone)
    : todayKey

  const isInScope = (entry: CalendarIcademyEntry): boolean =>
    !showOnlyMine || selectedClassKeys.includes(entry.classKey)

  const getEntryTimeLabel = (entry: CalendarIcademyEntry): string => {
    if (!effectiveTimezone) return formatSessionTimeLabel(entry.sessionTime)
    const time = entryTimes.get(entry.id)
    if (time === undefined) return formatSessionTimeLabel(entry.sessionTime)
    return formatTimeLabelInTimezone(new Date(time), effectiveTimezone)
  }

  const getEntryDisplayDateKey = (entry: CalendarIcademyEntry): string => {
    if (!effectiveTimezone) return entry.sessionDate
    const time = entryTimes.get(entry.id)
    if (time === undefined) return entry.sessionDate
    return getDateKeyInTimezone(new Date(time), effectiveTimezone)
  }

  const getRelativeDayLabel = (dateKey: string): string => {
    if (dateKey === displayTodayKey) return t('Hoy')
    if (dateKey === shiftDateKey(displayTodayKey, 1)) return t('Mañana')
    return formatLongDayLabel(dateKey, getMonthKey(dateKey) !== getMonthKey(displayTodayKey))
  }

  // Estado de una clase: ya pasó, está en directo o empieza pronto
  const getEntryStatus = (entry: CalendarIcademyEntry) => {
    const time = entryTimes.get(entry.id)
    if (time === undefined) return { isPast: false, isLive: false, countdown: null as string | null }
    const minutesUntil = Math.floor((time - nowTimestamp) / 60000)
    const isPast = time + CLASS_DURATION_MS <= nowTimestamp
    const isLive = !isPast && minutesUntil <= 0
    const countdown = isLive
      ? t('En directo')
      : minutesUntil > 0 && minutesUntil <= 120
        ? t('En {n} min', { n: minutesUntil })
        : null
    return { isPast, isLive, countdown }
  }

  // La próxima clase: de las tuyas si has elegido; si no (o no quedan), de todas
  const { nextEntry, nextIsMine } = useMemo(() => {
    const upcoming = entries
      .filter((entry) => {
        const time = entryTimes.get(entry.id)
        return time !== undefined && time + CLASS_DURATION_MS > nowTimestamp
      })
      .sort((a, b) => (entryTimes.get(a.id) || 0) - (entryTimes.get(b.id) || 0))
    const mine = upcoming.find((entry) => selectedClassKeys.includes(entry.classKey))
    if (mine) return { nextEntry: mine, nextIsMine: true }
    return { nextEntry: upcoming[0] ?? null, nextIsMine: false }
  }, [entries, entryTimes, nowTimestamp, selectedClassKeys])

  // Agenda: días con clases del mes (y, al final del mes, las dos semanas siguientes)
  const agenda = useMemo(() => {
    const isCurrentMonth = selectedMonth === getMonthKey(todayKey)
    const lastAgendaDay = shiftDateKey(todayKey, AGENDA_MIN_DAYS_AHEAD)
    const dayKeys = Array.from(entriesByDate.keys())
      .filter((dateKey) => {
        if (getMonthKey(dateKey) === selectedMonth) return true
        return isCurrentMonth && dateKey > todayKey && dateKey <= lastAgendaDay
      })
      .sort((a, b) => a.localeCompare(b))

    const days = dayKeys
      .map((dateKey) => ({
        dateKey,
        entries: (entriesByDate.get(dateKey) || []).filter(
          (entry) => !showOnlyMine || selectedClassKeys.includes(entry.classKey),
        ),
      }))
      .filter((day) => day.entries.length > 0)

    return {
      past: days.filter((day) => day.dateKey < todayKey),
      upcoming: days.filter((day) => day.dateKey >= todayKey),
    }
  }, [entriesByDate, selectedClassKeys, selectedMonth, showOnlyMine, todayKey])

  // Día elegido en el mes: el que toques; si no, hoy o el siguiente con clase
  const defaultDay = useMemo(() => {
    if (!selectedMonth) return todayKey
    const monthDays = Array.from(entriesByDate.keys())
      .filter((dateKey) => getMonthKey(dateKey) === selectedMonth)
      .sort((a, b) => a.localeCompare(b))
    if (getMonthKey(todayKey) === selectedMonth) {
      return monthDays.find((dateKey) => dateKey >= todayKey) || todayKey
    }
    return monthDays[0] || `${selectedMonth}-01`
  }, [entriesByDate, selectedMonth, todayKey])
  const selectedDay =
    pickedDay && getMonthKey(pickedDay) === selectedMonth ? pickedDay : defaultDay
  const selectedDayEntries = (entriesByDate.get(selectedDay) || []).filter(isInScope)

  const languageLegend = useMemo(() => {
    const byLanguage = new Set<string>()
    for (const item of classOptions) {
      if (!showOnlyMine || selectedClassKeys.includes(item.classKey)) {
        byLanguage.add(item.languageCode)
      }
    }

    return Array.from(byLanguage.values()).sort((a, b) => a.localeCompare(b))
  }, [classOptions, selectedClassKeys, showOnlyMine])

  const currentMonthLabel = selectedMonth
    ? formatMonthName(selectedMonth)
    : formatMonthName(getMonthKey(new Date().toISOString().slice(0, 10)))
  const currentYearLabel = (selectedMonth || todayKey).slice(0, 4)

  // Meses a los que se puede ir con las flechas (solo en la gestión)
  const previousMonth = [...availableMonths].reverse().find((month) => month < selectedMonth)
  const nextMonth = availableMonths.find((month) => month > selectedMonth)

  // ---------- Piezas ----------

  const scopeToggle = hasSelection ? (
    <button
      type='button'
      onClick={() => setScope(showOnlyMine ? 'all' : 'mine')}
      className='shrink-0 rounded-xl px-2 py-1 text-sm font-extrabold text-primary transition-colors hover:bg-primary/10'
    >
      {showOnlyMine ? t('Ver todas') : t('Solo las mías')}
    </button>
  ) : null

  const renderClassRow = (entry: CalendarIcademyEntry) => {
    const meta = getClassMeta(entry.classKey, entry)
    const colors = tone(meta.tone)
    const status = getEntryStatus(entry)
    const isMine = selectedClassKeys.includes(entry.classKey)
    const canMuteCurrentEntry = canMuteEntry ? canMuteEntry(entry) : false
    const isMuted = isEntryMuted ? isEntryMuted(entry) : false

    const content = (
      <>
        <span
          className='flex h-12 w-[4.25rem] shrink-0 items-center justify-center rounded-2xl text-base leading-none font-black tabular-nums'
          style={{ background: colors.soft, color: colors.ink }}
        >
          {getEntryTimeLabel(entry)}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='flex items-center gap-1.5 leading-tight font-extrabold'>
            <ClassFlag meta={meta} className='text-lg' />
            <span className='truncate'>{t(meta.className)}</span>
          </span>
          <span className='mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground'>
            <span className='truncate'>{t('con {teacher}', { teacher: entry.teacher })}</span>
            {status.countdown ? (
              <Pill tone={status.isLive ? 'a' : 'primary'} solid>
                {status.countdown}
              </Pill>
            ) : null}
            {!showOnlyMine && isMine ? <Pill tone='ok'>{t('Tuya')}</Pill> : null}
            {isMuted ? <Pill tone='neutral'>{t('Silenciada')}</Pill> : null}
          </span>
        </span>
      </>
    )

    return (
      <div
        key={entry.id}
        className={cn('flex items-center gap-2 py-3', status.isPast && 'opacity-55')}
      >
        {onEntryClick ? (
          <button
            type='button'
            onClick={() => onEntryClick(entry)}
            className='flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-70'
          >
            {content}
          </button>
        ) : (
          <div className='flex min-w-0 flex-1 items-center gap-3'>{content}</div>
        )}
        {canMuteCurrentEntry && onToggleEntryMute ? (
          <button
            type='button'
            onClick={() => onToggleEntryMute(entry)}
            aria-label={isMuted ? t('Cancelar silencio') : t('Silenciar sesión')}
            className='ica-press flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-card text-muted-foreground dark:bg-transparent'
            style={{ boxShadow: '0 3px 0 var(--border)' }}
          >
            {isMuted ? (
              <Volume1 className='size-5' strokeWidth={2.4} />
            ) : (
              <VolumeOff className='size-5' strokeWidth={2.4} />
            )}
          </button>
        ) : onEntryClick ? (
          <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
        ) : null}
      </div>
    )
  }

  // Bloque protagonista: la próxima clase
  const renderHero = () => {
    if (!nextEntry) {
      return (
        <div
          className='flex items-center gap-4 rounded-3xl px-5 py-4'
          style={{ background: tone('neutral').soft }}
        >
          <IconTile tone='neutral' size={56}>
            <CalendarXIcon className='size-7' strokeWidth={2.4} />
          </IconTile>
          <div className='min-w-0'>
            <p className='m-0 text-xl leading-tight font-black tracking-tight'>
              {t('No quedan clases programadas')}
            </p>
            <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
              {t('Las próximas clases aparecerán aquí en cuanto se publiquen.')}
            </p>
          </div>
        </div>
      )
    }

    const meta = getClassMeta(nextEntry.classKey, nextEntry)
    const colors = tone(meta.tone)
    const status = getEntryStatus(nextEntry)
    const displayDateKey = getEntryDisplayDateKey(nextEntry)
    const isSpecial = nextEntry.classKey === SPECIAL_ALWAYS_ALLOWED_CLASS_KEY
    const canFollow =
      isSpecial || nonSpecialSelectedCount < MAX_NON_SPECIAL_CLASSES

    return (
      <div
        className='rounded-3xl px-5 py-4'
        style={{ background: colors.soft }}
        data-testid='calendar-next-class'
      >
        <div className='flex flex-col gap-4'>
          <div className='flex min-w-0 flex-1 items-center gap-4'>
            <DateBadge dateKey={displayDateKey} tone={meta.tone} size={68} />
            <div className='min-w-0 flex-1'>
              <p
                className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase'
                style={{ color: colors.ink }}
              >
                {nextIsMine ? t('Tu próxima clase') : t('Próxima clase en ICADEMY')}
              </p>
              <p
                className='m-0 flex items-center gap-2 text-2xl leading-tight font-black tracking-tight'
                style={{ color: colors.ink }}
              >
                <ClassFlag meta={meta} />
                <span className='truncate'>{t(meta.className)}</span>
              </p>
              <p className='m-0 mt-0.5 text-sm font-extrabold' style={{ color: colors.ink }}>
                {getRelativeDayLabel(displayDateKey)} · {getEntryTimeLabel(nextEntry)}
                {effectiveTimezone ? '' : ` ${t('(España)')}`}
              </p>
              <p className='m-0 mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground'>
                {t('con {teacher}', { teacher: nextEntry.teacher })}
                {status.countdown ? (
                  <Pill tone={status.isLive ? 'a' : meta.tone} solid>
                    {status.countdown}
                  </Pill>
                ) : null}
              </p>
            </div>
          </div>

          <div className='flex gap-2'>
            {hasSelection ? (
              <Button
                type='button'
                size='lg'
                variant={BUTTON_BY_TONE[meta.tone]}
                className='min-w-0 flex-1 lg:max-w-xs'
                onClick={startExportFlow}
                disabled={selectedSessions.length === 0}
              >
                <CalendarPlusIcon data-icon='inline-start' strokeWidth={2.6} />
                <span className='truncate'>{t('Añadir al calendario')}</span>
              </Button>
            ) : (
              <Button
                type='button'
                size='lg'
                variant={BUTTON_BY_TONE[meta.tone]}
                className='min-w-0 flex-1 lg:max-w-xs'
                onClick={() => handleToggleClass(nextEntry.classKey)}
                disabled={!canFollow}
              >
                <PlusIcon data-icon='inline-start' strokeWidth={2.8} />
                {t('Seguir esta clase')}
              </Button>
            )}
            {onEntryClick ? (
              <Button
                type='button'
                size='lg'
                variant='outline'
                onClick={() => onEntryClick(nextEntry)}
                aria-label={t('Detalles de la clase')}
                className='px-3.5 sm:px-5'
              >
                <InfoIcon className='size-5' strokeWidth={2.6} />
                <span className='hidden sm:inline'>{t('Detalles')}</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  // Pastillas grandes para elegir clases (hacen de filtro de idiomas)
  const renderClassPills = () => (
    <div>
      <div className='flex flex-wrap gap-2'>
        {classOptions.map((option) => {
          const meta = getClassMeta(option.classKey, option)
          const colors = tone(meta.tone)
          const isSelected = selectedClassKeys.includes(option.classKey)
          const isSpecialClass = option.classKey === SPECIAL_ALWAYS_ALLOWED_CLASS_KEY
          const isDisabled =
            !isSelected &&
            !isSpecialClass &&
            nonSpecialSelectedCount >= MAX_NON_SPECIAL_CLASSES
          const style: CSSProperties = isSelected
            ? {
                background: colors.soft,
                borderColor: colors.solid,
                color: colors.ink,
                boxShadow: `0 3px 0 ${colors.edge}`,
              }
            : { boxShadow: '0 3px 0 var(--border)' }

          return (
            <button
              key={option.classKey}
              type='button'
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => handleToggleClass(option.classKey)}
              className={cn(
                'ica-press flex h-11 items-center gap-2 rounded-2xl border-2 px-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-40',
                !isSelected && 'border-border bg-card dark:bg-transparent',
              )}
              style={style}
            >
              <ClassFlag meta={meta} className='text-lg' />
              {t(meta.className)}
              {isSelected ? (
                <Check className='size-4' strokeWidth={3} aria-hidden='true' />
              ) : null}
            </button>
          )
        })}
      </div>
      <p className='m-0 mt-3 text-xs font-semibold text-muted-foreground'>
        {nonSpecialSelectedCount >= MAX_NON_SPECIAL_CLASSES
          ? t('Ya sigues 2 clases. Quita una para cambiarla; Destripando Niveles siempre se puede añadir.')
          : t('Máximo 2 clases + Destripando Niveles, que siempre está disponible.')}
      </p>
    </div>
  )

  // Tus clases: las que sigues (con sus días y hora) o un aviso amable para elegirlas
  const renderMyClasses = () =>
    hasSelection ? (
      <RowGroup>
        {selectedClassKeys.map((classKey) => {
          const option = classOptions.find((item) => item.classKey === classKey)
          const meta = getClassMeta(classKey, option)
          const summary = selectedClassSummaries.find((item) => item.classKey === classKey)
          return (
            <div key={classKey} className='flex items-center gap-3 py-3'>
              <FlagTile meta={meta} size={48} />
              <span className='min-w-0 flex-1'>
                <span className='block truncate leading-tight font-extrabold'>{t(meta.className)}</span>
                <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>
                  {summary
                    ? `${summary.label} · ${t('con {teacher}', { teacher: summary.teachers })}`
                    : t('Sin clases en {month}', {
                        month: getUiLang() === 'en' ? currentMonthLabel : currentMonthLabel.toLowerCase(),
                      })}
                </span>
              </span>
              <button
                type='button'
                onClick={() => handleToggleClass(classKey)}
                aria-label={t('Dejar de seguir {name}', { name: t(meta.className) })}
                className='flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
              >
                <XIcon className='size-5' strokeWidth={2.6} />
              </button>
            </div>
          )
        })}
        {!isLg ? (
          <button
            type='button'
            onClick={() => setIsPickerOpen((prev) => !prev)}
            aria-expanded={isPickerOpen}
            className='flex w-full items-center gap-3 py-3 text-left transition-opacity active:opacity-70'
          >
            <IconTile tone='primary' size={48}>
              <PlusIcon
                className={cn('size-6 transition-transform', isPickerOpen && 'rotate-45')}
                strokeWidth={2.8}
              />
            </IconTile>
            <span className='min-w-0 flex-1 leading-tight font-extrabold text-primary'>
              {isPickerOpen ? t('Listo') : t('Cambiar o añadir clases')}
            </span>
          </button>
        ) : null}
      </RowGroup>
    ) : (
      <Panel tone='i' className='flex items-center gap-3'>
        <IconTile tone='i' solid size={48}>
          <CalendarHeartIcon className='size-6' strokeWidth={2.4} />
        </IconTile>
        <span className='min-w-0 flex-1'>
          <span className='block leading-tight font-extrabold'>{t('Elige las clases que quieres seguir')}</span>
          <span className='mt-1 block text-sm font-semibold text-muted-foreground'>
            {t('Toca abajo tus clases y verás aquí cuándo son. Mientras, te enseñamos todas.')}
          </span>
        </span>
      </Panel>
    )

  const renderMonthHeader = () => (
    <div className='mb-3 flex items-center gap-2'>
      <p className='m-0 flex-1 text-lg font-extrabold'>
        {currentMonthLabel}{' '}
        <span className='font-bold text-muted-foreground'>{currentYearLabel}</span>
      </p>
      {scopeToggle}
      {allowMonthNavigation ? (
        <span className='flex shrink-0 gap-2'>
          <button
            type='button'
            onClick={() => previousMonth && setSelectedMonth(previousMonth)}
            disabled={!previousMonth}
            className='flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted disabled:opacity-40'
            aria-label={t('Mes anterior')}
          >
            <ChevronLeftIcon className='size-5' strokeWidth={2.6} />
          </button>
          <button
            type='button'
            onClick={() => nextMonth && setSelectedMonth(nextMonth)}
            disabled={!nextMonth}
            className='flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted disabled:opacity-40'
            aria-label={t('Mes siguiente')}
          >
            <ChevronRightIcon className='size-5' strokeWidth={2.6} />
          </button>
        </span>
      ) : null}
    </div>
  )

  const renderLegend = () =>
    languageLegend.length > 0 ? (
      <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1.5'>
        {languageLegend.map((languageCode) => (
          <span
            key={languageCode}
            className='flex items-center gap-1.5 text-xs font-bold text-muted-foreground'
          >
            <span
              className='size-2.5 rounded-full'
              style={{ background: tone(getLanguageTone(languageCode)).solid }}
            />
            {langName(getLanguageName(languageCode))}
          </span>
        ))}
      </div>
    ) : null

  // Móvil: el mes en círculos (como Rachas) con puntos de color por idioma
  const renderMonthCircles = () => (
    <div>
      {renderMonthHeader()}
      <div className='grid grid-cols-7 gap-1.5'>
        {WEEKDAY_INITIALS.map((day, index) => (
          <div key={index} className='pb-1 text-center text-xs font-extrabold text-muted-foreground'>
            {getUiLang() === 'en' ? t(WEEKDAY_LABELS[index]).charAt(0) : day}
          </div>
        ))}
        {calendarCells.map((cell) => {
          const dayNumber = Number(cell.dateKey.slice(-2))
          const dayEntries = (entriesByDate.get(cell.dateKey) || []).filter(isInScope)
          if (!cell.inCurrentMonth) {
            return (
              <div
                key={cell.dateKey}
                className='flex aspect-square items-center justify-center text-sm font-bold text-muted-foreground opacity-35'
              >
                {dayNumber}
              </div>
            )
          }
          const isSelected = cell.dateKey === selectedDay
          const isToday = cell.dateKey === todayKey
          const hasClasses = dayEntries.length > 0
          const dotTones = Array.from(
            new Set(dayEntries.map((entry) => getClassMeta(entry.classKey, entry).tone)),
          ).slice(0, 3)
          return (
            <button
              key={cell.dateKey}
              type='button'
              onClick={() => setPickedDay(cell.dateKey)}
              aria-pressed={isSelected}
              aria-label={`${formatLongDayLabel(cell.dateKey)}: ${tn(dayEntries.length, '{n} clase', '{n} clases')}`}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-full text-sm font-extrabold tabular-nums transition-colors',
                isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                cell.dateKey < todayKey && !isSelected && 'opacity-55',
              )}
              style={{
                background: isSelected
                  ? 'var(--primary)'
                  : hasClasses
                    ? 'color-mix(in oklab, var(--primary) 10%, var(--card))'
                    : 'transparent',
                color: isSelected
                  ? 'var(--primary-foreground)'
                  : hasClasses
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground)',
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

  // Ordenador: el mes en casillas redondeadas con chips de color por clase
  const renderMonthGrid = () => (
    <div>
      {renderMonthHeader()}
      <div className='grid grid-cols-7 gap-2'>
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className='pb-1 text-center text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'
          >
            {t(label)}
          </div>
        ))}
        {calendarCells.map((cell) => {
          const dayNumber = Number(cell.dateKey.slice(-2))
          const dayEntries = (entriesByDate.get(cell.dateKey) || []).filter(isInScope)
          const isSelected = cell.dateKey === selectedDay
          const isToday = cell.dateKey === todayKey
          const isPastDay = cell.dateKey < todayKey
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
                  style={
                    isToday
                      ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                      : undefined
                  }
                >
                  {dayNumber}
                </span>
                {isToday ? (
                  <span className='text-[10px] font-black tracking-[0.08em] text-primary uppercase'>{t('Hoy')}</span>
                ) : null}
              </span>
              <span className='flex flex-col gap-1'>
                {visibleEntries.map((entry) => {
                  const meta = getClassMeta(entry.classKey, entry)
                  const colors = tone(meta.tone)
                  return (
                    <span
                      key={entry.id}
                      className='flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-[11px] leading-4 font-extrabold'
                      style={{ background: colors.soft, color: colors.ink }}
                      aria-label={`${t(meta.className)} · ${getEntryTimeLabel(entry)} · ${t('con {teacher}', { teacher: entry.teacher })}`}
                    >
                      <ClassFlag meta={meta} className='text-xs' />
                      <span className='truncate tabular-nums'>{getEntryTimeLabel(entry)}</span>
                    </span>
                  )
                })}
                {hiddenCount > 0 ? (
                  <span className='px-1.5 text-[11px] font-extrabold text-muted-foreground'>
                    {t('+{n} más', { n: hiddenCount })}
                  </span>
                ) : null}
              </span>
            </>
          )

          if (!cell.inCurrentMonth) {
            return (
              <div
                key={cell.dateKey}
                className='flex min-h-[6.75rem] flex-col gap-1 rounded-2xl p-1.5 opacity-35'
              >
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
              aria-label={`${formatLongDayLabel(cell.dateKey)}: ${tn(dayEntries.length, '{n} clase', '{n} clases')}`}
              className={cn(
                'flex min-h-[6.75rem] min-w-0 flex-col gap-1 rounded-2xl border-2 bg-card p-1.5 text-left transition-colors hover:border-primary/50',
                isSelected ? 'border-primary' : 'border-border',
                isPastDay && !isSelected && 'opacity-60',
              )}
              style={
                isSelected
                  ? {
                      background: 'color-mix(in oklab, var(--primary) 9%, var(--card))',
                      boxShadow: '0 3px 0 var(--primary-edge)',
                    }
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

  // Las clases del día elegido (panel lateral en ordenador, debajo del mes en el móvil)
  const renderDayPanel = () => (
    <div className='ica-panel p-4'>
      <div className='flex items-center gap-3'>
        <DateBadge dateKey={selectedDay} tone='primary' size={56} />
        <div className='min-w-0'>
          <p className='m-0 text-lg leading-tight font-extrabold'>
            {formatLongDayLabel(selectedDay)}
          </p>
          <p className='m-0 mt-0.5 text-sm font-semibold text-muted-foreground'>
            {selectedDay === todayKey ? `${t('Hoy')} · ` : ''}
            {selectedDayEntries.length === 0
              ? t('Sin clases')
              : tn(selectedDayEntries.length, '{n} clase', '{n} clases')}
          </p>
        </div>
      </div>
      {selectedDayEntries.length > 0 ? (
        <div className='mt-2 divide-y-2 divide-border'>
          {selectedDayEntries.map((entry) => renderClassRow(entry))}
        </div>
      ) : (
        <p className='m-0 mt-3 rounded-2xl bg-muted px-3 py-3 text-sm font-semibold text-muted-foreground'>
          {showOnlyMine
            ? t('Este día no tienes clases. Toca «Ver todas» para ver las demás.')
            : t('Este día no hay clases.')}
        </p>
      )}
    </div>
  )

  const renderAgendaDay = (day: { dateKey: string; entries: CalendarIcademyEntry[] }) => {
    const isToday = day.dateKey === todayKey
    const isTomorrow = day.dateKey === shiftDateKey(todayKey, 1)
    return (
      <div key={day.dateKey}>
        <p className='m-0 mb-2 flex items-center gap-2 text-sm font-extrabold'>
          {isToday ? <Pill tone='primary' solid>{t('HOY')}</Pill> : null}
          {isTomorrow ? <Pill tone='primary'>{t('MAÑANA')}</Pill> : null}
          <span>
            {formatLongDayLabel(day.dateKey, getMonthKey(day.dateKey) !== selectedMonth)}
          </span>
        </p>
        <RowGroup>{day.entries.map((entry) => renderClassRow(entry))}</RowGroup>
      </div>
    )
  }

  // Móvil: agenda por días (próximas primero; las pasadas, plegadas)
  const renderAgenda = () => (
    <div className='flex flex-col gap-5'>
      {agenda.past.length > 0 ? (
        <button
          type='button'
          onClick={() => setShowPastDays((prev) => !prev)}
          className='self-start rounded-xl px-2 py-1 text-sm font-extrabold text-muted-foreground transition-colors hover:bg-muted'
        >
          {showPastDays
            ? t('Ocultar días anteriores')
            : t('Ver días anteriores ({n})', { n: agenda.past.length })}
        </button>
      ) : null}
      {showPastDays ? (
        <div className='flex flex-col gap-5 opacity-80'>{agenda.past.map(renderAgendaDay)}</div>
      ) : null}
      {agenda.upcoming.length > 0 ? (
        <>
          {agenda.upcoming.slice(0, agendaDaysLimit).map(renderAgendaDay)}
          {agenda.upcoming.length > agendaDaysLimit ? (
            <Button
              type='button'
              variant='outline'
              size='lg'
              className='w-full'
              onClick={() => setAgendaDaysLimit((prev) => prev + AGENDA_PAGE_DAYS)}
            >
              {t('Ver más días ({n})', { n: agenda.upcoming.length - agendaDaysLimit })}
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={
            <IconTile tone='neutral' size={64}>
              <CalendarXIcon className='size-8' strokeWidth={2.4} />
            </IconTile>
          }
          title={t('No hay más clases programadas')}
          text={t('Cuando se publiquen nuevas clases, aparecerán aquí.')}
          action={
            showOnlyMine ? (
              <Button type='button' variant='outline' onClick={() => setScope('all')}>
                {t('Ver todas las clases')}
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  )

  const hasLocalTimeRow = canUseLocalTime
  const renderSettings = () =>
    settingsRows || hasLocalTimeRow ? (
      <div>
        <SectionLabel>{t('Ajustes')}</SectionLabel>
        <RowGroup>
          {settingsRows}
          {hasLocalTimeRow ? (
            <div className='flex items-center gap-3 py-3'>
              <IconTile tone='i' size={48}>
                <GlobeIcon className='size-6' strokeWidth={2.4} />
              </IconTile>
              <Label
                htmlFor='calendar-local-time-switch'
                className='min-w-0 flex-1 flex-col items-start gap-0.5 leading-tight'
              >
                <span className='block font-extrabold'>{t('Ver horario en mi zona')}</span>
                <span className='block text-xs font-semibold text-muted-foreground'>
                  {localTimezone} · {t('si no, en hora de España')}
                </span>
              </Label>
              <Switch
                id='calendar-local-time-switch'
                checked={showLocalTime}
                onCheckedChange={setShowLocalTime}
              />
            </div>
          ) : null}
        </RowGroup>
      </div>
    ) : null

  const hasEntries = !loading && entries.length > 0

  return (
    <GamePage wide className='max-w-xl gap-6 pb-10 lg:max-w-5xl'>
      <PageTitle subtitle={description} right={headerRight}>
        {title}
      </PageTitle>

      {topActions ? <div className='-mt-2 flex flex-wrap gap-2'>{topActions}</div> : null}

      {notice ? <div className='-mt-2'>{notice}</div> : null}

      {error ? (
        <Panel tone='bad' className='text-sm font-bold'>
          {error}
        </Panel>
      ) : null}

      {loading ? (
        <div className='flex flex-col gap-3' aria-busy='true'>
          <div className='h-28 animate-pulse rounded-3xl bg-muted' />
          <p className='m-0 text-center text-sm font-semibold text-muted-foreground'>
            {t('Cargando calendario...')}
          </p>
        </div>
      ) : entries.length === 0 ? (
        <Panel>
          <EmptyState
            icon={
              <IconTile tone='i' size={64}>
                <CalendarDaysIcon className='size-8' strokeWidth={2.4} />
              </IconTile>
            }
            title={t('Todavía no hay clases')}
            text={emptyMessage}
          />
        </Panel>
      ) : null}

      {hasEntries && !isLg ? (
        <>
          {renderHero()}

          <div>
            <SectionLabel>{t('Tus clases')}</SectionLabel>
            {renderMyClasses()}
            {!hasSelection || isPickerOpen ? (
              <>
                <p className='ica-label m-0 mt-5 mb-2'>
                  {hasSelection ? t('Toca para cambiar o añadir') : t('Clases disponibles')}
                </p>
                {renderClassPills()}
              </>
            ) : null}
          </div>

          <div className='flex flex-col gap-4'>
            <SegmentedTabs
              ariaLabel={t('Cómo ver el calendario')}
              value={mobileView}
              onChange={setMobileView}
              options={[
                { value: 'agenda', label: t('Agenda'), icon: <ListIcon className='size-5' strokeWidth={2.6} /> },
                { value: 'month', label: t('Mes'), icon: <CalendarDaysIcon className='size-5' strokeWidth={2.6} /> },
              ]}
            />
            {mobileView === 'agenda' ? (
              <div>
                <SectionLabel right={scopeToggle}>
                  {showOnlyMine ? t('Tus próximas clases') : t('Próximas clases')}
                </SectionLabel>
                {renderAgenda()}
              </div>
            ) : (
              <div className='flex flex-col gap-4'>
                {renderMonthCircles()}
                {renderDayPanel()}
              </div>
            )}
          </div>

          {renderSettings()}
        </>
      ) : null}

      {hasEntries && isLg ? (
        <div className='grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6'>
          <div className='flex min-w-0 flex-col gap-6'>
            {renderHero()}
            <div>
              <SectionLabel>
                {hasSelection ? t('Cambiar o añadir clases') : t('Elige tus clases')}
              </SectionLabel>
              {renderClassPills()}
            </div>
            {renderMonthGrid()}
          </div>
          <aside className='sticky top-6 flex flex-col gap-6'>
            {renderDayPanel()}
            <div>
              <SectionLabel>{t('Tus clases')}</SectionLabel>
              {renderMyClasses()}
            </div>
            {renderSettings()}
          </aside>
        </div>
      ) : null}

      {!hasEntries && !loading ? renderSettings() : null}

      <Dialog
        open={isTimeZoneModalOpen}
        onOpenChange={(open) => {
          if (!open) cancelTimeZoneStep()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Zona horaria para exportar')}</DialogTitle>
            <DialogDescription>
              {t('Detectamos que no estás en {zone}. Elige si quieres exportar con hora de España o con tu hora local.', {
                zone: CALENDAR_ICADEMY_TIMEZONE,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className='flex items-center gap-3 rounded-2xl border-2 border-border bg-muted/40 p-3'>
            <IconTile tone='i' size={44}>
              <GlobeIcon className='size-5' strokeWidth={2.4} />
            </IconTile>
            <Label
              htmlFor='calendar-export-local-time-switch'
              className='min-w-0 flex-1 flex-col items-start gap-1 leading-tight'
            >
              <span className='block font-extrabold'>{t('Usar mi zona local ({zone})', { zone: localTimezone ?? '' })}</span>
              <span className='block text-xs font-semibold text-muted-foreground'>
                {t('Si lo activas, el archivo usa tu hora local. Si no, la hora de España.')}
              </span>
            </Label>
            <Switch
              id='calendar-export-local-time-switch'
              checked={timeZoneChoiceUseLocal}
              onCheckedChange={setTimeZoneChoiceUseLocal}
            />
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={cancelTimeZoneStep}>
              {t('Cancelar')}
            </Button>
            <Button onClick={() => confirmTimeZoneStep()}>{t('Continuar')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isSelectionModalOpen}
        onOpenChange={(open) => {
          if (!open) cancelSelectionStep()
        }}
      >
        <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>{t('Añadir clases a tu calendario')}</DialogTitle>
            <DialogDescription>
              {t('Marca las clases que quieres y descarga el archivo para tu calendario ({zone}).', { zone: exportTimeZone })}
            </DialogDescription>
          </DialogHeader>

          <div className='flex items-center justify-between gap-2'>
            <Button variant='ghost' size='sm' onClick={selectAllEntries}>
              {t('Marcar todas')}
            </Button>
            <Button variant='ghost' size='sm' onClick={clearSelectedEntries}>
              {t('Limpiar selección')}
            </Button>
          </div>

          <div className='flex flex-col gap-2'>
            {sessionOptions.map((option) => {
              const isChecked = selectedEntryIds.includes(option.entryId)
              const entryDate = new Date(`${option.sessionDate}T00:00:00`)
              const dayLabel = Number.isNaN(entryDate.getTime())
                ? option.sessionDate
                : formatSessionDayLabel(option.sessionDate)
              const timeLabel = formatSessionTimeLabel(option.sessionTime)
              const matchingEntry = selectedSessions.find(
                (entry) => entry.id === option.entryId,
              )
              const meta = getClassMeta(matchingEntry?.classKey || '', {
                className: option.className,
                languageCode: matchingEntry?.languageCode || '',
              })

              return (
                <button
                  key={`export-option-${option.entryId}`}
                  type='button'
                  onClick={() => toggleEntrySelection(option.entryId)}
                  aria-pressed={isChecked}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                    isChecked ? 'border-[var(--ica-ok)]' : 'border-border',
                  )}
                  style={isChecked ? { background: 'var(--ica-ok-soft)' } : undefined}
                >
                  <FlagTile meta={meta} size={40} />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate font-extrabold'>{t(option.className)}</span>
                    <span className='block text-xs font-semibold text-muted-foreground'>
                      {dayLabel} · {timeLabel} · {t('con {teacher}', { teacher: option.teacher })}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                      isChecked ? 'border-transparent text-white' : 'border-border text-transparent',
                    )}
                    style={isChecked ? { background: 'var(--ica-ok)' } : undefined}
                  >
                    <Check className='size-4' strokeWidth={3} />
                  </span>
                </button>
              )
            })}
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={cancelSelectionStep}>
              {t('Cancelar')}
            </Button>
            <Button
              disabled={!canExport}
              onClick={() => {
                const exported = exportSelectedAsIcs('icademy-clases')
                if (exported) {
                  toast.success(t('Calendario exportado ({file})', { file: exported.filename }))
                  cancelSelectionStep()
                } else {
                  toast.error(t('No hay clases seleccionadas para exportar.'))
                }
              }}
            >
              <CalendarPlusIcon />
              {exportButtonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GamePage>
  )
}
