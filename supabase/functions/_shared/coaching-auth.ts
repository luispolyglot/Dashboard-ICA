import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from './http.ts'

type SupabaseContext = {
  url: string
  anonKey: string
  serviceRoleKey: string
  authHeader: string
}

type CoachingAdminRole = 'coach_admin' | 'super_admin'

export type CoachingScope = {
  targetLang: string
  levels: string[]
}

type CoachingAdminRow = {
  role: CoachingAdminRole
  is_active: boolean
  coach_scopes: unknown
}

type EnsureAuthResult =
  | {
      ok: true
      userId: string
      adminClient: ReturnType<typeof createClient>
    }
  | { ok: false; response: Response }

export type EnsureCoachingAdminResult =
  | {
      ok: true
      userId: string
      adminClient: ReturnType<typeof createClient>
      adminRole: CoachingAdminRole
      scopes: CoachingScope[]
    }
  | { ok: false; response: Response }

function readContext(req: Request): SupabaseContext | null {
  const authHeader = req.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!authHeader || !url || !anonKey || !serviceRoleKey) return null
  return { authHeader, url, anonKey, serviceRoleKey }
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function parseCoachScopes(raw: unknown): CoachingScope[] {
  if (!Array.isArray(raw)) return []

  const scopes: CoachingScope[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const asRecord = item as Record<string, unknown>
    const targetLangRaw =
      typeof asRecord.targetLang === 'string'
        ? asRecord.targetLang
        : typeof asRecord.target_lang === 'string'
          ? asRecord.target_lang
          : ''
    const targetLang = targetLangRaw.trim()
    if (!targetLang) continue

    const levelsRaw = Array.isArray(asRecord.levels) ? asRecord.levels : []
    const levels = levelsRaw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    scopes.push({ targetLang, levels: Array.from(new Set(levels)) })
  }

  return scopes
}

export function scopeAllows(
  adminRole: CoachingAdminRole,
  scopes: CoachingScope[],
  targetLang: string,
  level: string,
): boolean {
  if (adminRole === 'super_admin') return true
  const normalizedTarget = normalize(targetLang)
  const normalizedLevel = normalize(level)

  return scopes.some((scope) => {
    if (normalize(scope.targetLang) !== normalizedTarget) return false
    if (scope.levels.length === 0) return true
    return scope.levels.some((item) => normalize(item) === normalizedLevel)
  })
}

export async function ensureAuthenticated(req: Request): Promise<EnsureAuthResult> {
  const context = readContext(req)
  if (!context) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Supabase function environment is not configured' }),
    }
  }

  const authClient = createClient(context.url, context.anonKey, {
    global: {
      headers: {
        Authorization: context.authHeader,
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !user) {
    return { ok: false, response: jsonResponse(401, { error: 'Unauthorized' }) }
  }

  const adminClient = createClient(context.url, context.serviceRoleKey)
  return { ok: true, userId: user.id, adminClient }
}

export async function ensureCoachingAdmin(req: Request): Promise<EnsureCoachingAdminResult> {
  const auth = await ensureAuthenticated(req)
  if (!auth.ok) return auth

  const { data: adminRow, error } = await auth.adminClient
    .from('admins_coaching')
    .select('role, is_active, coach_scopes')
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .maybeSingle<CoachingAdminRow>()

  if (error) {
    return { ok: false, response: jsonResponse(500, { error: error.message }) }
  }

  if (!adminRow) {
    return { ok: false, response: jsonResponse(403, { error: 'Forbidden' }) }
  }

  return {
    ok: true,
    userId: auth.userId,
    adminClient: auth.adminClient,
    adminRole: adminRow.role,
    scopes: parseCoachScopes(adminRow.coach_scopes),
  }
}
