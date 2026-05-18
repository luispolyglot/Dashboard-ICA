import { supabase } from '@/lib/supabase'
import type { MasterNote, MasterNoteChunk } from '../types'

const MASTER_NOTES_BUCKET = 'master-notes'

function getNextMasterNoteNumber(names: string[]): number {
  const maxNumber = names.reduce((max, name) => {
    const match = name.match(/^nota maestra:\s*(\d+)$/i)
    const value = match ? Number(match[1]) : 0
    if (!Number.isFinite(value)) return max
    return Math.max(max, value)
  }, 0)

  return maxNumber + 1
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

export async function fetchMasterNotes(
  targetLang?: string,
  nativeLang?: string,
): Promise<MasterNote[]> {
  if (!supabase) return []

  let query = supabase
    .from('master_notes')
    .select(
      'id, name, state, close_type, total_duration_ms, final_audio_path, target_lang, native_lang, created_at, updated_at, closed_at',
    )
    .order('created_at', { ascending: false })

  if (targetLang) {
    query = query.eq('target_lang', targetLang)
  }
  if (nativeLang) {
    query = query.eq('native_lang', nativeLang)
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []) as MasterNote[]
}

export async function createMasterNote(
  targetLang: string,
  nativeLang: string,
): Promise<MasterNote> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Debes iniciar sesión')

  const { data: existingRows, error: existingError } = await supabase
    .from('master_notes')
    .select('name')

  if (existingError) throw existingError

  const nextNumber = getNextMasterNoteNumber(
    (existingRows || []).map((row) => row.name || ''),
  )
  const generatedName = `Nota Maestra: ${nextNumber}`

  const { data, error } = await supabase
    .from('master_notes')
    .insert({
      user_id: userId,
      name: generatedName,
      state: 'open',
      target_lang: targetLang,
      native_lang: nativeLang,
    })
    .select(
      'id, name, state, close_type, total_duration_ms, final_audio_path, target_lang, native_lang, created_at, updated_at, closed_at',
    )
    .single()

  if (error || !data) throw error || new Error('No se pudo crear la nota maestra')
  return data as MasterNote
}

export async function fetchMasterNoteById(
  noteId: string,
  targetLang?: string,
): Promise<MasterNote | null> {
  if (!supabase) return null

  let query = supabase
    .from('master_notes')
    .select(
      'id, name, state, close_type, total_duration_ms, final_audio_path, target_lang, native_lang, created_at, updated_at, closed_at',
    )
    .eq('id', noteId)

  if (targetLang) {
    query = query.eq('target_lang', targetLang)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return (data as MasterNote | null) || null
}

export async function deleteMasterNote(noteId: string): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { data: chunks, error: chunksError } = await supabase
    .from('master_note_chunks')
    .select('id, storage_path')
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

  const chunkIds = (chunks || []).map((row) => row.id).filter(Boolean)

  if (chunkIds.length > 0) {
    const { error: deleteActivationsBySourceError } = await supabase
      .from('phrase_voice_activations')
      .delete()
      .eq('activation_source', 'master_note_chunk')
      .in('activation_source_id', chunkIds)

    if (deleteActivationsBySourceError) throw deleteActivationsBySourceError
  }

  const chunkPaths = (chunks || []).map((row) => row.storage_path).filter(Boolean)
  if (chunkPaths.length > 0) {
    const { error: deleteActivationsByPathError } = await supabase
      .from('phrase_voice_activations')
      .delete()
      .in('storage_path', chunkPaths)

    if (deleteActivationsByPathError) throw deleteActivationsByPathError
  }

  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(MASTER_NOTES_BUCKET)
      .remove(paths)
    if (removeError) throw removeError
  }

  const { error } = await supabase.from('master_notes').delete().eq('id', noteId)
  if (error) throw error
}

export async function removeMasterNoteChunk(
  noteId: string,
  chunkId: string,
): Promise<number> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { data: noteRow, error: noteError } = await supabase
    .from('master_notes')
    .select('id, state')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError) throw noteError
  if (!noteRow) throw new Error('No se encontró la nota maestra')
  if (noteRow.state !== 'open') {
    throw new Error('Solo puedes editar notas maestras abiertas')
  }

  const { data: chunkRow, error: chunkError } = await supabase
    .from('master_note_chunks')
    .select('id, storage_path')
    .eq('id', chunkId)
    .eq('master_note_id', noteId)
    .maybeSingle()

  if (chunkError) throw chunkError
  if (!chunkRow) throw new Error('No se encontró el audio activado')

  const { error: removeStorageError } = await supabase.storage
    .from(MASTER_NOTES_BUCKET)
    .remove([chunkRow.storage_path])

  if (removeStorageError) throw removeStorageError

  const { error: deleteActivationBySourceError } = await supabase
    .from('phrase_voice_activations')
    .delete()
    .eq('activation_source', 'master_note_chunk')
    .eq('activation_source_id', chunkRow.id)

  if (deleteActivationBySourceError) throw deleteActivationBySourceError

  const { error: deleteActivationByPathError } = await supabase
    .from('phrase_voice_activations')
    .delete()
    .eq('storage_path', chunkRow.storage_path)

  if (deleteActivationByPathError) throw deleteActivationByPathError

  const { error: deleteChunkError } = await supabase
    .from('master_note_chunks')
    .delete()
    .eq('id', chunkRow.id)

  if (deleteChunkError) throw deleteChunkError

  const { data: remainingRows, error: remainingError } = await supabase
    .from('master_note_chunks')
    .select('duration_ms')
    .eq('master_note_id', noteId)

  if (remainingError) throw remainingError

  const totalDurationMs = (remainingRows || []).reduce(
    (sum, row) => sum + (row.duration_ms || 0),
    0,
  )

  const { error: updateNoteError } = await supabase
    .from('master_notes')
    .update({ total_duration_ms: totalDurationMs })
    .eq('id', noteId)

  if (updateNoteError) throw updateNoteError

  return totalDurationMs
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
    .select('id, state, total_duration_ms, target_lang, native_lang')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError) throw noteError
  if (!noteRow) throw new Error('No se encontró la nota maestra')
  if (noteRow.state !== 'open') {
    throw new Error('La nota maestra está cerrada')
  }

  const { data: phraseRow, error: phraseError } = await supabase
    .from('phrase_generations')
    .select('id, target_lang, native_lang')
    .eq('id', phraseGenerationId)
    .maybeSingle()

  if (phraseError) throw phraseError
  if (!phraseRow) {
    throw new Error('No se encontró la frase a activar')
  }

  const noteTargetLang = typeof noteRow.target_lang === 'string' ? noteRow.target_lang.trim() : ''
  const noteNativeLang = typeof noteRow.native_lang === 'string' ? noteRow.native_lang.trim() : ''
  const phraseTargetLang = typeof phraseRow.target_lang === 'string' ? phraseRow.target_lang.trim() : ''
  const phraseNativeLang = typeof phraseRow.native_lang === 'string' ? phraseRow.native_lang.trim() : ''

  if (noteTargetLang && noteNativeLang && phraseTargetLang && phraseNativeLang) {
    if (noteTargetLang !== phraseTargetLang || noteNativeLang !== phraseNativeLang) {
      throw new Error('La frase pertenece a otro idioma y no puede activarse en esta nota')
    }
  }

  if (!noteTargetLang && !noteNativeLang && phraseTargetLang && phraseNativeLang) {
    const { error: updateLangError } = await supabase
      .from('master_notes')
      .update({
        target_lang: phraseTargetLang,
        native_lang: phraseNativeLang,
      })
      .eq('id', noteId)

    if (updateLangError) throw updateLangError
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
      activation_source: 'master_note_chunk',
      activation_source_id: chunkId,
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

function triggerDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function encodeWav(buffers: AudioBuffer[]): Blob {
  const sampleRate = buffers[0]?.sampleRate || 48000
  const channelCount = Math.max(...buffers.map((buffer) => buffer.numberOfChannels), 1)
  const totalSamples = buffers.reduce((sum, buffer) => sum + buffer.length, 0)

  const interleaved = new Float32Array(totalSamples * channelCount)
  let writeOffset = 0

  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1)
        const data = buffer.getChannelData(sourceChannel)
        interleaved[(writeOffset + i) * channelCount + channel] = data[i] || 0
      }
    }
    writeOffset += buffer.length
  }

  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = interleaved.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < interleaved.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function downloadMasterNoteAudio(note: MasterNote): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const baseName = sanitizeFileName(note.name || 'nota-maestra') || 'nota-maestra'

  if (note.close_type === 'final' && note.final_audio_path) {
    const { data: finalBlob, error } = await supabase.storage
      .from(MASTER_NOTES_BUCKET)
      .download(note.final_audio_path)

    if (error || !finalBlob) {
      throw error || new Error('No se pudo descargar el audio final')
    }

    const ext = note.final_audio_path.split('.').pop() || 'webm'
    triggerDownload(finalBlob, `${baseName}.${ext}`)
    return
  }

  const chunks = await fetchMasterNoteChunks(note.id)
  if (chunks.length === 0) {
    throw new Error('No hay audios para descargar en esta nota')
  }

  if (chunks.length === 1) {
    const { data: singleBlob, error } = await supabase.storage
      .from(MASTER_NOTES_BUCKET)
      .download(chunks[0].storage_path)

    if (error || !singleBlob) {
      throw error || new Error('No se pudo descargar el audio')
    }

    const ext = chunks[0].storage_path.split('.').pop() || 'webm'
    triggerDownload(singleBlob, `${baseName}.${ext}`)
    return
  }

  const audioContext = new AudioContext()
  try {
    const audioBuffers: AudioBuffer[] = []

    for (const chunk of chunks) {
      const { data: chunkBlob, error } = await supabase.storage
        .from(MASTER_NOTES_BUCKET)
        .download(chunk.storage_path)

      if (error || !chunkBlob) {
        throw error || new Error('No se pudo descargar un chunk de audio')
      }

      const arrayBuffer = await chunkBlob.arrayBuffer()
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      audioBuffers.push(decoded)
    }

    const wavBlob = encodeWav(audioBuffers)
    triggerDownload(wavBlob, `${baseName}.wav`)
  } finally {
    await audioContext.close().catch(() => null)
  }
}
