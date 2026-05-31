import { supabase } from '@/lib/supabase'
import type {
  CalendarIcademyPreference,
  CalendarIcademyPreferenceInput,
} from '../types'

type CalendarIcademyPreferenceRow = {
  id: string
  user_id: string
  class_key: string
  language_code: string
  notifications_enabled: boolean
  minutes_before: number
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  last_notified_for_session_id: string | null
  last_notified_at: string | null
  created_at: string
  updated_at: string
}

const PREFERENCE_SELECT_FIELDS =
  'id, user_id, class_key, language_code, notifications_enabled, minutes_before, quiet_hours_start, quiet_hours_end, last_notified_for_session_id, last_notified_at, created_at, updated_at'

export class CalendarIcademyPreferenceRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CalendarIcademyPreferenceRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

function mapPreference(row: CalendarIcademyPreferenceRow): CalendarIcademyPreference {
  return {
    id: row.id,
    userId: row.user_id,
    classKey: row.class_key,
    languageCode: row.language_code,
    notificationsEnabled: row.notifications_enabled,
    minutesBefore: Number(row.minutes_before ?? 30),
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    lastNotifiedForSessionId: row.last_notified_for_session_id,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) {
    throw new CalendarIcademyPreferenceRequestError('Supabase no esta configurado.')
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new CalendarIcademyPreferenceRequestError(
      'Necesitas iniciar sesion para gestionar notificaciones.',
      401,
    )
  }

  return user.id
}

function normalizePreferenceInput(
  userId: string,
  input: CalendarIcademyPreferenceInput,
) {
  const allowedMinutes = [10, 15, 30, 60, 120]
  const normalizedMinutes = allowedMinutes.includes(input.minutesBefore)
    ? input.minutesBefore
    : 30

  return {
    user_id: userId,
    class_key: input.classKey.trim(),
    language_code: input.languageCode.trim().toLowerCase(),
    notifications_enabled: Boolean(input.notificationsEnabled),
    minutes_before: normalizedMinutes,
    quiet_hours_start: input.quietHoursStart || null,
    quiet_hours_end: input.quietHoursEnd || null,
  }
}

export async function fetchCalendarIcademyPreferences(): Promise<
  CalendarIcademyPreference[]
> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('users_calendar_icademy')
    .select(PREFERENCE_SELECT_FIELDS)
    .eq('user_id', userId)
    .order('class_key', { ascending: true })

  if (error) {
    throw new CalendarIcademyPreferenceRequestError(
      'No se pudieron cargar tus preferencias del calendario.',
      getErrorStatus(error),
    )
  }

  return (data || []).map((row) => mapPreference(row as CalendarIcademyPreferenceRow))
}

export async function upsertCalendarIcademyPreference(
  input: CalendarIcademyPreferenceInput,
): Promise<CalendarIcademyPreference> {
  const userId = await getCurrentUserId()
  const payload = normalizePreferenceInput(userId, input)

  const { data, error } = await supabase!
    .from('users_calendar_icademy')
    .upsert(payload, { onConflict: 'user_id,class_key' })
    .select(PREFERENCE_SELECT_FIELDS)
    .single()

  if (error) {
    if (typeof error.message === 'string' && error.message.includes('CALENDAR_REMINDERS_LIMIT_REACHED')) {
      throw new CalendarIcademyPreferenceRequestError(
        'Puedes tener maximo 2 recordatorios activos al mismo tiempo.',
      )
    }
    throw new CalendarIcademyPreferenceRequestError(
      'No se pudo guardar la preferencia del calendario.',
      getErrorStatus(error),
    )
  }

  return mapPreference(data as CalendarIcademyPreferenceRow)
}

export async function markCalendarIcademyNotificationShown(input: {
  classKey: string
  sessionId: string
}): Promise<void> {
  const userId = await getCurrentUserId()

  const { error } = await supabase!
    .from('users_calendar_icademy')
    .update({
      last_notified_for_session_id: input.sessionId,
      last_notified_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('class_key', input.classKey)

  if (error) {
    throw new CalendarIcademyPreferenceRequestError(
      'No se pudo registrar el aviso de notificacion.',
      getErrorStatus(error),
    )
  }
}
