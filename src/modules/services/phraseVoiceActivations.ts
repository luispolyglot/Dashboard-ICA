import { supabase } from '../../lib/supabase'
import type { PhraseVoiceActivationEntry } from '../types'

const BUCKET = 'phrase-activations'
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MAX_AUDIO_DURATION_MS = 2 * 60 * 1000
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

function getFileExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('mp4')) return 'm4a'
  return 'webm'
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

export async function fetchPhraseVoiceActivations(
  phraseGenerationIds: string[],
): Promise<Record<string, PhraseVoiceActivationEntry[]>> {
  if (!supabase || phraseGenerationIds.length === 0) return {}

  const { data, error } = await supabase
    .from('phrase_voice_activations')
    .select(
      'id, phrase_generation_id, storage_path, duration_ms, mime_type, size_bytes, status, created_at',
    )
    .in('phrase_generation_id', phraseGenerationIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  const rows = (data || []) as PhraseVoiceActivationEntry[]
  return rows.reduce<Record<string, PhraseVoiceActivationEntry[]>>((acc, row) => {
    if (!acc[row.phrase_generation_id]) {
      acc[row.phrase_generation_id] = []
    }
    acc[row.phrase_generation_id].push(row)
    return acc
  }, {})
}

export async function fetchTodayVoiceActivationCount(): Promise<number> {
  if (!supabase) return 0

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('phrase_voice_activations')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay.toISOString())

  if (error) {
    throw error
  }

  return count || 0
}

export async function createSignedActivationAudioUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw error || new Error('No se pudo generar URL firmada')
  }

  return data.signedUrl
}

type UploadPhraseActivationParams = {
  phraseGenerationId: string
  audioBlob: Blob
  mimeType: string
  durationMs: number
}

export async function uploadPhraseVoiceActivation({
  phraseGenerationId,
  audioBlob,
  mimeType,
  durationMs,
}: UploadPhraseActivationParams): Promise<PhraseVoiceActivationEntry> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Debes iniciar sesión para activar una frase')
  }
  if (!phraseGenerationId) {
    throw new Error('No se encontró la frase para activar')
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Formato de audio no permitido')
  }

  if (audioBlob.size <= 0 || audioBlob.size > MAX_AUDIO_BYTES) {
    throw new Error('El audio debe pesar menos de 10 MB')
  }

  if (durationMs <= 0 || durationMs > MAX_AUDIO_DURATION_MS) {
    throw new Error('La grabación debe durar entre 1 y 120 segundos')
  }

  const activationId = crypto.randomUUID()
  const ext = getFileExtension(mimeType)
  const storagePath = `${userId}/${phraseGenerationId}/${activationId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, audioBlob, {
      upsert: false,
      contentType: mimeType,
    })

  if (uploadError) {
    throw uploadError
  }

  const { data: inserted, error: insertError } = await supabase
    .from('phrase_voice_activations')
    .insert({
      id: activationId,
      user_id: userId,
      phrase_generation_id: phraseGenerationId,
      storage_path: storagePath,
      duration_ms: Math.max(0, Math.round(durationMs)),
      mime_type: mimeType,
      size_bytes: audioBlob.size,
      status: 'uploaded',
      activation_source: 'direct',
    })
    .select(
      'id, phrase_generation_id, storage_path, duration_ms, mime_type, size_bytes, status, created_at',
    )
    .single()

  if (insertError || !inserted) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw insertError || new Error('No se pudo registrar la activación de voz')
  }

  return inserted as PhraseVoiceActivationEntry
}

export async function deletePhraseVoiceActivation(
  activationId: string,
): Promise<void> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const { data: existing, error: fetchError } = await supabase
    .from('phrase_voice_activations')
    .select('id, storage_path')
    .eq('id', activationId)
    .maybeSingle()

  if (fetchError) {
    throw fetchError
  }
  if (!existing) return

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([existing.storage_path])

  if (removeError) {
    throw removeError
  }

  const { error: deleteError } = await supabase
    .from('phrase_voice_activations')
    .delete()
    .eq('id', activationId)

  if (deleteError) {
    throw deleteError
  }
}

export function getPhraseActivationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'No se pudo completar la acción de activación'
}
