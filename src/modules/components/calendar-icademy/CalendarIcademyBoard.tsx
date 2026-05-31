import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCalendarIcademyCatalogEntry } from '../../constants/calendarIcademyCatalog'
import { cn } from '@/lib/utils'
import type { CalendarIcademyEntry } from '../../types'

type CalendarIcademyBoardProps = {
  title: string
  description: string
  entries: CalendarIcademyEntry[]
  loading: boolean
  error: string | null
  emptyMessage: string
  topActions?: ReactNode
  onEntryClick?: (entry: CalendarIcademyEntry) => void
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

function buildCalendarCells(monthKey: string): Array<string | null> {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return []

  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: Array<string | null> = []
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, '0')}`)
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
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
  topActions,
  onEntryClick,
}: CalendarIcademyBoardProps) {
  const [selectedClassKeys, setSelectedClassKeys] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')

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
    setSelectedClassKeys((prev) =>
      prev.filter((classKey) =>
        classOptions.some((item) => item.classKey === classKey),
      ),
    )
  }, [classOptions])

  useEffect(() => {
    if (availableMonths.length === 0) {
      setSelectedMonth('')
      return
    }

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const fallbackMonth =
      availableMonths.find((month) => month === currentMonth) ||
      availableMonths[availableMonths.length - 1]

    setSelectedMonth((prev) => {
      if (prev && availableMonths.includes(prev)) return prev
      return fallbackMonth
    })
  }, [availableMonths])

  const entriesForMonth = useMemo(() => {
    if (!selectedMonth) return []
    return entries.filter(
      (entry) => getMonthKey(entry.sessionDate) === selectedMonth,
    )
  }, [entries, selectedMonth])

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarIcademyEntry[]>()

    for (const entry of entriesForMonth) {
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
  }, [entriesForMonth])

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
        const weekdayLabel = formatSessionDayLabel(
          firstSession.sessionDate,
        ).split(' ')[0]
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
          label: `${weekdayLabel} ${formatSessionTimeLabel(firstSession.sessionTime)}`,
          teachers,
          languageCode,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  }, [entriesForMonth, selectedClassKeys])

  const languageLegend = useMemo(() => {
    const byLanguage = new Set<string>()
    for (const item of classOptions) {
      byLanguage.add(item.languageCode)
    }

    return Array.from(byLanguage.values()).sort((a, b) => a.localeCompare(b))
  }, [classOptions])

  const calendarCells = useMemo(() => {
    if (!selectedMonth) return []
    return buildCalendarCells(selectedMonth)
  }, [selectedMonth])

  const handleToggleClass = (classKey: string) => {
    setSelectedClassKeys((prev) => {
      if (prev.includes(classKey)) {
        return prev.filter((item) => item !== classKey)
      }

      if (prev.length >= 2) {
        return [prev[1], classKey]
      }

      return [...prev, classKey]
    })
  }

  const showAllClasses = selectedClassKeys.length === 0
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
        <CardHeader className='gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <CardTitle>Calendario mensual - {currentMonthLabel}</CardTitle>
          </div>

          <div className='flex flex-col gap-2'>
            <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
              Filtra por clase (maximo 2)
            </p>
            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                aria-pressed={showAllClasses}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
                  showAllClasses
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-foreground hover:bg-accent/50',
                )}
                onClick={() => setSelectedClassKeys([])}
              >
                Todas las clases
              </button>

              {classOptions.map((option) => {
                const tone = LANGUAGE_TONES[option.languageCode] || DEFAULT_TONE
                const isSelected = selectedClassKeys.includes(option.classKey)
                const catalogEntry = getCalendarIcademyCatalogEntry(
                  option.classKey,
                )
                const flag = catalogEntry?.flag || '🌐'

                return (
                  <button
                    key={option.classKey}
                    type='button'
                    aria-pressed={isSelected}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
                      isSelected
                        ? tone.activeFilterClassName
                        : 'border-border bg-card text-foreground hover:bg-accent/50',
                    )}
                    onClick={() => handleToggleClass(option.classKey)}
                  >
                    <span>{flag}</span>
                    {option.className}
                  </button>
                )
              })}
            </div>
          </div>

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
        </CardHeader>

        <CardContent>
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
                  {calendarCells.map((dateKey, index) => {
                    const isWeekend = index % 7 >= 5
                    const dayEntries = dateKey
                      ? entriesByDate.get(dateKey) || []
                      : []

                    return (
                      <div
                        key={`${dateKey || 'empty'}-${index}`}
                        className={cn(
                          'min-h-36 border-r border-b p-2 last:border-r-0',
                          isWeekend && 'bg-muted/25',
                        )}
                      >
                        {dateKey ? (
                          <>
                            <p className='mb-2 text-sm font-semibold'>
                              {Number(dateKey.slice(-2))}
                            </p>

                            <div className='flex flex-col gap-1'>
                              {dayEntries.map((entry) => {
                                const catalogEntry =
                                  getCalendarIcademyCatalogEntry(entry.classKey)
                                const className =
                                  catalogEntry?.className || entry.className
                                const languageCode =
                                  catalogEntry?.languageCode ||
                                  entry.languageCode
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
                                      onEntryClick &&
                                        'cursor-pointer transition-colors hover:bg-accent/40',
                                    )}
                                  >
                                    <div className='grid grid-cols-[auto_1fr_auto] items-center gap-1'>
                                      <span className='font-bold'>
                                        {entry.sessionTime.replace(':00', 'h')}
                                      </span>
                                      <p className='truncate font-medium'>
                                        {className}
                                      </p>
                                      <p className='truncate text-[10px] text-muted-foreground'>
                                        {entry.teacher}
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
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedClassKeys.length > 0 && selectedSessions.length > 0 && (
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>{`🧑‍🏫 Tus clases para ${currentMonthLabel}`}</CardTitle>
            <div className='flex flex-col gap-1 text-sm text-muted-foreground'>
              {selectedClassSummaries.map((summary) => (
                <p key={`summary-${summary.classKey}`}>
                  <span className='font-medium text-foreground'>
                    {summary.flag} {summary.className}
                  </span>{' '}
                  - {summary.label} · {summary.teachers}
                </p>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
              {selectedSessions.map((entry) => {
                const catalogEntry = getCalendarIcademyCatalogEntry(
                  entry.classKey,
                )
                const className = catalogEntry?.className || entry.className
                const languageCode =
                  catalogEntry?.languageCode || entry.languageCode
                const flag = catalogEntry?.flag || '🌐'
                const tone = LANGUAGE_TONES[languageCode] || DEFAULT_TONE

                return (
                  <div
                    key={`selected-${entry.id}`}
                    className={cn(
                      'rounded-lg border border-border border-l-4 bg-card p-3',
                      tone.rowClassName,
                    )}
                  >
                    <div className='mb-1'>
                      <Badge
                        variant='outline'
                        className={cn(
                          'h-auto px-1.5 py-0 text-[10px] font-semibold uppercase',
                          tone.badgeClassName,
                        )}
                      >
                        {flag} {className}
                      </Badge>
                    </div>
                    <p className='text-2xl font-bold leading-none'>
                      {formatSessionDayLabel(entry.sessionDate)}
                    </p>
                    <p className='mt-1 text-base text-muted-foreground'>
                      {formatSessionTimeLabel(entry.sessionTime)} · con{' '}
                      {entry.teacher}
                    </p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
