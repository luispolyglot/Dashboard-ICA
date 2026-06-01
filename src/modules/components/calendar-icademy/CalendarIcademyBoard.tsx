import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { getCalendarIcademyCatalogEntry } from '../../constants/calendarIcademyCatalog'
import { cn } from '@/lib/utils'
import type { CalendarIcademyEntry } from '../../types'
import {
  CALENDAR_ICADEMY_TIMEZONE,
  getCalendarIcademyTodayKey,
  parseCalendarIcademySessionDateTime,
} from '../../utils/calendarIcademyTime'
import { Volume1, VolumeOff } from 'lucide-react'

type CalendarIcademyBoardProps = {
  title: string
  description: string
  entries: CalendarIcademyEntry[]
  loading: boolean
  error: string | null
  emptyMessage: string
  allowMonthNavigation?: boolean
  lockToCurrentMonth?: boolean
  topActions?: ReactNode
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

type LanguageTone = {
  badgeClassName: string
  activeFilterClassName: string
  rowClassName: string
  legendClassName: string
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const SELECTED_CLASSES_STORAGE_KEY = 'calendar-icademy-selected-classes'
const LOCAL_TIME_STORAGE_KEY = 'calendar-icademy-show-local-time'
const SPECIAL_ALWAYS_ALLOWED_CLASS_KEY = 'destripando_niveles'

const LANGUAGE_TONES: Record<string, LanguageTone> = {
  pl: {
    badgeClassName: 'border-cyan-300/70 bg-cyan-500/10 text-cyan-700',
    activeFilterClassName: 'border-cyan-400/80 bg-cyan-500/15 text-cyan-700',
    rowClassName: 'border-l-cyan-500 bg-cyan-500/10',
    legendClassName: 'bg-cyan-500',
  },
  fr: {
    badgeClassName: 'border-blue-300/70 bg-blue-500/10 text-blue-700',
    activeFilterClassName: 'border-blue-400/80 bg-blue-500/15 text-blue-700',
    rowClassName: 'border-l-blue-500 bg-blue-500/10',
    legendClassName: 'bg-blue-500',
  },
  en: {
    badgeClassName: 'border-red-300/70 bg-red-500/10 text-red-700',
    activeFilterClassName: 'border-red-400/80 bg-red-500/15 text-red-700',
    rowClassName: 'border-l-red-500 bg-red-500/10',
    legendClassName: 'bg-red-500',
  },
  it: {
    badgeClassName: 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700',
    activeFilterClassName:
      'border-emerald-400/80 bg-emerald-500/15 text-emerald-700',
    rowClassName: 'border-l-emerald-500 bg-emerald-500/10',
    legendClassName: 'bg-emerald-500',
  },
  de: {
    badgeClassName: 'border-amber-300/70 bg-amber-500/10 text-amber-700',
    activeFilterClassName: 'border-amber-400/80 bg-amber-500/15 text-amber-700',
    rowClassName: 'border-l-amber-500 bg-amber-500/10',
    legendClassName: 'bg-amber-500',
  },
}

const DEFAULT_TONE: LanguageTone = {
  badgeClassName: 'border-border bg-muted text-foreground',
  activeFilterClassName: 'border-primary/60 bg-primary/10 text-foreground',
  rowClassName: 'border-l-primary bg-muted/60',
  legendClassName: 'bg-primary',
}

function getMonthKey(sessionDate: string): string {
  return sessionDate.slice(0, 7)
}

function formatMonthName(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  const label = date.toLocaleDateString('es-ES', {
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatSessionDayLabel(sessionDate: string): string {
  const date = new Date(`${sessionDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return sessionDate
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}`
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
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value || '00'
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  return minute === '00' ? `${hour}h` : `${hour}:${minute}`
}

function formatDayLabelInTimezone(date: Date, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
  })
  const label = formatter.format(date).replace('.', '')
  const [weekday, day] = label.split(' ')
  if (!weekday || !day) return label
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day}`
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
  const [activeTab, setActiveTab] = useState<'calendar' | 'my-classes'>(
    'calendar',
  )
  const [showLocalTime, setShowLocalTime] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(LOCAL_TIME_STORAGE_KEY) === '1'
  })
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now())
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
        const catalogEntry = getCalendarIcademyCatalogEntry(entry.classKey)
        byClassKey.set(entry.classKey, {
          classKey: entry.classKey,
          className: catalogEntry?.className || entry.className,
          languageCode: catalogEntry?.languageCode || entry.languageCode,
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

  const visibleDateKeys = useMemo(
    () => new Set(calendarCells.map((cell) => cell.dateKey)),
    [calendarCells],
  )

  const entriesForGrid = useMemo(
    () => entries.filter((entry) => visibleDateKeys.has(entry.sessionDate)),
    [entries, visibleDateKeys],
  )

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarIcademyEntry[]>()

    for (const entry of entriesForGrid) {
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
  }, [entriesForGrid])

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

        const firstSession = sessions[0]
        const catalogEntry = getCalendarIcademyCatalogEntry(classKey)
        const sessionDateTime = parseCalendarIcademySessionDateTime({
          sessionDate: firstSession.sessionDate,
          sessionTime: firstSession.sessionTime,
        })
        const weekdayLabel =
          effectiveTimezone && sessionDateTime
            ? formatDayLabelInTimezone(
                sessionDateTime,
                effectiveTimezone,
              ).split(' ')[0]
            : formatSessionDayLabel(firstSession.sessionDate).split(' ')[0]
        const hourLabel =
          effectiveTimezone && sessionDateTime
            ? formatTimeLabelInTimezone(sessionDateTime, effectiveTimezone)
            : formatSessionTimeLabel(firstSession.sessionTime)
        const teachers = Array.from(
          new Set(sessions.map((item) => item.teacher)),
        ).join(' / ')
        const className = catalogEntry?.className || firstSession.className
        const languageCode =
          catalogEntry?.languageCode || firstSession.languageCode
        const flag = catalogEntry?.flag || '🌐'

        return {
          classKey,
          className,
          flag,
          label: `${weekdayLabel} ${hourLabel}`,
          teachers,
          languageCode,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  }, [effectiveTimezone, entriesForMonth, selectedClassKeys])

  const languageLegend = useMemo(() => {
    const byLanguage = new Set<string>()
    for (const item of classOptions) {
      byLanguage.add(item.languageCode)
    }

    return Array.from(byLanguage.values()).sort((a, b) => a.localeCompare(b))
  }, [classOptions])

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

      if (nonSpecialSelected.length >= 2) return prev

      return [...prev, classKey]
    })
  }

  const showAllClasses = selectedClassKeys.length === 0
  const nonSpecialSelectedCount = selectedClassKeys.filter(
    (item) => item !== SPECIAL_ALWAYS_ALLOWED_CLASS_KEY,
  ).length
  const now = new Date()
  const todayKey = getCalendarIcademyTodayKey(now)
  const todayKeyForDisplay = getDateKeyInTimezone(now, effectiveTimezone)

  const getEntryTimeLabel = (entry: CalendarIcademyEntry): string => {
    if (!effectiveTimezone) return formatSessionTimeLabel(entry.sessionTime)
    const sessionDateTime = parseCalendarIcademySessionDateTime({
      sessionDate: entry.sessionDate,
      sessionTime: entry.sessionTime,
    })
    if (!sessionDateTime) return formatSessionTimeLabel(entry.sessionTime)
    return formatTimeLabelInTimezone(sessionDateTime, effectiveTimezone)
  }

  const getEntryDayLabel = (entry: CalendarIcademyEntry): string => {
    if (!effectiveTimezone) return formatSessionDayLabel(entry.sessionDate)
    const sessionDateTime = parseCalendarIcademySessionDateTime({
      sessionDate: entry.sessionDate,
      sessionTime: entry.sessionTime,
    })
    if (!sessionDateTime) return formatSessionDayLabel(entry.sessionDate)
    return formatDayLabelInTimezone(sessionDateTime, effectiveTimezone)
  }

  const isEntryToday = (entry: CalendarIcademyEntry): boolean => {
    if (!effectiveTimezone) return entry.sessionDate === todayKey
    const sessionDateTime = parseCalendarIcademySessionDateTime({
      sessionDate: entry.sessionDate,
      sessionTime: entry.sessionTime,
    })
    if (!sessionDateTime) return false
    return (
      getDateKeyInTimezone(sessionDateTime, effectiveTimezone) ===
      todayKeyForDisplay
    )
  }

  const currentMonthLabel = selectedMonth
    ? formatMonthName(selectedMonth)
    : formatMonthName(getMonthKey(new Date().toISOString().slice(0, 10)))

  return (
    <section className='mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>{title}</h2>
          <p className='text-sm text-muted-foreground'>{description}</p>
        </div>
        {topActions}
      </div>

      {error && <p className='mb-4 text-sm text-destructive'>{error}</p>}

      <Card>
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as 'calendar' | 'my-classes')
          }
        >
          <CardHeader className='gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <CardTitle>Calendario mensual - {currentMonthLabel}</CardTitle>
              {allowMonthNavigation && availableMonths.length > 0 && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder='Selecciona mes' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Meses con clases</SelectLabel>
                      {availableMonths.map((month) => (
                        <SelectItem key={month} value={month}>
                          {formatMonthName(month)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className='flex flex-wrap items-center justify-between gap-3'>
              <TabsList>
                <TabsTrigger value='calendar'>Calendario</TabsTrigger>
                <TabsTrigger value='my-classes'>Mis clases</TabsTrigger>
              </TabsList>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='sm'>
                    Filtrar clases
                    {selectedClassKeys.length > 0
                      ? ` (${selectedClassKeys.length})`
                      : ''}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-72'>
                  <DropdownMenuLabel>
                    Maximo 2 clases + Destripando Niveles siempre disponible
                  </DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={showAllClasses}
                    onCheckedChange={() => setSelectedClassKeys([])}
                  >
                    Todas las clases
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {classOptions.map((option) => {
                    const isSelected = selectedClassKeys.includes(
                      option.classKey,
                    )
                    const isSpecialClass =
                      option.classKey === SPECIAL_ALWAYS_ALLOWED_CLASS_KEY
                    const isDisabled =
                      !isSelected &&
                      !isSpecialClass &&
                      nonSpecialSelectedCount >= 2
                    const catalogEntry = getCalendarIcademyCatalogEntry(
                      option.classKey,
                    )
                    const flag = catalogEntry?.flag || '🌐'

                    return (
                      <DropdownMenuCheckboxItem
                        key={option.classKey}
                        checked={isSelected}
                        disabled={isDisabled}
                        onCheckedChange={() =>
                          handleToggleClass(option.classKey)
                        }
                      >
                        {flag} {option.className}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {canUseLocalTime && (
              <div className='flex items-center justify-end gap-2'>
                <Label
                  htmlFor='calendar-local-time-switch'
                  className='text-xs text-muted-foreground'
                >
                  Ver horario en mi zona ({localTimezone})
                </Label>
                <Switch
                  id='calendar-local-time-switch'
                  checked={showLocalTime}
                  onCheckedChange={setShowLocalTime}
                />
              </div>
            )}
          </CardHeader>

          <CardContent>
            <TabsContent value='calendar' className='mt-0 space-y-4'>
              {languageLegend.length > 0 && (
                <div className='flex flex-wrap gap-3'>
                  {languageLegend.map((languageCode) => {
                    const tone = LANGUAGE_TONES[languageCode] || DEFAULT_TONE
                    return (
                      <div
                        key={languageCode}
                        className='flex items-center gap-2 text-xs text-muted-foreground'
                      >
                        <span
                          className={cn(
                            'size-2.5 rounded-full',
                            tone.legendClassName,
                          )}
                        />
                        <span className='uppercase'>{languageCode}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {loading ? (
                <p className='text-sm text-muted-foreground'>
                  Cargando calendario...
                </p>
              ) : entries.length === 0 ? (
                <p className='text-sm text-muted-foreground'>{emptyMessage}</p>
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
                        const isWeekend = index % 7 >= 5
                        const dayEntries = entriesByDate.get(cell.dateKey) || []
                        const isOutOfMonth = !cell.inCurrentMonth
                        const isToday = cell.dateKey === todayKey

                        return (
                          <div
                            key={`${cell.dateKey}-${index}`}
                            className={cn(
                              'relative min-h-36 border-r border-b p-2 last:border-r-0',
                              isWeekend && 'bg-muted/25',
                              isOutOfMonth && 'bg-muted/40',
                            )}
                          >
                            {isToday && (
                              <Badge className='absolute top-1 right-1 h-auto px-1.5 py-0 text-[10px]'>
                                Hoy
                              </Badge>
                            )}

                            <>
                              <p
                                className={cn(
                                  'mb-2 text-sm font-semibold',
                                  isOutOfMonth && 'text-muted-foreground/70',
                                )}
                              >
                                {Number(cell.dateKey.slice(-2))}
                              </p>

                              <div className='flex flex-col gap-1'>
                                {dayEntries.map((entry) => {
                                  const catalogEntry =
                                    getCalendarIcademyCatalogEntry(
                                      entry.classKey,
                                    )
                                  const className =
                                    catalogEntry?.className || entry.className
                                  const languageCode =
                                    catalogEntry?.languageCode ||
                                    entry.languageCode
                                  const flag = catalogEntry?.flag || '🌐'
                                  const tone =
                                    LANGUAGE_TONES[languageCode] || DEFAULT_TONE
                                  const isDimmed =
                                    selectedClassKeys.length > 0 &&
                                    !selectedClassKeys.includes(entry.classKey)

                                  const content = (
                                    <div
                                      className={cn(
                                        'rounded-sm border border-border border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight',
                                        tone.rowClassName,
                                        isDimmed && 'opacity-25',
                                        isOutOfMonth &&
                                          'opacity-45 saturate-50',
                                        onEntryClick &&
                                          'cursor-pointer transition-colors hover:bg-accent/40',
                                      )}
                                    >
                                      <div className='grid grid-cols-[auto_1fr] items-center gap-1'>
                                        <span className='font-bold'>
                                          {getEntryTimeLabel(entry)}
                                        </span>
                                        <p className='truncate font-medium'>
                                          {flag} {className}
                                        </p>
                                      </div>
                                    </div>
                                  )

                                  if (!onEntryClick) {
                                    return <div key={entry.id}>{content}</div>
                                  }

                                  return (
                                    <button
                                      key={entry.id}
                                      type='button'
                                      className='w-full'
                                      onClick={() => onEntryClick(entry)}
                                    >
                                      {content}
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value='my-classes' className='mt-0 space-y-4'>
              {selectedClassKeys.length === 0 && (
                <p className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
                  No has seleccionado clases todavia. Usa el menu de filtros
                  para elegir tus clases favoritas.
                </p>
              )}

              {selectedClassKeys.length > 0 &&
                selectedSessions.length === 0 && (
                  <p className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
                    No hay clases programadas este mes para tu seleccion actual.
                  </p>
                )}

              {selectedClassKeys.length > 0 && selectedSessions.length > 0 && (
                <>
                  <div className='flex flex-col gap-1 text-sm text-muted-foreground'>
                    <p className='font-medium text-lg text-foreground'>{`🧑‍🏫 Tus clases para ${currentMonthLabel}`}</p>
                    {selectedClassSummaries.map((summary) => (
                      <p key={`summary-${summary.classKey}`}>
                        <span className='font-medium text-foreground'>
                          {summary.flag} {summary.className}
                        </span>{' '}
                        - {summary.label} · {summary.teachers}
                      </p>
                    ))}
                  </div>

                  <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
                    {selectedSessions.map((entry) => {
                      const catalogEntry = getCalendarIcademyCatalogEntry(
                        entry.classKey,
                      )
                      const className =
                        catalogEntry?.className || entry.className
                      const languageCode =
                        catalogEntry?.languageCode || entry.languageCode
                      const flag = catalogEntry?.flag || '🌐'
                      const tone = LANGUAGE_TONES[languageCode] || DEFAULT_TONE
                      const isTodaySession = isEntryToday(entry)
                      const sessionDateTime =
                        parseCalendarIcademySessionDateTime({
                          sessionDate: entry.sessionDate,
                          sessionTime: entry.sessionTime,
                        })
                      const minutesUntilSession = sessionDateTime
                        ? Math.floor(
                            (sessionDateTime.getTime() - nowTimestamp) / 60000,
                          )
                        : null
                      const showCountdown =
                        minutesUntilSession !== null &&
                        minutesUntilSession > 0 &&
                        minutesUntilSession <= 120
                      const canMuteCurrentEntry = canMuteEntry
                        ? canMuteEntry(entry)
                        : false
                      const isMuted = isEntryMuted ? isEntryMuted(entry) : false

                      return (
                        <div
                          key={`selected-${entry.id}`}
                          className={cn(
                            'rounded-lg border border-border border-l-4 bg-card p-3',
                            tone.rowClassName,
                            isMuted && 'opacity-70',
                          )}
                        >
                          <div className='mb-1'>
                            <div className='flex flex-wrap items-center gap-1.5'>
                              <Badge
                                variant='outline'
                                className={cn(
                                  'h-auto px-1.5 py-0 text-[10px] font-semibold uppercase',
                                  tone.badgeClassName,
                                )}
                              >
                                {flag} {className}
                              </Badge>
                              {isTodaySession && (
                                <Badge className='h-auto px-1.5 py-0 text-[10px]'>
                                  Hoy
                                </Badge>
                              )}
                              {showCountdown && (
                                <Badge
                                  variant='secondary'
                                  className='h-auto px-1.5 py-0 text-[10px]'
                                >
                                  En {minutesUntilSession} min
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className='text-xl font-bold leading-none'>
                            {getEntryDayLabel(entry)}
                          </p>
                          <p className='mt-1 text-base text-muted-foreground'>
                            {getEntryTimeLabel(entry)} · con {entry.teacher}
                          </p>
                          {canMuteCurrentEntry && onToggleEntryMute && (
                            <div className='mt-2'>
                              <Button
                                type='button'
                                size='sm'
                                variant={isMuted ? 'outline' : 'secondary'}
                                onClick={() => onToggleEntryMute(entry)}
                              >
                                {isMuted ? <Volume1 /> : <VolumeOff />}
                                {isMuted
                                  ? 'Cancelar silencio'
                                  : 'Silenciar sesion'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </section>
  )
}
