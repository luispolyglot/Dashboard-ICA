import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureAuthenticated, parseCoachScopes } from '../_shared/coaching-auth.ts'

type CoachingAdminRow = {
  role: 'coach_admin' | 'super_admin'
  is_active: boolean
  coach_scopes: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await ensureAuthenticated(req)
  if (!auth.ok) return auth.response

  const { data: adminRow, error: adminError } = await auth.adminClient
    .from('admins_coaching')
    .select('role, is_active, coach_scopes')
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .maybeSingle<CoachingAdminRow>()

  if (adminError) {
    return jsonResponse(500, { error: adminError.message })
  }

  const { data: coachingRows, error: coachingError } = await auth.adminClient
    .from('coaching_sessions')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .eq('status', 'active')
    .not('activated_at', 'is', null)
    .limit(1)

  if (coachingError) {
    return jsonResponse(500, { error: coachingError.message })
  }

  const hasAdminAccess = Boolean(adminRow)
  const hasCoachingMembership = (coachingRows || []).length > 0

  if (!hasAdminAccess && !hasCoachingMembership) {
    return jsonResponse(200, null)
  }

  return jsonResponse(200, {
    isCoachingAdmin: hasAdminAccess,
    isCoachingSuperAdmin: adminRow?.role === 'super_admin',
    isCoachingUser: hasCoachingMembership,
    adminRole: adminRow?.role || null,
    coachScopes: parseCoachScopes(adminRow?.coach_scopes),
  })
})
