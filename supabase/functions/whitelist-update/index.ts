import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureSuperAdmin } from '../_shared/super-admin.ts'

type UpdatePayload = {
  email?: string
  canRegister?: boolean
  canLogin?: boolean
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await ensureSuperAdmin(req)
  if (!auth.ok) return auth.response

  let payload: UpdatePayload
  try {
    payload = (await req.json()) as UpdatePayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const email = normalizeEmail(payload.email || '')
  if (!email.includes('@')) {
    return jsonResponse(400, { error: 'Invalid email' })
  }

  const changes: Record<string, unknown> = {}
  if (typeof payload.canRegister === 'boolean') {
    changes.can_register = payload.canRegister
  }
  if (typeof payload.canLogin === 'boolean') {
    changes.can_login = payload.canLogin
  }

  if (Object.keys(changes).length === 0) {
    return jsonResponse(400, { error: 'No changes provided' })
  }

  const { data, error } = await auth.adminClient
    .from('auth_whitelist')
    .update(changes)
    .eq('email', email)
    .select('email')
    .maybeSingle()

  if (error) {
    return jsonResponse(500, { error: error.message })
  }

  if (!data) {
    return jsonResponse(404, { error: 'Whitelist entry not found' })
  }

  return jsonResponse(200, { ok: true, email })
})
