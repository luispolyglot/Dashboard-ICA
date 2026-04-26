import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureSuperAdmin } from '../_shared/super-admin.ts'

type CreatePayload = {
  email?: string
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

  let payload: CreatePayload
  try {
    payload = (await req.json()) as CreatePayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const email = normalizeEmail(payload.email || '')
  if (!email.includes('@')) {
    return jsonResponse(400, { error: 'Invalid email' })
  }

  const { error } = await auth.adminClient.from('auth_whitelist').upsert(
    {
      email,
      can_register: true,
      can_login: true,
      source: 'manual',
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  )

  if (error) {
    return jsonResponse(500, { error: error.message })
  }

  return jsonResponse(200, { ok: true, email })
})
