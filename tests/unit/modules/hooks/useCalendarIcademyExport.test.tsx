import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarIcademyEntry } from '@/modules/types'
import {
  buildCalendarIcademyIcs,
  useCalendarIcademyExport,
} from '@/modules/hooks/useCalendarIcademyExport'

function buildEntry(partial: Partial<CalendarIcademyEntry>): CalendarIcademyEntry {
  return {
    id: partial.id || 'entry-1',
    classKey: partial.classKey || 'class-alpha',
    className: partial.className || 'Clase Alpha',
    languageCode: partial.languageCode || 'en',
    sessionDate: partial.sessionDate || '2026-06-20',
    sessionTime: partial.sessionTime || '18:00',
    teacherId: partial.teacherId ?? null,
    teacher: partial.teacher || 'Teacher A',
    groupName: partial.groupName ?? null,
    note: partial.note ?? null,
    createdAt: partial.createdAt || '2026-06-01T00:00:00.000Z',
    updatedAt: partial.updatedAt || '2026-06-01T00:00:00.000Z',
  }
}

describe('useCalendarIcademyExport', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:unit-test'),
      writable: true,
      configurable: true,
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      return
    })
  })

  it('builds a valid VCALENDAR payload', () => {
    const icsText = buildCalendarIcademyIcs([
      {
        uid: 'event-1@icademy-dashboard',
        summary: 'ICADEMY · Clase Alpha',
        description: 'Profesor: Teacher A',
        startsAt: new Date('2026-06-20T16:00:00.000Z'),
        endsAt: new Date('2026-06-20T17:00:00.000Z'),
        timeZone: 'Europe/Madrid',
      },
    ])

    expect(icsText).toContain('BEGIN:VCALENDAR')
    expect(icsText).toContain('BEGIN:VEVENT')
    expect(icsText).toContain('DTSTART;TZID=Europe/Madrid:')
    expect(icsText).toContain('SUMMARY:ICADEMY · Clase Alpha')
    expect(icsText).toContain('END:VCALENDAR')
  })

  it('opens timezone step first and syncs preference from the flow', () => {
    const onShowLocalTimeChange = vi.fn()
    const entries = [buildEntry({ id: 'entry-1' })]

    const { result } = renderHook(() =>
      useCalendarIcademyExport({
        entries,
        showLocalTime: false,
        canUseLocalTime: true,
        localTimezone: 'America/Argentina/Buenos_Aires',
        onShowLocalTimeChange,
      }),
    )

    act(() => {
      result.current.startExportFlow()
    })

    expect(result.current.isTimeZoneModalOpen).toBe(true)
    expect(result.current.isSelectionModalOpen).toBe(false)

    act(() => {
      result.current.confirmTimeZoneStep(true)
    })

    expect(onShowLocalTimeChange).toHaveBeenCalledWith(true)
    expect(result.current.exportTimeZoneMode).toBe('local')
    expect(result.current.isTimeZoneModalOpen).toBe(false)
    expect(result.current.isSelectionModalOpen).toBe(true)
  })

  it('switches export CTA label when some classes are unchecked', () => {
    const entries = [
      buildEntry({ id: 'entry-1', classKey: 'class-alpha', className: 'Clase Alpha' }),
      buildEntry({ id: 'entry-2', classKey: 'class-beta', className: 'Clase Beta' }),
    ]

    const { result } = renderHook(() =>
      useCalendarIcademyExport({
        entries,
        showLocalTime: false,
        canUseLocalTime: false,
      }),
    )

    act(() => {
      result.current.startExportFlow()
    })

    expect(result.current.exportButtonLabel).toBe('Exportar todas')
    expect(result.current.selectedEntryIds).toHaveLength(2)

    act(() => {
      result.current.toggleEntrySelection('entry-2')
    })

    expect(result.current.exportButtonLabel).toBe('Exportar seleccionadas')
    expect(result.current.selectedEntryIds).toEqual(['entry-1'])
  })

  it('exports only selected sessions into the ICS file', () => {
    const entries = [
      buildEntry({
        id: 'entry-1',
        classKey: 'class-alpha',
        className: 'Clase Alpha',
        teacher: 'Teacher A',
      }),
      buildEntry({
        id: 'entry-2',
        classKey: 'class-alpha',
        className: 'Clase Alpha',
        sessionDate: '2026-06-21',
        sessionTime: '19:00',
        teacher: 'Teacher B',
      }),
    ]

    const { result } = renderHook(() =>
      useCalendarIcademyExport({
        entries,
        showLocalTime: false,
        canUseLocalTime: false,
      }),
    )

    act(() => {
      result.current.startExportFlow()
      result.current.toggleEntrySelection('entry-2')
    })

    const exported = result.current.exportSelectedAsIcs('mis-clases')

    expect(exported).not.toBeNull()
    expect(exported?.filename).toMatch(/^mis-clases-\d{8}\.ics$/)
    expect(exported?.icsText).toContain('BEGIN:VCALENDAR')
    expect(exported?.icsText).toContain('SUMMARY:ICADEMY · Clase Alpha')
    expect(exported?.icsText).toContain('Profesor: Teacher A')
    expect(exported?.icsText).not.toContain('Profesor: Teacher B')
    expect(exported?.icsText).toContain('DTSTART;TZID=Europe/Madrid:')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })
})
