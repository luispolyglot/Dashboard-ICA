import { supabase } from '@/lib/supabase'
import { t } from '@/i18n'
import type { CoachingTaskAudioAnswer } from './coaching'

// AUDIO TASKS (Luis, 6 Oct): the student records the answer of an audio task and the coach
// answers with an audio, a text or both. The function hands out a signed upload link, the file
// goes straight to the private bucket, and then the function saves it.

const BUCKET = 'coaching-task-audio'

type TaskTarget = {
  sessionId: string
  periodNumber: number
  classIndex: 1 | 2
  taskIndex: 1 | 2 | 3
}

export class CoachingTaskAudioError extends Error {
  code: string | null

  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'CoachingTaskAudioError'
    this.code = code
  }
}

/** Calls coaching-center and keeps the server's own message («La semana está cerrada…»). */
async function callCenter<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  if (!supabase) throw new CoachingTaskAudioError(t('Supabase no está configurado.'))
  const { data, error } = await supabase.functions.invoke<T>('coaching-center', { body })
  if (error) {
    let message = t(fallback)
    let code: string | null = null
    try {
      const context = (error as { context?: Response }).context
      const parsed = context ? ((await context.json()) as { error?: string; code?: string }) : null
      if (parsed?.error) message = t(parsed.error)
      code = parsed?.code ?? null
    } catch {
      // Keep the generic message.
    }
    throw new CoachingTaskAudioError(message, code)
  }
  if (!data) throw new CoachingTaskAudioError(t('Respuesta vacía del servidor.'))
  return data
}

async function uploadBlob(path: string, token: string, blob: Blob): Promise<void> {
  if (!supabase) throw new CoachingTaskAudioError(t('Supabase no está configurado.'))
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, blob, { contentType: (blob.type || 'audio/webm').split(';')[0], upsert: false })
  if (error) throw new CoachingTaskAudioError(t('No se pudo subir el audio. Revisa tu conexión e inténtalo de nuevo.'))
}

/** Student: uploads and sends the audio answer of a task. */
export async function sendStudentTaskAudio(
  input: TaskTarget & { blob: Blob; seconds: number },
): Promise<{ answer: CoachingTaskAudioAnswer; studentCompletedAt: string | null }> {
  const target = {
    sessionId: input.sessionId,
    periodNumber: input.periodNumber,
    classIndex: input.classIndex,
    taskIndex: input.taskIndex,
  }
  const upload = await callCenter<{ path: string; token: string }>(
    { action: 'v2-task-audio-upload-url', ...target, mimeType: (input.blob.type || 'audio/webm').split(';')[0] },
    'No se pudo preparar la subida del audio.',
  )
  await uploadBlob(upload.path, upload.token, input.blob)
  const saved = await callCenter<{ answer: CoachingTaskAudioAnswer; studentCompletedAt: string | null }>(
    { action: 'v2-submit-task-audio', ...target, path: upload.path, seconds: input.seconds },
    'No se pudo enviar el audio.',
  )
  return { answer: saved.answer, studentCompletedAt: saved.studentCompletedAt ?? null }
}

/** Coach: saves the feedback of an audio answer (a new audio, a text, or both). */
export async function saveCoachTaskFeedback(
  input: TaskTarget & {
    feedbackText: string | null
    audio?: { blob: Blob; seconds: number } | null
    removeAudio?: boolean
  },
): Promise<CoachingTaskAudioAnswer> {
  const target = {
    sessionId: input.sessionId,
    periodNumber: input.periodNumber,
    classIndex: input.classIndex,
    taskIndex: input.taskIndex,
  }
  let feedbackAudioPath: string | null = null
  if (input.audio) {
    const upload = await callCenter<{ path: string; token: string }>(
      { action: 'v2-task-feedback-upload-url', ...target, mimeType: (input.audio.blob.type || 'audio/webm').split(';')[0] },
      'No se pudo preparar la subida del audio.',
    )
    await uploadBlob(upload.path, upload.token, input.audio.blob)
    feedbackAudioPath = upload.path
  }
  const saved = await callCenter<{ answer: CoachingTaskAudioAnswer }>(
    {
      action: 'v2-save-task-feedback',
      ...target,
      feedbackText: input.feedbackText,
      feedbackAudioPath,
      feedbackAudioSeconds: input.audio?.seconds ?? null,
      removeFeedbackAudio: Boolean(input.removeAudio),
    },
    'No se pudo guardar el feedback.',
  )
  return saved.answer
}
