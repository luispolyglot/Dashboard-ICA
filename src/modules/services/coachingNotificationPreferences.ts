import { supabase } from '@/lib/supabase'
import type {
  CoachingNotificationPreference,
  CoachingNotificationPreferenceInput,
} from '../types'

type CoachingNotificationPreferenceRow = {
  user_id: string
  master_note_closed_enabled: boolean
  active_session_enabled: boolean
  created_at: string
  updated_at: string
}

const SELECT_FIELDS =
  'user_id, master_note_closed_enabled, active_session_enabled, created_at, updated_at'

export class CoachingNotificationPreferencesRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CoachingNotificationPreferencesRequestError'
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
    throw new CoachingNotificationPreferencesRequestError(
      'Supabase no está configurado.',
    )
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new CoachingNotificationPreferencesRequestError(
      'Necesitas iniciar sesión para configurar notificaciones.',
      401,
    )
  }

  return user.id
}

function mapRow(
  row: CoachingNotificationPreferenceRow,
): CoachingNotificationPreference {
  return {
    userId: row.user_id,
    masterNoteClosedEnabled: Boolean(row.master_note_closed_enabled),
    activeSessionEnabled: Boolean(row.active_session_enabled),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function getDefaultPreference(userId: string): CoachingNotificationPreference {
  return {
    userId,
    masterNoteClosedEnabled: true,
    activeSessionEnabled: true,
    createdAt: null,
    updatedAt: null,
  }
}

export async function fetchMyCoachingNotificationPreference(): Promise<CoachingNotificationPreference> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('user_coaching_notification_preferences')
    .select(SELECT_FIELDS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new CoachingNotificationPreferencesRequestError(
      'No se pudieron cargar tus preferencias de coaching.',
      getErrorStatus(error),
    )
  }

  if (!data) return getDefaultPreference(userId)

  return mapRow(data as CoachingNotificationPreferenceRow)
}

export async function upsertMyCoachingNotificationPreference(
  input: CoachingNotificationPreferenceInput,
): Promise<CoachingNotificationPreference> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('user_coaching_notification_preferences')
    .upsert(
      {
        user_id: userId,
        master_note_closed_enabled: Boolean(input.masterNoteClosedEnabled),
        active_session_enabled: Boolean(input.activeSessionEnabled),
      },
      { onConflict: 'user_id' },
    )
    .select(SELECT_FIELDS)
    .single()

  if (error || !data) {
    throw new CoachingNotificationPreferencesRequestError(
      'No se pudieron guardar tus preferencias de coaching.',
      getErrorStatus(error),
    )
  }

  return mapRow(data as CoachingNotificationPreferenceRow)
}
