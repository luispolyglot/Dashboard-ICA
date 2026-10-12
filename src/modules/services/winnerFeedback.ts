// FEEDBACK A GANADORES (Luis, 11 Oct): super admins find a 21-day challenge winner, listen to their
// latest master notes and keep the Loom link (sent by WhatsApp) and notes on the note.
// Server side: coaching-center actions winner-feedback-search / -notes / -save.
import { supabase } from '@/lib/supabase'

export type WinnerSearchRow = {
  userId: string
  displayName: string | null
  username: string | null
  lastMasterNoteAt: string | null
}

export type WinnerNotePart = {
  id: string
  phrase: string | null
  translation: string | null
  durationMs: number | null
  audioUrl: string | null
}

export type WinnerNote = {
  id: string
  name: string | null
  state: string | null
  targetLang: string | null
  totalDurationMs: number | null
  createdAt: string
  closedAt: string | null
  audioUrl: string | null
  parts: WinnerNotePart[]
  feedbackLoomUrl: string | null
  feedbackNotes: string | null
}

async function call<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.functions.invoke<T>('coaching-center', { body })
  if (error || !data) throw new Error(fallback)
  return data
}

export async function searchWinners(query: string): Promise<WinnerSearchRow[]> {
  const data = await call<{ rows?: WinnerSearchRow[] }>(
    { action: 'winner-feedback-search', query },
    'No se pudo buscar.',
  )
  return Array.isArray(data.rows) ? data.rows : []
}

export async function fetchWinnerNotes(userId: string): Promise<WinnerNote[]> {
  const data = await call<{ notes?: WinnerNote[] }>(
    { action: 'winner-feedback-notes', userId },
    'No se pudieron cargar sus notas maestras.',
  )
  return Array.isArray(data.notes) ? data.notes : []
}

export async function saveWinnerFeedback(input: {
  userId: string
  masterNoteId: string
  feedbackLoomUrl: string
  feedbackNotes: string
}): Promise<void> {
  await call<{ ok?: boolean }>({ action: 'winner-feedback-save', ...input }, 'No se pudo guardar.')
}
