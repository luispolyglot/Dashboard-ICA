import { supabase } from '@/lib/supabase'

export type AdminRole = 'admin' | 'super_admin'

export type AdminAnalyticsSummary = {
  totalUsers: number
  totalLexicards: number
  totalReviews: number
  totalPhrases: number
  activeUsersToday: number
  wordsAddedToday: number
  reviewsToday: number
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return false

  const { data, error } = await supabase
    .from('admin_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return false
  return data.role === 'admin' || data.role === 'super_admin'
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

  if (!data?.summary || !Array.isArray(data.recentUsers) || !Array.isArray(data.dailySignups)) {
    throw new AnalyticsRequestError('Respuesta inválida del servidor de analíticas.')
  }

  return {
    summary: data.summary,
    recentUsers: data.recentUsers,
    dailySignups: data.dailySignups,
  }
}
