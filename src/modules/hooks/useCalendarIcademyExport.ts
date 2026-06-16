import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarIcademyCatalogEntry } from '../constants/calendarIcademyCatalog'
import type { CalendarIcademyEntry } from '../types'
import {
  CALENDAR_ICADEMY_TIMEZONE,
  parseCalendarIcademySessionDateTime,
} from '../utils/calendarIcademyTime'

const DEFAULT_EVENT_DURATION_MINUTES = 60

type ExportTimeZoneMode = 'spain' | 'local'

type UseCalendarIcademyExportParams = {
  entries: CalendarIcademyEntry[]
  showLocalTime: boolean
  canUseLocalTime: boolean
  localTimezone?: string
  eventDurationMinutes?: number
  onShowLocalTimeChange?: (enabled: boolean) => void
}

type ExportSessionOption = {
  entryId: string
  className: string
  teacher: string
  sessionDate: string
  sessionTime: string
}

type UseCalendarIcademyExportResult = {
  sessionOptions: ExportSessionOption[]
  selectedEntryIds: string[]
  selectedEntries: CalendarIcademyEntry[]
  isTimeZoneModalOpen: boolean
  isSelectionModalOpen: boolean
  exportTimeZoneMode: ExportTimeZoneMode
  timeZoneChoiceUseLocal: boolean
  exportTimeZone: string
  allEntriesSelected: boolean
  exportButtonLabel: string
  canExport: boolean
  startExportFlow: () => void
  cancelTimeZoneStep: () => void
  confirmTimeZoneStep: (useLocalTime?: boolean) => void
  cancelSelectionStep: () => void
  toggleEntrySelection: (entryId: string) => void
  selectAllEntries: () => void
  clearSelectedEntries: () => void
  setTimeZoneChoiceUseLocal: (value: boolean) => void
  exportSelectedAsIcs: (filenamePrefix?: string) => {
    filename: string
    icsText: string
  } | null
}

type CalendarIcsEvent = {
  uid: string
  summary: string
  description: string
  startsAt: Date
  endsAt: Date
  timeZone: string
}

function sanitizeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function formatUtcDateTimeForIcs(date: Date): string {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const second = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hour}${minute}${second}Z`
}

function formatDateTimeInTimezoneForIcs(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '0000'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  const hour = parts.find((part) => part.type === 'hour')?.value || '00'
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  const second = parts.find((part) => part.type === 'second')?.value || '00'

  return `${year}${month}${day}T${hour}${minute}${second}`
}

function compareEntries(a: CalendarIcademyEntry, b: CalendarIcademyEntry): number {
  const byDate = a.sessionDate.localeCompare(b.sessionDate)
  if (byDate !== 0) return byDate

  const byTime = a.sessionTime.localeCompare(b.sessionTime)
  if (byTime !== 0) return byTime

  return a.id.localeCompare(b.id)
}

function downloadIcsFile(params: { filename: string; icsText: string }): void {
  if (typeof document === 'undefined') return

  const blob = new Blob([params.icsText], {
    type: 'text/calendar;charset=utf-8',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = params.filename
  link.click()
  URL.revokeObjectURL(url)
}

export function buildCalendarIcademyIcs(events: CalendarIcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//ICADEMY//Calendar Export//ES',
  ]

  if (events.length > 0) {
    lines.push(`X-WR-TIMEZONE:${events[0].timeZone}`)
  }

  const dtStamp = formatUtcDateTimeForIcs(new Date())

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${escapeIcsText(event.uid)}`)
    lines.push(`DTSTAMP:${dtStamp}`)
    lines.push(
      `DTSTART;TZID=${event.timeZone}:${formatDateTimeInTimezoneForIcs(event.startsAt, event.timeZone)}`,
    )
    lines.push(
      `DTEND;TZID=${event.timeZone}:${formatDateTimeInTimezoneForIcs(event.endsAt, event.timeZone)}`,
    )
    lines.push(`SUMMARY:${escapeIcsText(event.summary)}`)
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

export function useCalendarIcademyExport({
  entries,
  showLocalTime,
  canUseLocalTime,
  localTimezone,
  eventDurationMinutes = DEFAULT_EVENT_DURATION_MINUTES,
  onShowLocalTimeChange,
}: UseCalendarIcademyExportParams): UseCalendarIcademyExportResult {
  const [isTimeZoneModalOpen, setIsTimeZoneModalOpen] = useState(false)
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([])
  const [timeZoneChoiceUseLocal, setTimeZoneChoiceUseLocalState] =
    useState(showLocalTime)
  const [exportTimeZoneMode, setExportTimeZoneMode] =
    useState<ExportTimeZoneMode>(
      canUseLocalTime && showLocalTime ? 'local' : 'spain',
    )

  useEffect(() => {
    setTimeZoneChoiceUseLocalState(showLocalTime)
  }, [showLocalTime])

  const sortedEntries = useMemo(
    () => entries.slice().sort(compareEntries),
    [entries],
  )

  const allEntryIds = useMemo(
    () => sortedEntries.map((entry) => entry.id),
    [sortedEntries],
  )

  const sessionOptions = useMemo<ExportSessionOption[]>(() => {
    return sortedEntries.map((entry) => {
      const catalogEntry = getCalendarIcademyCatalogEntry(entry.classKey)

      return {
        entryId: entry.id,
        className: catalogEntry?.className || entry.className,
        teacher: entry.teacher,
        sessionDate: entry.sessionDate,
        sessionTime: entry.sessionTime,
      }
    })
  }, [sortedEntries])

  useEffect(() => {
    setSelectedEntryIds((prev) => prev.filter((entryId) => allEntryIds.includes(entryId)))
  }, [allEntryIds])

  const selectedEntries = useMemo(() => {
    if (selectedEntryIds.length === 0) return []
    const selectedIdSet = new Set(selectedEntryIds)
    return sortedEntries.filter((entry) => selectedIdSet.has(entry.id))
  }, [selectedEntryIds, sortedEntries])

  const allEntriesSelected =
    sessionOptions.length > 0 && selectedEntryIds.length === sessionOptions.length
  const exportButtonLabel = allEntriesSelected
    ? 'Exportar todas'
    : 'Exportar seleccionadas'
  const canExport = selectedEntries.length > 0
  const exportTimeZone =
    exportTimeZoneMode === 'local' && canUseLocalTime && localTimezone
      ? localTimezone
      : CALENDAR_ICADEMY_TIMEZONE

  const openSelectionStep = useCallback(() => {
    setSelectedEntryIds(allEntryIds)
    setIsSelectionModalOpen(true)
  }, [allEntryIds])

  const startExportFlow = useCallback(() => {
    if (allEntryIds.length === 0) return

    if (canUseLocalTime) {
      setTimeZoneChoiceUseLocalState(showLocalTime)
      setIsTimeZoneModalOpen(true)
      return
    }

    setExportTimeZoneMode('spain')
    openSelectionStep()
  }, [allEntryIds.length, canUseLocalTime, openSelectionStep, showLocalTime])

  const cancelTimeZoneStep = useCallback(() => {
    setIsTimeZoneModalOpen(false)
  }, [])

  const confirmTimeZoneStep = useCallback(
    (useLocalTime = timeZoneChoiceUseLocal) => {
      const shouldUseLocal = useLocalTime && canUseLocalTime
      setExportTimeZoneMode(shouldUseLocal ? 'local' : 'spain')
      setTimeZoneChoiceUseLocalState(shouldUseLocal)

      if (onShowLocalTimeChange && showLocalTime !== shouldUseLocal) {
        onShowLocalTimeChange(shouldUseLocal)
      }

      setIsTimeZoneModalOpen(false)
      openSelectionStep()
    },
    [
      canUseLocalTime,
      onShowLocalTimeChange,
      openSelectionStep,
      showLocalTime,
      timeZoneChoiceUseLocal,
    ],
  )

  const cancelSelectionStep = useCallback(() => {
    setIsSelectionModalOpen(false)
  }, [])

  const toggleEntrySelection = useCallback((entryId: string) => {
    setSelectedEntryIds((prev) => {
      if (prev.includes(entryId)) {
        return prev.filter((item) => item !== entryId)
      }
      return [...prev, entryId]
    })
  }, [])

  const selectAllEntries = useCallback(() => {
    setSelectedEntryIds(allEntryIds)
  }, [allEntryIds])

  const clearSelectedEntries = useCallback(() => {
    setSelectedEntryIds([])
  }, [])

  const setTimeZoneChoiceUseLocal = useCallback(
    (value: boolean) => {
      setTimeZoneChoiceUseLocalState(value && canUseLocalTime)
    },
    [canUseLocalTime],
  )

  const exportSelectedAsIcs = useCallback(
    (filenamePrefix = 'icademy-clases') => {
      if (selectedEntries.length === 0) return null

      const now = new Date()
      const normalizedPrefix =
        sanitizeFilenamePart(filenamePrefix) || 'icademy-clases'
      const stamp = formatUtcDateTimeForIcs(now).slice(0, 8)
      const filename = `${normalizedPrefix}-${stamp}.ics`

      const events = selectedEntries
        .map((entry) => {
          const startsAt = parseCalendarIcademySessionDateTime({
            sessionDate: entry.sessionDate,
            sessionTime: entry.sessionTime,
          })
          if (!startsAt) return null

          const endsAt = new Date(
            startsAt.getTime() + eventDurationMinutes * 60 * 1000,
          )

          const catalogEntry = getCalendarIcademyCatalogEntry(entry.classKey)
          const className = catalogEntry?.className || entry.className
          const teacher = entry.teacher || 'ICADEMY'
          const groupName = entry.groupName ? `Grupo: ${entry.groupName}` : null
          const note = entry.note ? `Nota: ${entry.note}` : null
          const descriptionLines = [
            `Profesor: ${teacher}`,
            groupName,
            note,
          ].filter((line): line is string => Boolean(line))

          return {
            uid: `${entry.id}@icademy-dashboard`,
            summary: `ICADEMY · ${className}`,
            description: descriptionLines.join('\n'),
            startsAt,
            endsAt,
            timeZone: exportTimeZone,
          } satisfies CalendarIcsEvent
        })
        .filter((event): event is CalendarIcsEvent => Boolean(event))

      if (events.length === 0) return null

      const icsText = buildCalendarIcademyIcs(events)
      downloadIcsFile({ filename, icsText })

      return { filename, icsText }
    },
    [eventDurationMinutes, exportTimeZone, selectedEntries],
  )

  return {
    sessionOptions,
    selectedEntryIds,
    selectedEntries,
    isTimeZoneModalOpen,
    isSelectionModalOpen,
    exportTimeZoneMode,
    timeZoneChoiceUseLocal,
    exportTimeZone,
    allEntriesSelected,
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
  }
}
