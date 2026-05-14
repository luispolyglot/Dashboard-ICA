import { supabase } from '@/lib/supabase'

export type CoachingScope = {
  targetLang: string
  levels: string[]
}

export type CoachingAccessPayload = {
  isCoachingAdmin: boolean
  isCoachingSuperAdmin: boolean
  isCoachingUser: boolean
  adminRole: 'coach_admin' | 'super_admin' | null
  coachScopes: CoachingScope[]
}

export type CoachingMembership = {
  id: string
  userId: string
  createdAt: string
  coachUserId: string | null
  coachDisplayName: string | null
  targetLang: string
  nativeLang: string | null
  level: string
  classSessions: unknown[]
  feedbackNmUrl: string | null
  feedbackNmNotes: string | null
  weeklyObjectives: Record<string, unknown>
  notes: string | null
  updatedAt: string
}

export type CoachingManagedUser = {
  id: string
  userId: string
  userDisplayName: string
  coachUserId: string | null
  coachDisplayName: string | null
  targetLang: string
  nativeLang: string | null
  level: string
  classSessions: unknown[]
  feedbackNmUrl: string | null
  feedbackNmNotes: string | null
  weeklyObjectives: Record<string, unknown>
  notes: string | null
  isActive: boolean
  updatedAt: string
  activeTargetLang: string | null
  activeNativeLang: string | null
  activeLevel: string | null
}

export type CoachingAvailableUser = {
  userId: string
  userDisplayName: string
  targetLang: string
  nativeLang: string
  activeLevel: string
  alreadyInCoaching: boolean
}

export type CoachingInsightWord = {
  id: string
  target: string
  native: string
  importance: string
  created_at: string
}

export type CoachingInsightNote = {
  id: string
  name: string
  state: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  final_audio_path: string | null
  audioUrl: string | null
  audioChunks: Array<{
    id: string
    storage_path: string
    sort_order: number
    audioUrl: string | null
  }>
}

export type CoachingUserInsights = {
  targetLang: string
  wordsCount: number
  words: CoachingInsightWord[]
  masterNotesCount: number
  masterNotes: CoachingInsightNote[]
  weeklyObjectives: Record<string, unknown>
}

export type CoachingUserMembership = {
  id: string
  userId: string
  userDisplayName: string
  createdAt: string
  targetLang: string
  nativeLang: string | null
  level: string
  classSessions: unknown[]
  feedbackNmUrl: string | null
  feedbackNmNotes: string | null
  weeklyObjectives: Record<string, unknown>
  notes: string | null
  isActive: boolean
  updatedAt: string
}

export type CoachingAdminRow = {
  userId: string
  userDisplayName: string
  role: 'coach_admin' | 'super_admin'
  scopes: CoachingScope[]
  isActive: boolean
  createdBy: string | null
  createdByDisplayName: string | null
  createdAt: string
  updatedAt: string
}

export class CoachingRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CoachingRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

async function invokeCoachingFunction<T>(
  name: 'coaching-access' | 'coaching-center',
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  if (!supabase) {
    throw new CoachingRequestError('Supabase no está configurado.')
  }

  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new CoachingRequestError('No tienes permisos para esta acción.', 403)
    }
    throw new CoachingRequestError(fallbackMessage, status)
  }

  if (typeof data === 'undefined') {
    throw new CoachingRequestError('Respuesta vacía del servidor.')
  }

  return data as T
}

export async function fetchCoachingAccess(): Promise<CoachingAccessPayload | null> {
  return invokeCoachingFunction<CoachingAccessPayload | null>(
    'coaching-access',
    {},
    'No se pudo validar el acceso de coaching.',
  )
}

export async function checkCoachingAdminAccess(): Promise<boolean> {
  const access = await fetchCoachingAccess()
  return Boolean(access?.isCoachingAdmin)
}

export async function checkCoachingMemberAccess(): Promise<boolean> {
  const access = await fetchCoachingAccess()
  return Boolean(access?.isCoachingUser)
}

export async function fetchMyCoachingDashboard(targetLang?: string): Promise<CoachingMembership[]> {
  const data = await invokeCoachingFunction<{ memberships?: CoachingMembership[] }>(
    'coaching-center',
    {
      action: 'my-dashboard',
      ...(targetLang ? { targetLang } : {}),
    },
    'No se pudo cargar tu coaching personalizado.',
  )

  return Array.isArray(data.memberships) ? data.memberships : []
}

export async function fetchCoachingManagedUsers(): Promise<CoachingManagedUser[]> {
  const data = await invokeCoachingFunction<{ rows?: CoachingManagedUser[] }>(
    'coaching-center',
    { action: 'list-users' },
    'No se pudo cargar la tabla de coaching.',
  )

  return Array.isArray(data.rows) ? data.rows : []
}

export async function fetchAvailableUsersForCoaching(): Promise<CoachingAvailableUser[]> {
  const data = await invokeCoachingFunction<{ rows?: CoachingAvailableUser[] }>(
    'coaching-center',
    { action: 'list-available-users' },
    'No se pudo cargar la lista de usuarios disponibles.',
  )

  return Array.isArray(data.rows) ? data.rows : []
}

export async function upsertCoachingUser(input: {
  userId: string
  targetLang: string
  level: string
  nativeLang?: string | null
  coachUserId?: string | null
  classSessions?: unknown[]
  feedbackNmUrl?: string | null
  feedbackNmNotes?: string | null
  weeklyObjectives?: Record<string, unknown>
  notes?: string | null
  isActive?: boolean
}): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'upsert-user',
      ...input,
    },
    'No se pudo guardar el usuario en coaching.',
  )
}

export async function fetchCoachingUserInsights(input: {
  userId: string
  targetLang?: string
}): Promise<CoachingUserInsights> {
  return invokeCoachingFunction<CoachingUserInsights>(
    'coaching-center',
    {
      action: 'get-user-insights',
      userId: input.userId,
      ...(input.targetLang ? { targetLang: input.targetLang } : {}),
    },
    'No se pudieron cargar las notas maestras y palabras ICA del usuario.',
  )
}

export async function fetchCoachingUserMemberships(userId: string): Promise<CoachingUserMembership[]> {
  const data = await invokeCoachingFunction<{ rows?: CoachingUserMembership[] }>(
    'coaching-center',
    {
      action: 'get-user-memberships',
      userId,
    },
    'No se pudo cargar la membresía de coaching del usuario.',
  )

  return Array.isArray(data.rows) ? data.rows : []
}

export async function fetchCoachingAdmins(): Promise<CoachingAdminRow[]> {
  const data = await invokeCoachingFunction<{ rows?: CoachingAdminRow[] }>(
    'coaching-center',
    { action: 'list-admins' },
    'No se pudo cargar la lista de coaches.',
  )

  return Array.isArray(data.rows) ? data.rows : []
}

export async function upsertCoachingAdmin(input: {
  userId: string
  role: 'coach_admin' | 'super_admin'
  scopes: CoachingScope[]
  isActive?: boolean
}): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'upsert-admin',
      userId: input.userId,
      role: input.role,
      scopes: input.scopes,
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
    },
    'No se pudo guardar el coach admin.',
  )
}
