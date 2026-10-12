import { supabase } from '@/lib/supabase'
import { peekQuick, quickFetch } from './quickCache'

export type AdminRole = 'admin' | 'super_admin'

type AdminUserRow = {
  role: AdminRole
  is_active: boolean
}

export type AdminAnalyticsSummary = {
  totalUsers: number
  totalLexicards: number
  totalReviews: number
  totalPhrases: number
  totalVoiceActivations: number
  activeUsersToday: number
  wordsAddedToday: number
  reviewsToday: number
  voiceActivationsToday: number
}

export type AdminAnalyticsRecentUser = {
  userId: string
  displayName: string | null
  createdAt: string
}

export type AdminAnalyticsDailySignup = {
  day: string
  count: number
}

export type AdminAnalyticsPayload = {
  summary: AdminAnalyticsSummary
  recentUsers: AdminAnalyticsRecentUser[]
  dailySignups: AdminAnalyticsDailySignup[]
}

type AdminAnalyticsResponse = {
  summary?: AdminAnalyticsSummary
  recentUsers?: AdminAnalyticsRecentUser[]
  dailySignups?: AdminAnalyticsDailySignup[]
}

export class AnalyticsRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'AnalyticsRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

export async function checkAdminAccess(): Promise<boolean> {
  if (!supabase) return false

  const role = await fetchAdminRole()
  return role === 'admin' || role === 'super_admin'
}

export async function checkSuperAdminAccess(): Promise<boolean> {
  if (!supabase) return false

  const role = await fetchAdminRole()
  return role === 'super_admin'
}

async function requestAdminRole(userId: string): Promise<AdminRole | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('admin_users')
    .select('role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle<AdminUserRow>()

  if (error || !data) return null
  return data.role
}

/**
 * Rol de admin del usuario. Antes pedía la sesión al servidor cada vez (lento); ahora usa la
 * sesión que ya hay en el navegador y recuerda el rol un minuto (los permisos de verdad los
 * comprueba siempre el servidor al pedir los datos).
 */
export async function fetchAdminRole(): Promise<AdminRole | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return null
  return quickFetch(`admin-role:${userId}`, () => requestAdminRole(userId), { maxAgeMs: 60_000 })
}

/** El último rol conocido (al momento), o undefined si todavía no se sabe. */
export function peekAdminRole(userId: string | null | undefined): AdminRole | null | undefined {
  if (!userId) return undefined
  return peekQuick<AdminRole | null>(`admin-role:${userId}`)
}

export async function fetchAdminAnalytics(): Promise<AdminAnalyticsPayload> {
  if (!supabase) {
    throw new AnalyticsRequestError('Supabase no está configurado.')
  }

  const { data, error } = await supabase.functions.invoke<AdminAnalyticsResponse>('admin-analytics', {
    body: {},
  })

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new AnalyticsRequestError('No tienes permisos para ver este panel.', 403)
    }
    throw new AnalyticsRequestError('No se pudieron cargar las analíticas.', status)
  }

  if (
    !data?.summary ||
    !Array.isArray(data.recentUsers) ||
    !Array.isArray(data.dailySignups)
  ) {
    throw new AnalyticsRequestError('Respuesta inválida del servidor de analíticas.')
  }

  return {
    summary: data.summary,
    recentUsers: data.recentUsers,
    dailySignups: data.dailySignups,
  }
}
