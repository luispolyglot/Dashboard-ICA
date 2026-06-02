import { supabase } from '@/lib/supabase'
import type { CalendarIcademySessionBlacklistItem } from '../types'

type CalendarIcademySessionBlacklistRow = {
  id: string
  user_id: string
  calendar_entry_id: string
  class_key: string
  created_at: string
  updated_at: string
}

const BLACKLIST_SELECT_FIELDS =
  'id, user_id, calendar_entry_id, class_key, created_at, updated_at'

export class CalendarIcademySessionBlacklistRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CalendarIcademySessionBlacklistRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

function mapItem(
  row: CalendarIcademySessionBlacklistRow,
): CalendarIcademySessionBlacklistItem {
  return {
    id: row.id,
    userId: row.user_id,
    calendarEntryId: row.calendar_entry_id,
    classKey: row.class_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) {
    throw new CalendarIcademySessionBlacklistRequestError(
      'Supabase no esta configurado.',
    )
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new CalendarIcademySessionBlacklistRequestError(
      'Necesitas iniciar sesión para gestionar sesiones silenciadas.',
      401,
    )
  }

  return user.id
}

export async function fetchCalendarIcademySessionBlacklist(): Promise<
  CalendarIcademySessionBlacklistItem[]
> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('users_calendar_icademy_session_blacklist')
    .select(BLACKLIST_SELECT_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new CalendarIcademySessionBlacklistRequestError(
      'No se pudo cargar la lista de sesiones silenciadas.',
      getErrorStatus(error),
    )
  }

  return (data || []).map((row) =>
    mapItem(row as CalendarIcademySessionBlacklistRow),
  )
}

export async function silenceCalendarIcademySession(input: {
  calendarEntryId: string
  classKey: string
}): Promise<CalendarIcademySessionBlacklistItem> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('users_calendar_icademy_session_blacklist')
    .upsert(
      {
        user_id: userId,
        calendar_entry_id: input.calendarEntryId,
        class_key: input.classKey,
      },
      { onConflict: 'user_id,calendar_entry_id' },
    )
    .select(BLACKLIST_SELECT_FIELDS)
    .single()

  if (error) {
    throw new CalendarIcademySessionBlacklistRequestError(
      'No se pudo silenciar esta sesión.',
      getErrorStatus(error),
    )
  }

  return mapItem(data as CalendarIcademySessionBlacklistRow)
}

export async function unsilenceCalendarIcademySession(
  calendarEntryId: string,
): Promise<void> {
  const userId = await getCurrentUserId()

  const { error } = await supabase!
    .from('users_calendar_icademy_session_blacklist')
    .delete()
    .eq('user_id', userId)
    .eq('calendar_entry_id', calendarEntryId)

  if (error) {
    throw new CalendarIcademySessionBlacklistRequestError(
      'No se pudo quitar el silencio de esta sesión.',
      getErrorStatus(error),
    )
  }
}
