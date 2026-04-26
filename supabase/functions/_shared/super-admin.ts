import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from './http.ts'

type SupabaseContext = {
  url: string
  anonKey: string
  serviceRoleKey: string
  authHeader: string
}

type EnsureResult =
  | { ok: true; adminClient: ReturnType<typeof createClient>; userId: string }
  | { ok: false; response: Response }

function readContext(req: Request): SupabaseContext | null {
  const authHeader = req.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!authHeader || !url || !anonKey || !serviceRoleKey) {
    return null
  }

  return { authHeader, url, anonKey, serviceRoleKey }
}

export async function ensureSuperAdmin(req: Request): Promise<EnsureResult> {
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
  const { data: adminRow, error: adminError } = await adminClient
    .from('admin_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle<{ role: 'admin' | 'super_admin'; is_active: boolean }>()

  if (adminError) {
    return { ok: false, response: jsonResponse(500, { error: adminError.message }) }
  }

  if (!adminRow || adminRow.role !== 'super_admin') {
    return { ok: false, response: jsonResponse(403, { error: 'Forbidden' }) }
  }

  return { ok: true, adminClient, userId: user.id }
}
