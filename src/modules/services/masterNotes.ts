import { supabase } from '@/lib/supabase'
import type { MasterNote, MasterNoteChunk } from '../types'

const MASTER_NOTES_BUCKET = 'master-notes'
const MAX_MASTER_NOTE_DURATION_MS = 3 * 60 * 1000 + 30 * 1000

function normalizeMasterNoteName(name: string): string {
  const value = name.trim().replace(/^NOTA MAESTRA:\s*/i, '')
  return `NOTA MAESTRA: ${value || 'Sin título'}`
}

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

export async function fetchMasterNotes(): Promise<MasterNote[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('master_notes')
    .select(
      'id, name, state, close_type, total_duration_ms, final_audio_path, created_at, updated_at, closed_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as MasterNote[]
}

export async function createMasterNote(name: string): Promise<MasterNote> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Debes iniciar sesión')

  const { data, error } = await supabase
    .from('master_notes')
    .insert({ user_id: userId, name: normalizeMasterNoteName(name), state: 'open' })
    .select(
      'id, name, state, close_type, total_duration_ms, final_audio_path, created_at, updated_at, closed_at',
    )
    .single()

  if (error || !data) throw error || new Error('No se pudo crear la nota maestra')
  return data as MasterNote
}

export async function fetchMasterNoteById(noteId: string): Promise<MasterNote | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('master_notes')
    .select(
      'id, name, state, close_type, total_duration_ms, final_audio_path, created_at, updated_at, closed_at',
    )
    .eq('id', noteId)
    .maybeSingle()

  if (error) throw error
  return (data as MasterNote | null) || null
}

export async function updateMasterNoteName(noteId: string, name: string): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')
  const { error } = await supabase
    .from('master_notes')
    .update({ name: normalizeMasterNoteName(name) })
    .eq('id', noteId)
    .eq('state', 'open')

  if (error) throw error
}

export async function deleteMasterNote(noteId: string): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { data: chunks, error: chunksError } = await supabase
    .from('master_note_chunks')
    .select('storage_path')
    .eq('master_note_id', noteId)

  if (chunksError) throw chunksError

  const { data: note, error: noteError } = await supabase
    .from('master_notes')
    .select('final_audio_path')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError) throw noteError

  const paths = [
    ...(chunks || []).map((row) => row.storage_path).filter(Boolean),
    ...(note?.final_audio_path ? [note.final_audio_path] : []),
  ]

  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(MASTER_NOTES_BUCKET)
      .remove(paths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('master_notes').delete().eq('id', noteId)
  if (error) throw error
}

export async function fetchMasterNoteChunks(
  noteId: string,
): Promise<MasterNoteChunk[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('master_note_chunks')
    .select(
      'id, master_note_id, phrase_generation_id, storage_path, duration_ms, mime_type, size_bytes, sort_order, created_at',
    )
    .eq('master_note_id', noteId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []) as MasterNoteChunk[]
}

type AddMasterNoteChunkParams = {
  noteId: string
  phraseGenerationId: string
  audioBlob: Blob
  mimeType: string
  durationMs: number
}

export async function addMasterNoteChunk({
  noteId,
  phraseGenerationId,
  audioBlob,
  mimeType,
  durationMs,
}: AddMasterNoteChunkParams): Promise<MasterNoteChunk> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Debes iniciar sesión')

  const { data: noteRow, error: noteError } = await supabase
    .from('master_notes')
    .select('id, state, total_duration_ms')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError) throw noteError
  if (!noteRow) throw new Error('No se encontró la nota maestra')
  if (noteRow.state !== 'open') {
    throw new Error('La nota maestra está cerrada')
  }

  const { data: existingChunk, error: existingChunkError } = await supabase
    .from('master_note_chunks')
    .select('id')
    .eq('master_note_id', noteId)
    .eq('phrase_generation_id', phraseGenerationId)
    .maybeSingle()

  if (existingChunkError) throw existingChunkError
  if (existingChunk) {
    throw new Error('Esa frase ya fue activada en esta nota maestra')
  }

  const normalizedDurationMs = Math.max(1, Math.round(durationMs))
  if (noteRow.total_duration_ms + normalizedDurationMs > MAX_MASTER_NOTE_DURATION_MS) {
    throw new Error('Ese audio supera el límite de 3:30 para esta nota maestra')
  }

  const chunkId = crypto.randomUUID()
  const ext = getFileExtension(mimeType)
  const storagePath = `${userId}/${noteId}/chunks/${chunkId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(MASTER_NOTES_BUCKET)
    .upload(storagePath, audioBlob, {
      upsert: false,
      contentType: mimeType,
    })

  if (uploadError) throw uploadError

  const { data: maxOrderData } = await supabase
    .from('master_note_chunks')
    .select('sort_order')
    .eq('master_note_id', noteId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = ((maxOrderData || [])[0]?.sort_order || 0) + 1

  const { data, error } = await supabase
    .from('master_note_chunks')
    .insert({
      id: chunkId,
      user_id: userId,
      master_note_id: noteId,
      phrase_generation_id: phraseGenerationId,
      storage_path: storagePath,
      duration_ms: normalizedDurationMs,
      mime_type: mimeType,
      size_bytes: audioBlob.size,
      sort_order: nextOrder,
    })
    .select(
      'id, master_note_id, phrase_generation_id, storage_path, duration_ms, mime_type, size_bytes, sort_order, created_at',
    )
    .single()

  if (error || !data) {
    await supabase.storage.from(MASTER_NOTES_BUCKET).remove([storagePath])
    throw error || new Error('No se pudo registrar el chunk')
  }

  const { error: activationError } = await supabase
    .from('phrase_voice_activations')
    .insert({
      user_id: userId,
      phrase_generation_id: phraseGenerationId,
      storage_path: storagePath,
      duration_ms: normalizedDurationMs,
      mime_type: mimeType,
      size_bytes: audioBlob.size,
      status: 'uploaded',
    })

  if (activationError) {
    await supabase.from('master_note_chunks').delete().eq('id', chunkId)
    await supabase.storage.from(MASTER_NOTES_BUCKET).remove([storagePath])
    throw activationError
  }

  const { data: sumRows, error: sumError } = await supabase
    .from('master_note_chunks')
    .select('duration_ms')
    .eq('master_note_id', noteId)

  if (sumError) throw sumError

  const totalDurationMs = (sumRows || []).reduce(
    (sum, row) => sum + (row.duration_ms || 0),
    0,
  )

  const { error: noteUpdateError } = await supabase
    .from('master_notes')
    .update({ total_duration_ms: totalDurationMs })
    .eq('id', noteId)
    .eq('state', 'open')

  if (noteUpdateError) throw noteUpdateError

  return data as MasterNoteChunk
}

export async function closeMasterNote(noteId: string): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { error } = await supabase.functions.invoke('master-note-close', {
    body: { noteId },
  })

  if (error) throw error
}

export async function createSignedMasterNoteAudioUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { data, error } = await supabase.storage
    .from(MASTER_NOTES_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw error || new Error('No se pudo generar URL firmada')
  }

  return data.signedUrl
}
