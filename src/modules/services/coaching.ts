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
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  activatedAt: string | null
  durationWeeks: number
  weekActivation?: WeekActivationState
  weekProgress?: Record<
    string,
    {
      wordsCreated: number
      closedMasterNotes: number
      icaStreakPct: number
      flashcardsStreakPct: number
    }
  >
  closedMasterNotesByWeek?: Record<
    string,
    Array<{
      id: string
      name: string
      createdAt: string
      closedAt: string
      feedbackLoomUrl: string | null
      feedbackNotes?: string | null
    }>
  >
  updatedAt: string
}

export type WeekActivationState = {
  lastActivatedWeek: number
  activatedWeeks: string[]
  currentActiveWeek: number | null
  nextWeekEligible: number | null
  nextWeekBlockedReason:
    | 'missing_objectives'
    | 'previous_week_not_finished'
    | null
}

const COACHING_CLASS_REPORTS_BUCKET = 'coaching-class-reports'

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
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  activatedAt: string | null
  durationWeeks: number
  weekActivation?: WeekActivationState
  updatedAt: string
  activeTargetLang: string | null
  activeNativeLang: string | null
  activeLevel: string | null
  hasPendingMasterNotesReview?: boolean
  pendingMasterNotesReviewCount?: number
}

export type CoachingPendingReviewSummary = {
  hasPendingReviews: boolean
  pendingSessions: number
  pendingNotes: number
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
  total_duration_ms: number
  created_at: string
  updated_at: string
  closed_at: string | null
  coachingFeedbackLoomUrl: string | null
  coachingFeedbackNotes: string | null
  final_audio_path: string | null
  audioUrl: string | null
  audioChunks: Array<{
    id: string
    storage_path: string
    sort_order: number
    duration_ms: number | null
    audioUrl: string | null
  }>
}

export type CoachingUserInsights = {
  sessionId?: string
  targetLang: string
  wordsCount: number
  words: CoachingInsightWord[]
  masterNotesCount: number
  masterNotes: CoachingInsightNote[]
  weeklyObjectives: Record<string, unknown>
  closedMasterNotesByWeek?: Record<
    string,
    Array<{
      id: string
      name: string
      createdAt: string
      closedAt: string
      feedbackLoomUrl: string | null
      feedbackNotes: string | null
    }>
  >
  weekActivation?: WeekActivationState
  weekProgress?: Record<
    string,
    {
      wordsCreated: number
      closedMasterNotes: number
      icaStreakPct: number
      flashcardsStreakPct: number
    }
  >
}

export type CoachingUserMembership = {
  id: string
  userId: string
  userDisplayName: string
  coachUserId: string | null
  coachDisplayName: string | null
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
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  activatedAt: string | null
  durationWeeks: number
  weekActivation?: WeekActivationState
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

export async function fetchCoachingPendingReviewSummary(): Promise<CoachingPendingReviewSummary> {
  const access = await fetchCoachingAccess()
  if (!access?.isCoachingAdmin) {
    return {
      hasPendingReviews: false,
      pendingSessions: 0,
      pendingNotes: 0,
    }
  }

  const rows = await fetchCoachingManagedUsers()
  const pendingSessions = rows.filter((row) => {
    const count = row.pendingMasterNotesReviewCount || 0
    return row.hasPendingMasterNotesReview || count > 0
  }).length

  const pendingNotes = rows.reduce((total, row) => {
    const count = row.pendingMasterNotesReviewCount || 0
    return total + (count > 0 ? count : 0)
  }, 0)

  return {
    hasPendingReviews: pendingSessions > 0,
    pendingSessions,
    pendingNotes,
  }
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
  sessionId?: string
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
  sessionId?: string
  targetLang?: string
}): Promise<CoachingUserInsights> {
  return invokeCoachingFunction<CoachingUserInsights>(
    'coaching-center',
    {
      action: 'get-user-insights',
      userId: input.userId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.targetLang ? { targetLang: input.targetLang } : {}),
    },
    'No se pudieron cargar las notas maestras y palabras ICA del usuario.',
  )
}

export async function activateCoachingSession(sessionId: string): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'activate-session',
      sessionId,
    },
    'No se pudo comenzar la sesión de coaching.',
  )
}

export async function activateCoachingWeek(input: {
  sessionId: string
  weekKey: string
}): Promise<WeekActivationState | null> {
  const data = await invokeCoachingFunction<{
    ok?: boolean
    weekActivation?: WeekActivationState
  }>(
    'coaching-center',
    {
      action: 'activate-week',
      sessionId: input.sessionId,
      weekKey: input.weekKey,
    },
    'No se pudo activar la semana.',
  )

  return data.weekActivation || null
}

export async function closeCoachingWeek(input: {
  sessionId: string
}): Promise<WeekActivationState | null> {
  const data = await invokeCoachingFunction<{
    ok?: boolean
    weekActivation?: WeekActivationState
  }>(
    'coaching-center',
    {
      action: 'close-week',
      sessionId: input.sessionId,
    },
    'No se pudo cerrar la semana actual.',
  )

  return data.weekActivation || null
}

export async function deleteCoachingSession(sessionId: string): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'archive-session',
      sessionId,
    },
    'No se pudo archivar la sesión de coaching.',
  )
}

export async function hardDeleteCoachingSession(sessionId: string): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'hard-delete-session',
      sessionId,
    },
    'No se pudo eliminar definitivamente la sesión de coaching.',
  )
}

export async function closeCoachingSession(input: {
  sessionId: string
  closureReason?: string | null
}): Promise<{ completedWeeks: number | null }> {
  return invokeCoachingFunction<{ completedWeeks?: number | null }>(
    'coaching-center',
    {
      action: 'close-session',
      sessionId: input.sessionId,
      closureReason: input.closureReason || null,
    },
    'No se pudo cerrar la sesión de coaching.',
  ).then((data) => ({ completedWeeks: data.completedWeeks ?? null }))
}

export async function completeCoachingExerciseObjective(input: {
  sessionId: string
  weekKey: string
}): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'complete-exercise-objective',
      sessionId: input.sessionId,
      weekKey: input.weekKey,
    },
    'No se pudo marcar el ejercicio como completado.',
  )
}

export async function upsertMasterNoteFeedbackLoom(input: {
  sessionId: string
  masterNoteId: string
  feedbackLoomUrl: string | null
  feedbackNotes?: string | null
}): Promise<void> {
  await invokeCoachingFunction<{ ok?: boolean }>(
    'coaching-center',
    {
      action: 'upsert-master-note-feedback-loom',
      sessionId: input.sessionId,
      masterNoteId: input.masterNoteId,
      feedbackLoomUrl: input.feedbackLoomUrl,
      feedbackNotes: typeof input.feedbackNotes === 'string' ? input.feedbackNotes : null,
    },
    'No se pudo guardar el video de feedback de la nota maestra.',
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

function sanitizePathChunk(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function uploadCoachingClassReportImage(input: {
  file: File
  userId: string
  targetLang: string
  weekKey: string
}): Promise<string> {
  if (!supabase) {
    throw new CoachingRequestError('Supabase no está configurado.')
  }

  const extension = input.file.name.includes('.')
    ? input.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    : 'jpg'

  const safeTargetLang = sanitizePathChunk(input.targetLang) || 'lang'
  const safeWeekKey = sanitizePathChunk(input.weekKey) || 'week'
  const path = `${input.userId}/${safeTargetLang}/${safeWeekKey}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage
    .from(COACHING_CLASS_REPORTS_BUCKET)
    .upload(path, input.file, { upsert: false })

  if (error) {
    throw new CoachingRequestError('No se pudo subir la imagen de reporte.')
  }

  return path
}

export async function deleteCoachingClassReportImage(path: string): Promise<void> {
  if (!supabase || !path) return
  await supabase.storage.from(COACHING_CLASS_REPORTS_BUCKET).remove([path])
}
