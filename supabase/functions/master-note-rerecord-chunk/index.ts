import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MASTER_NOTES_BUCKET = 'master-notes'
const MAX_AUDIO_BYTES = 15 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/ogg;codecs=opus',
])

type RerecordPayload = {
  noteId?: string
  chunkId?: string
  phraseGenerationId?: string
  mimeType?: string
  durationMs?: number
  sizeBytes?: number
  audioBase64?: string
}

type RpcRow = {
  chunk_id: string
  note_id: string
  phrase_generation_id: string
  storage_path: string
  duration_ms: number
  mime_type: string | null
  size_bytes: number | null
  total_duration_ms: number
  previous_chunk_storage_path: string | null
  previous_activation_storage_path: string | null
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('mp4')) return 'm4a'
  return 'webm'
}

function decodeBase64Audio(value: string): Uint8Array {
  const normalized = value
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '')

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function mapRpcErrorToStatus(message: string): number {
  if (
    message.includes('MASTER_NOTE_NOT_FOUND') ||
    message.includes('MASTER_NOTE_CHUNK_NOT_FOUND') ||
    message.includes('CHUNK_ACTIVATION_NOT_FOUND')
  ) {
    return 404
  }

  if (
    message.includes('MASTER_NOTE_NOT_OPEN') ||
    message.includes('MASTER_NOTE_NOT_EDITABLE') ||
    message.includes('CLOSED_NOTE_MIN_TOTAL_3_30') ||
    message.includes('CHUNK_PHRASE_MISMATCH')
  ) {
    return 409
  }

  if (
    message.includes('AUTH_REQUIRED') ||
    message.includes('INVALID_INPUT') ||
    message.includes('INVALID_STORAGE_PATH') ||
    message.includes('INVALID_DURATION') ||
    message.includes('INVALID_SIZE')
  ) {
    return 400
  }

  return 500
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

  const payload = (await req.json().catch(() => ({}))) as RerecordPayload

  const noteId = typeof payload.noteId === 'string' ? payload.noteId.trim() : ''
  const chunkId =
    typeof payload.chunkId === 'string' ? payload.chunkId.trim() : ''
  const phraseGenerationId =
    typeof payload.phraseGenerationId === 'string'
      ? payload.phraseGenerationId.trim()
      : ''
  const mimeType =
    typeof payload.mimeType === 'string' ? payload.mimeType.trim() : ''
  const durationMs = Math.max(0, Math.round(Number(payload.durationMs || 0)))
  const sizeBytes = Math.max(0, Math.round(Number(payload.sizeBytes || 0)))
  const audioBase64 =
    typeof payload.audioBase64 === 'string' ? payload.audioBase64 : ''

  if (!isUuid(noteId) || !isUuid(chunkId) || !isUuid(phraseGenerationId)) {
    return jsonResponse(400, { error: 'noteId, chunkId y phraseGenerationId son obligatorios' })
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return jsonResponse(400, { error: 'Formato de audio no permitido' })
  }

  if (durationMs <= 0) {
    return jsonResponse(400, { error: 'durationMs debe ser mayor que 0' })
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_AUDIO_BYTES) {
    return jsonResponse(400, { error: 'sizeBytes invalido' })
  }

  if (!audioBase64) {
    return jsonResponse(400, { error: 'audioBase64 es obligatorio' })
  }

  let audioBytes: Uint8Array
  try {
    audioBytes = decodeBase64Audio(audioBase64)
  } catch {
    return jsonResponse(400, { error: 'audioBase64 invalido' })
  }

  if (audioBytes.byteLength !== sizeBytes) {
    return jsonResponse(400, {
      error: 'sizeBytes no coincide con el audio enviado',
    })
  }

  const extension = getFileExtension(mimeType)
  const newStoragePath = `${user.id}/${noteId}/chunks/${chunkId}-${Date.now()}.${extension}`
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { error: uploadError } = await adminClient.storage
    .from(MASTER_NOTES_BUCKET)
    .upload(newStoragePath, audioBytes, {
      upsert: false,
      contentType: mimeType,
    })

  if (uploadError) {
    return jsonResponse(500, { error: uploadError.message })
  }

  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    'rerecord_master_note_chunk',
    {
      p_user_id: user.id,
      p_note_id: noteId,
      p_chunk_id: chunkId,
      p_phrase_generation_id: phraseGenerationId,
      p_storage_path: newStoragePath,
      p_duration_ms: durationMs,
      p_mime_type: mimeType,
      p_size_bytes: sizeBytes,
    },
  )

  if (rpcError) {
    await adminClient.storage.from(MASTER_NOTES_BUCKET).remove([newStoragePath])
    const status = mapRpcErrorToStatus(rpcError.message || '')
    return jsonResponse(status, {
      error: rpcError.message || 'No se pudo regrabar el chunk',
    })
  }

  const rpcRows = Array.isArray(rpcData) ? rpcData : []
  const result = (rpcRows[0] || null) as RpcRow | null
  if (!result) {
    await adminClient.storage.from(MASTER_NOTES_BUCKET).remove([newStoragePath])
    return jsonResponse(500, { error: 'No se obtuvo resultado de regrabacion' })
  }

  const previousPaths = [
    result.previous_chunk_storage_path,
    result.previous_activation_storage_path,
  ]
    .filter((path): path is string => Boolean(path))
    .filter((path) => path !== newStoragePath)

  const uniquePreviousPaths = [...new Set(previousPaths)]
  let cleanedPreviousAudio = true

  if (uniquePreviousPaths.length > 0) {
    const { error: removeOldAudioError } = await adminClient.storage
      .from(MASTER_NOTES_BUCKET)
      .remove(uniquePreviousPaths)

    if (removeOldAudioError) {
      cleanedPreviousAudio = false
      console.error('Failed removing previous rerecord audio', {
        noteId,
        chunkId,
        previousPaths: uniquePreviousPaths,
        error: removeOldAudioError.message,
      })
    }
  }

  return jsonResponse(200, {
    chunkId: result.chunk_id,
    noteId: result.note_id,
    phraseGenerationId: result.phrase_generation_id,
    storagePath: result.storage_path,
    durationMs: result.duration_ms,
    mimeType: result.mime_type,
    sizeBytes: result.size_bytes,
    totalDurationMs: result.total_duration_ms,
    cleanedPreviousAudio,
  })
})
