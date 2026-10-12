// AUDIO TASKS (Luis, 6 Oct): the coach marks which of the 3 tasks of a class are answered with an
// audio. The student records it, the coach listens and answers with an audio, a text or both.
// Files go to the private bucket «coaching-task-audio» through signed upload links; reading them
// always goes through short signed links made here.

export const TASK_AUDIO_BUCKET = 'coaching-task-audio'
const SIGNED_URL_SECONDS = 60 * 60

export type TaskIndex = 1 | 2 | 3

export type TaskAudioRow = {
  id: string
  class_id: string
  session_id: string
  period_number: number
  class_index: number
  task_index: number
  student_user_id: string
  student_audio_path: string
  student_audio_seconds: number | string | null
  student_sent_at: string
  feedback_text: string | null
  feedback_audio_path: string | null
  feedback_audio_seconds: number | string | null
  feedback_by: string | null
  feedback_at: string | null
}

export type TaskAudioAnswer = {
  taskIndex: TaskIndex
  studentAudioUrl: string | null
  studentAudioSeconds: number | null
  studentSentAt: string
  feedbackText: string | null
  feedbackAudioUrl: string | null
  feedbackAudioSeconds: number | null
  feedbackAt: string | null
}

export const TASK_AUDIO_SELECT =
  'id, class_id, session_id, period_number, class_index, task_index, student_user_id, student_audio_path, student_audio_seconds, student_sent_at, feedback_text, feedback_audio_path, feedback_audio_seconds, feedback_by, feedback_at'

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
}

/** Base type of a recorder MIME («audio/webm;codecs=opus» → «audio/webm»), or null if not allowed. */
export function normalizeAudioMime(value: unknown): string | null {
  const base = String(value || '').split(';')[0].trim().toLowerCase()
  return MIME_EXTENSIONS[base] ? base : null
}

export function normalizeTaskIndex(value: unknown): TaskIndex | null {
  const parsed = Number(value)
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null
}

/** Folder of one task: every file of that task (student and coach) lives under it. */
export function taskAudioFolder(input: {
  sessionId: string
  periodNumber: number
  classIndex: number
  taskIndex: TaskIndex
}): string {
  return `${input.sessionId}/${input.periodNumber}/${input.classIndex}-${input.taskIndex}`
}

export function buildTaskAudioPath(input: {
  sessionId: string
  periodNumber: number
  classIndex: number
  taskIndex: TaskIndex
  who: 'student' | 'coach'
  mime: string
  now?: number
}): string {
  const extension = MIME_EXTENSIONS[input.mime] || 'webm'
  return `${taskAudioFolder(input)}/${input.who}-${input.now ?? Date.now()}.${extension}`
}

/** A path sent back by the app must be one this function handed out for that task and person. */
export function isTaskAudioPathFor(
  path: string,
  input: { sessionId: string; periodNumber: number; classIndex: number; taskIndex: TaskIndex; who: 'student' | 'coach' },
): boolean {
  const prefix = `${taskAudioFolder(input)}/${input.who}-`
  return path.startsWith(prefix) && !path.includes('..') && /^[0-9]+\.[a-z0-9]+$/.test(path.slice(prefix.length))
}

export function taskAudioFlags(row: {
  task_audio_1?: boolean | null
  task_audio_2?: boolean | null
  task_audio_3?: boolean | null
} | null | undefined): [boolean, boolean, boolean] {
  return [Boolean(row?.task_audio_1), Boolean(row?.task_audio_2), Boolean(row?.task_audio_3)]
}

/** A task counts as answered with text or, for audio tasks, with the audio sent. */
export function countAnsweredTasks(
  responses: Array<string | null | undefined>,
  audioTaskIndexes: Set<number>,
): number {
  return [0, 1, 2].filter((index) => Boolean((responses[index] || '').trim()) || audioTaskIndexes.has(index + 1)).length
}

function toSeconds(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function clampAudioSeconds(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(9999, Math.round(parsed * 10) / 10)
}

// deno-lint-ignore no-explicit-any
type AdminClient = any

async function signedUrl(adminClient: AdminClient, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await adminClient.storage.from(TASK_AUDIO_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  return data?.signedUrl || null
}

export async function toTaskAudioAnswer(adminClient: AdminClient, row: TaskAudioRow): Promise<TaskAudioAnswer> {
  const [studentAudioUrl, feedbackAudioUrl] = await Promise.all([
    signedUrl(adminClient, row.student_audio_path),
    signedUrl(adminClient, row.feedback_audio_path),
  ])
  return {
    taskIndex: (normalizeTaskIndex(row.task_index) || 1) as TaskIndex,
    studentAudioUrl,
    studentAudioSeconds: toSeconds(row.student_audio_seconds),
    studentSentAt: row.student_sent_at,
    feedbackText: row.feedback_text,
    feedbackAudioUrl,
    feedbackAudioSeconds: toSeconds(row.feedback_audio_seconds),
    feedbackAt: row.feedback_at,
  }
}

/** Audio answers of a coaching, grouped by class id (with signed links). */
export async function fetchTaskAudioByClass(
  adminClient: AdminClient,
  sessionId: string,
): Promise<{ byClass: Map<string, TaskAudioAnswer[]>; error: string | null }> {
  const { data, error } = await adminClient
    .from('coaching_v2_task_audio')
    .select(TASK_AUDIO_SELECT)
    .eq('session_id', sessionId)
  if (error) return { byClass: new Map(), error: error.message }
  const byClass = new Map<string, TaskAudioAnswer[]>()
  const answers = await Promise.all(
    ((data || []) as TaskAudioRow[]).map(async (row) => ({ classId: row.class_id, answer: await toTaskAudioAnswer(adminClient, row) })),
  )
  for (const { classId, answer } of answers) {
    const list = byClass.get(classId) || []
    list.push(answer)
    byClass.set(classId, list)
  }
  for (const list of byClass.values()) list.sort((a, b) => a.taskIndex - b.taskIndex)
  return { byClass, error: null }
}

/** Removes files a task no longer uses (a re-recorded answer or feedback). Never throws. */
export async function removeTaskAudioFiles(adminClient: AdminClient, paths: Array<string | null | undefined>): Promise<void> {
  const clean = paths.filter((path): path is string => Boolean(path))
  if (clean.length === 0) return
  try {
    await adminClient.storage.from(TASK_AUDIO_BUCKET).remove(clean)
  } catch {
    // An orphan file costs nothing visible; the answer itself is already saved.
  }
}
