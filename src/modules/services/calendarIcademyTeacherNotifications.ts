import { supabase } from '@/lib/supabase'
import type {
  CalendarIcademyTeacherNotificationPreference,
  CalendarIcademyTeacherNotificationPreferenceInput,
} from '../types'

type TeacherNotificationPreferenceRow = {
  user_id: string
  notifications_enabled: boolean
  minutes_before: number
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  last_notified_for_session_id: string | null
  last_notified_at: string | null
  created_at: string
  updated_at: string
}

const SELECT_FIELDS =
  'user_id, notifications_enabled, minutes_before, quiet_hours_start, quiet_hours_end, last_notified_for_session_id, last_notified_at, created_at, updated_at'

const ALLOWED_MINUTES = [10, 20, 30, 60, 120]

export class CalendarIcademyTeacherNotificationsRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CalendarIcademyTeacherNotificationsRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) {
    throw new CalendarIcademyTeacherNotificationsRequestError(
      'Supabase no esta configurado.',
    )
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new CalendarIcademyTeacherNotificationsRequestError(
      'Necesitas iniciar sesion para configurar notificaciones.',
      401,
    )
  }

  return user.id
}

function mapRow(
  row: TeacherNotificationPreferenceRow,
): CalendarIcademyTeacherNotificationPreference {
  return {
    userId: row.user_id,
    notificationsEnabled: Boolean(row.notifications_enabled),
    minutesBefore: Number(row.minutes_before ?? 30),
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    lastNotifiedForSessionId: row.last_notified_for_session_id,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function getDefaultPreference(
  userId: string,
): CalendarIcademyTeacherNotificationPreference {
  return {
    userId,
    notificationsEnabled: false,
    minutesBefore: 30,
    quietHoursStart: null,
    quietHoursEnd: null,
    lastNotifiedForSessionId: null,
    lastNotifiedAt: null,
    createdAt: null,
    updatedAt: null,
  }
}

function normalizeMinutesBefore(value: number): number {
  return ALLOWED_MINUTES.includes(value) ? value : 30
}

async function checkCurrentUserIsTeacher(userId: string): Promise<boolean> {
  const { data, error } = await supabase!
    .from('icademy_teachers')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new CalendarIcademyTeacherNotificationsRequestError(
      'No se pudo validar si eres profesor.',
      getErrorStatus(error),
    )
  }

  return Boolean(data?.user_id)
}

export async function fetchMyCalendarIcademyTeacherNotificationPreference(): Promise<CalendarIcademyTeacherNotificationPreference | null> {
  const userId = await getCurrentUserId()
  const isTeacher = await checkCurrentUserIsTeacher(userId)

  if (!isTeacher) return null

  const { data, error } = await supabase!
    .from('users_calendar_icademy_teacher_notifications')
    .select(SELECT_FIELDS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new CalendarIcademyTeacherNotificationsRequestError(
      'No se pudieron cargar tus preferencias como profesor.',
      getErrorStatus(error),
    )
  }

  if (!data) return getDefaultPreference(userId)

  return mapRow(data as TeacherNotificationPreferenceRow)
}

export async function upsertMyCalendarIcademyTeacherNotificationPreference(
  input: CalendarIcademyTeacherNotificationPreferenceInput,
): Promise<CalendarIcademyTeacherNotificationPreference> {
  const userId = await getCurrentUserId()
  const isTeacher = await checkCurrentUserIsTeacher(userId)

  if (!isTeacher) {
    throw new CalendarIcademyTeacherNotificationsRequestError(
      'Solo los profesores pueden configurar este tipo de recordatorio.',
      403,
    )
  }

  const { data, error } = await supabase!
    .from('users_calendar_icademy_teacher_notifications')
    .upsert(
      {
        user_id: userId,
        notifications_enabled: Boolean(input.notificationsEnabled),
        minutes_before: normalizeMinutesBefore(input.minutesBefore),
        quiet_hours_start: input.quietHoursStart || null,
        quiet_hours_end: input.quietHoursEnd || null,
      },
      { onConflict: 'user_id' },
    )
    .select(SELECT_FIELDS)
    .single()

  if (error || !data) {
    throw new CalendarIcademyTeacherNotificationsRequestError(
      'No se pudieron guardar tus preferencias como profesor.',
      getErrorStatus(error),
    )
  }

  return mapRow(data as TeacherNotificationPreferenceRow)
}
