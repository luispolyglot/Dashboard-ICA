import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MIN_DURATION_MS = 3 * 60 * 1000

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
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
    return jsonResponse(500, {
      error: 'Supabase function environment is not configured',
    })
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

  const { noteId } = (await req.json().catch(() => ({ noteId: null }))) as {
    noteId: string | null
  }

  if (!noteId) {
    return jsonResponse(400, { error: 'noteId es obligatorio' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: note, error: noteError } = await adminClient
    .from('master_notes')
    .select('id, user_id, state, total_duration_ms')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError) {
    return jsonResponse(500, { error: noteError.message })
  }

  if (!note || note.user_id !== user.id) {
    return jsonResponse(404, { error: 'Nota maestra no encontrada' })
  }

  if (note.state !== 'open') {
    return jsonResponse(400, { error: 'La nota maestra ya está cerrada' })
  }

  if (note.total_duration_ms < MIN_DURATION_MS) {
    return jsonResponse(400, {
      error: 'La nota maestra debe durar al menos 3:00 para cerrarse',
    })
  }

  const { error: closeError } = await adminClient
    .from('master_notes')
    .update({
      state: 'closed',
      close_type: 'temporal',
      closed_at: new Date().toISOString(),
      final_audio_path: null,
    })
    .eq('id', noteId)

  if (closeError) {
    return jsonResponse(500, { error: closeError.message })
  }

  return jsonResponse(200, { ok: true, closeType: 'temporal' })
})
