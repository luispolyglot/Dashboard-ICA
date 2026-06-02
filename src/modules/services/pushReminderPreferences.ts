import { supabase } from '@/lib/supabase'
import type {
  PushReminderPreferences,
  PushReminderPreferencesInput,
} from '../types'

type PushReminderPreferencesRow = {
  user_id: string
  ica_streak_enabled: boolean
  ica_streak_hour: number
  flashcards_streak_enabled: boolean
  flashcards_streak_hour: number
  habit_loss_enabled: boolean
  habit_loss_last_stage: number
  created_at: string
  updated_at: string
}

const SELECT_FIELDS =
  'user_id, ica_streak_enabled, ica_streak_hour, flashcards_streak_enabled, flashcards_streak_hour, habit_loss_enabled, habit_loss_last_stage, created_at, updated_at'

const DEFAULT_HOUR = 20

export class PushReminderPreferencesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PushReminderPreferencesError'
  }
}

function normalizeHour(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_HOUR
  if (value < 5) return 5
  if (value > 23) return 23
  return Math.round(value)
}

function mapRow(row: PushReminderPreferencesRow): PushReminderPreferences {
  return {
    userId: row.user_id,
    icaStreakEnabled: Boolean(row.ica_streak_enabled),
    icaStreakHour: normalizeHour(Number(row.ica_streak_hour ?? DEFAULT_HOUR)),
    flashcardsStreakEnabled: Boolean(row.flashcards_streak_enabled),
    flashcardsStreakHour: normalizeHour(
      Number(row.flashcards_streak_hour ?? DEFAULT_HOUR),
    ),
    habitLossEnabled: Boolean(row.habit_loss_enabled),
    habitLossLastStage: Number(row.habit_loss_last_stage ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) {
    throw new PushReminderPreferencesError('Supabase no esta configurado.')
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new PushReminderPreferencesError(
      'Necesitas iniciar sesion para configurar notificaciones.',
    )
  }

  return user.id
}

function getDefaultPreferences(userId: string): PushReminderPreferences {
  return {
    userId,
    icaStreakEnabled: false,
    icaStreakHour: DEFAULT_HOUR,
    flashcardsStreakEnabled: false,
    flashcardsStreakHour: DEFAULT_HOUR,
    habitLossEnabled: false,
    habitLossLastStage: 0,
    createdAt: null,
    updatedAt: null,
  }
}

export async function fetchPushReminderPreferences(): Promise<PushReminderPreferences> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('user_push_notification_preferences')
    .select(SELECT_FIELDS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new PushReminderPreferencesError(
      'No se pudieron cargar tus preferencias de notificaciones.',
    )
  }

  if (!data) {
    return getDefaultPreferences(userId)
  }

  return mapRow(data as PushReminderPreferencesRow)
}

export async function upsertPushReminderPreferences(
  input: PushReminderPreferencesInput,
): Promise<PushReminderPreferences> {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase!
    .from('user_push_notification_preferences')
    .upsert(
      {
        user_id: userId,
        ica_streak_enabled: Boolean(input.icaStreakEnabled),
        ica_streak_hour: normalizeHour(input.icaStreakHour),
        flashcards_streak_enabled: Boolean(input.flashcardsStreakEnabled),
        flashcards_streak_hour: normalizeHour(input.flashcardsStreakHour),
        habit_loss_enabled: Boolean(input.habitLossEnabled),
      },
      { onConflict: 'user_id' },
    )
    .select(SELECT_FIELDS)
    .single()

  if (error || !data) {
    throw new PushReminderPreferencesError(
      'No se pudieron guardar tus preferencias de notificaciones.',
    )
  }

  return mapRow(data as PushReminderPreferencesRow)
}
