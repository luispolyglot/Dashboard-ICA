import { supabase } from '@/lib/supabase'
import type {
  CalendarIcademyEntry,
  CalendarIcademyEntryInput,
} from '../types'

type CalendarIcademyRow = {
  id: string
  class_key: string
  class_name: string
  language_code: string
  session_date: string
  session_time: string
  teacher: string
  group_name: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export class CalendarIcademyRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CalendarIcademyRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

function normalizeTimeForDb(value: string): string {
  const clean = value.trim()
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`
  return clean
}

function normalizeTimeForUi(value: string): string {
  const match = value.match(/^(\d{2}:\d{2})/)
  return match ? match[1] : value
}

function toCalendarIcademyEntry(row: CalendarIcademyRow): CalendarIcademyEntry {
  return {
    id: row.id,
    classKey: row.class_key,
    className: row.class_name,
    languageCode: row.language_code,
    sessionDate: row.session_date,
    sessionTime: normalizeTimeForUi(row.session_time),
    teacher: row.teacher,
    groupName: row.group_name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCalendarIcademyPayload(input: CalendarIcademyEntryInput) {
  return {
    class_key: input.classKey.trim(),
    class_name: input.className.trim(),
    language_code: input.languageCode.trim().toLowerCase(),
    session_date: input.sessionDate,
    session_time: normalizeTimeForDb(input.sessionTime),
    teacher: input.teacher.trim(),
    group_name: input.groupName?.trim() || null,
    note: input.note?.trim() || null,
  }
}

const CALENDAR_SELECT_FIELDS =
  'id, class_key, class_name, language_code, session_date, session_time, teacher, group_name, note, created_at, updated_at'

export async function fetchCalendarIcademyEntries(): Promise<CalendarIcademyEntry[]> {
  if (!supabase) {
    throw new CalendarIcademyRequestError('Supabase no esta configurado.')
  }

  const { data, error } = await supabase
    .from('calendar_icademy')
    .select(CALENDAR_SELECT_FIELDS)
    .order('session_date', { ascending: true })
    .order('session_time', { ascending: true })
    .order('class_name', { ascending: true })

  if (error) {
    throw new CalendarIcademyRequestError(
      'No se pudo cargar el calendario de clases.',
      getErrorStatus(error),
    )
  }

  return (data || []).map((row) => toCalendarIcademyEntry(row as CalendarIcademyRow))
}

export async function createCalendarIcademyEntry(
  input: CalendarIcademyEntryInput,
): Promise<CalendarIcademyEntry> {
  if (!supabase) {
    throw new CalendarIcademyRequestError('Supabase no esta configurado.')
  }

  const { data, error } = await supabase
    .from('calendar_icademy')
    .insert(toCalendarIcademyPayload(input))
    .select(CALENDAR_SELECT_FIELDS)
    .single()

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new CalendarIcademyRequestError(
        'No tienes permisos para crear clases en este calendario.',
        403,
      )
    }
    throw new CalendarIcademyRequestError(
      'No se pudo crear la clase del calendario.',
      status,
    )
  }

  return toCalendarIcademyEntry(data as CalendarIcademyRow)
}

export async function updateCalendarIcademyEntry(
  entryId: string,
  input: CalendarIcademyEntryInput,
): Promise<CalendarIcademyEntry> {
  if (!supabase) {
    throw new CalendarIcademyRequestError('Supabase no esta configurado.')
  }

  const { data, error } = await supabase
    .from('calendar_icademy')
    .update(toCalendarIcademyPayload(input))
    .eq('id', entryId)
    .select(CALENDAR_SELECT_FIELDS)
    .single()

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new CalendarIcademyRequestError(
        'No tienes permisos para editar clases en este calendario.',
        403,
      )
    }
    throw new CalendarIcademyRequestError(
      'No se pudo actualizar la clase del calendario.',
      status,
    )
  }

  return toCalendarIcademyEntry(data as CalendarIcademyRow)
}

export async function deleteCalendarIcademyEntry(entryId: string): Promise<void> {
  if (!supabase) {
    throw new CalendarIcademyRequestError('Supabase no esta configurado.')
  }

  const { error } = await supabase
    .from('calendar_icademy')
    .delete()
    .eq('id', entryId)

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new CalendarIcademyRequestError(
        'No tienes permisos para eliminar clases en este calendario.',
        403,
      )
    }
    throw new CalendarIcademyRequestError(
      'No se pudo eliminar la clase del calendario.',
      status,
    )
  }
}
