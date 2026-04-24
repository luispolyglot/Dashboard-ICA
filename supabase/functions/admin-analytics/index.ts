import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type SummaryPayload = {
  totalUsers: number
  totalLexicards: number
  totalReviews: number
  totalPhrases: number
  activeUsersToday: number
  wordsAddedToday: number
  reviewsToday: number
}

type RecentUserPayload = {
  userId: string
  displayName: string | null
  createdAt: string
}

type DailySignupPayload = {
  day: string
  count: number
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

function toIsoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function buildRecentDays(days: number): string[] {
  const result: string[] = []
  const now = new Date()

  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(now)
    day.setUTCDate(now.getUTCDate() - index)
    result.push(toIsoDay(day))
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Supabase function environment is not configured' })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !user) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: adminRow, error: adminError } = await adminClient
    .from('admin_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (adminError) {
    return jsonResponse(500, { error: adminError.message })
  }

  if (!adminRow) {
    return jsonResponse(403, { error: 'Forbidden' })
  }

  const today = toIsoDay(new Date())
  const recentDays = buildRecentDays(14)
  const firstRecentDay = recentDays[0]

  const [
    profilesCountResult,
    lexicardsCountResult,
    reviewsCountResult,
    phrasesCountResult,
    todayMetricsResult,
    recentProfilesResult,
    profileSignupsResult,
  ] = await Promise.all([
    adminClient.from('profiles').select('*', { count: 'exact', head: true }),
    adminClient.from('lexicards').select('*', { count: 'exact', head: true }),
    adminClient.from('lexicard_reviews').select('*', { count: 'exact', head: true }),
    adminClient.from('phrase_generations').select('*', { count: 'exact', head: true }),
    adminClient.from('daily_metrics').select('user_id, words_added, reviews_done').eq('day', today),
    adminClient
      .from('profiles')
      .select('id, display_name, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    adminClient.from('profiles').select('created_at').gte('created_at', `${firstRecentDay}T00:00:00.000Z`),
  ])

  const queryErrors = [
    profilesCountResult.error,
    lexicardsCountResult.error,
    reviewsCountResult.error,
    phrasesCountResult.error,
    todayMetricsResult.error,
    recentProfilesResult.error,
    profileSignupsResult.error,
  ].filter(Boolean)

  if (queryErrors.length > 0) {
    return jsonResponse(500, { error: queryErrors[0]?.message || 'Analytics query failed' })
  }

  const todayMetricsRows = todayMetricsResult.data || []
  const recentProfilesRows = recentProfilesResult.data || []
  const profileSignupsRows = profileSignupsResult.data || []

  const wordsAddedToday = todayMetricsRows.reduce((sum, row) => sum + (row.words_added || 0), 0)
  const reviewsToday = todayMetricsRows.reduce((sum, row) => sum + (row.reviews_done || 0), 0)

  const summary: SummaryPayload = {
    totalUsers: profilesCountResult.count || 0,
    totalLexicards: lexicardsCountResult.count || 0,
    totalReviews: reviewsCountResult.count || 0,
    totalPhrases: phrasesCountResult.count || 0,
    activeUsersToday: todayMetricsRows.length,
    wordsAddedToday,
    reviewsToday,
  }

  const recentUsers: RecentUserPayload[] = recentProfilesRows.map((row) => ({
    userId: String(row.id),
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    createdAt: String(row.created_at),
  }))

  const signupCounter = new Map<string, number>()
  for (const day of recentDays) signupCounter.set(day, 0)

  for (const row of profileSignupsRows) {
    const createdAt = typeof row.created_at === 'string' ? row.created_at : ''
    const day = createdAt.slice(0, 10)
    if (!signupCounter.has(day)) continue
    signupCounter.set(day, (signupCounter.get(day) || 0) + 1)
  }

  const dailySignups: DailySignupPayload[] = recentDays.map((day) => ({
    day,
    count: signupCounter.get(day) || 0,
  }))

  return jsonResponse(200, {
    summary,
    recentUsers,
    dailySignups,
  })
})
