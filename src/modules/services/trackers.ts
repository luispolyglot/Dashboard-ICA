import { supabase } from '@/lib/supabase'
import type { ImprovementTracker, ImprovementTrackerInput } from '../types'

export const TRACKERS_MIN_YEAR = 2025
export const TRACKERS_MIN_MONTH = 9
export const TRACKERS_MIN_MONTH_DATE = `${TRACKERS_MIN_YEAR}-${String(TRACKERS_MIN_MONTH).padStart(2, '0')}-01`

type ImprovementTrackerRow = {
  id: string
  tracker_month: string
  pronunciation_pct: number | string
  fluency_pct: number | string
  improvisation_pct: number | string
  created_at: string
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function toImprovementTracker(row: ImprovementTrackerRow): ImprovementTracker {
  return {
    id: row.id,
    trackerMonth: row.tracker_month,
    pronunciationPct: Number(row.pronunciation_pct ?? 0),
    fluencyPct: Number(row.fluency_pct ?? 0),
    improvisationPct: Number(row.improvisation_pct ?? 0),
    createdAt: row.created_at,
  }
}

export function getCurrentMonthDate(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function buildTrackerMonthDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function isTrackerMonthWithinRange(year: number, month: number, now = new Date()): boolean {
  const candidate = buildTrackerMonthDate(year, month)
  const maxMonth = getCurrentMonthDate(now)
  return candidate >= TRACKERS_MIN_MONTH_DATE && candidate <= maxMonth
}

export function getTrackerMonthLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function getTrackerInsertErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'No se pudo guardar el tracker.'
  if (error.message.includes('TRACKER_MONTH_TOO_OLD')) {
    return 'Solo se admiten trackers desde septiembre de 2025.'
  }
  if (error.message.includes('TRACKER_MONTH_IN_FUTURE')) {
    return 'No puedes crear trackers en meses futuros.'
  }
  if (error.message.includes('TRACKER_MONTH_MUST_BE_MONTH_START')) {
    return 'El mes seleccionado no es válido.'
  }
  if (error.message.includes('duplicate key') || error.message.includes('improvement_trackers_unique_month')) {
    return 'Ya existe un tracker para ese mes.'
  }
  return error.message || 'No se pudo guardar el tracker.'
}

export function getTrackerUpdateErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'No se pudo actualizar el tracker.'
  if (error.message.includes('TRACKER_MONTH_TOO_OLD')) {
    return 'Solo se admiten trackers desde septiembre de 2025.'
  }
  if (error.message.includes('TRACKER_MONTH_IN_FUTURE')) {
    return 'No puedes mover trackers a meses futuros.'
  }
  if (error.message.includes('TRACKER_MONTH_MUST_BE_MONTH_START')) {
    return 'El mes seleccionado no es válido.'
  }
  if (error.message.includes('duplicate key') || error.message.includes('improvement_trackers_unique_month')) {
    return 'Ya existe un tracker para ese mes.'
  }
  return error.message || 'No se pudo actualizar el tracker.'
}

export async function listImprovementTrackers(
  targetLang: string,
  nativeLang: string,
): Promise<ImprovementTracker[]> {
  if (!supabase) return []
  const userId = await getCurrentUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from('improvement_trackers')
    .select('id, tracker_month, pronunciation_pct, fluency_pct, improvisation_pct, created_at')
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .order('tracker_month', { ascending: false })

  if (error) {
    throw error
  }

  return (data || []).map((row) => toImprovementTracker(row as ImprovementTrackerRow))
}

export async function createImprovementTracker(
  input: ImprovementTrackerInput,
): Promise<ImprovementTracker> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Necesitas iniciar sesión para guardar trackers.')
  }

  const payload = {
    user_id: userId,
    target_lang: input.targetLang,
    native_lang: input.nativeLang,
    tracker_month: input.trackerMonth,
    pronunciation_pct: Math.max(0, Math.min(100, Number(input.pronunciationPct.toFixed(2)))),
    fluency_pct: Math.max(0, Math.min(100, Number(input.fluencyPct.toFixed(2)))),
    improvisation_pct: Math.max(0, Math.min(100, Number(input.improvisationPct.toFixed(2)))),
  }

  const { data, error } = await supabase
    .from('improvement_trackers')
    .insert(payload)
    .select('id, tracker_month, pronunciation_pct, fluency_pct, improvisation_pct, created_at')
    .single()

  if (error) {
    throw error
  }

  return toImprovementTracker(data as ImprovementTrackerRow)
}

export async function getImprovementTrackerById(
  trackerId: string,
  targetLang: string,
  nativeLang: string,
): Promise<ImprovementTracker | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('improvement_trackers')
    .select('id, tracker_month, pronunciation_pct, fluency_pct, improvisation_pct, created_at')
    .eq('id', trackerId)
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) return null
  return toImprovementTracker(data as ImprovementTrackerRow)
}

export async function updateImprovementTracker(
  trackerId: string,
  input: ImprovementTrackerInput,
): Promise<ImprovementTracker> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Necesitas iniciar sesión para actualizar trackers.')
  }

  const payload = {
    tracker_month: input.trackerMonth,
    pronunciation_pct: Math.max(0, Math.min(100, Number(input.pronunciationPct.toFixed(2)))),
    fluency_pct: Math.max(0, Math.min(100, Number(input.fluencyPct.toFixed(2)))),
    improvisation_pct: Math.max(0, Math.min(100, Number(input.improvisationPct.toFixed(2)))),
  }

  const { data, error } = await supabase
    .from('improvement_trackers')
    .update(payload)
    .eq('id', trackerId)
    .eq('user_id', userId)
    .eq('target_lang', input.targetLang)
    .eq('native_lang', input.nativeLang)
    .select('id, tracker_month, pronunciation_pct, fluency_pct, improvisation_pct, created_at')
    .single()

  if (error) {
    throw error
  }

  return toImprovementTracker(data as ImprovementTrackerRow)
}

export async function deleteImprovementTracker(
  trackerId: string,
  targetLang: string,
  nativeLang: string,
): Promise<void> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Necesitas iniciar sesión para eliminar trackers.')
  }

  const { error } = await supabase
    .from('improvement_trackers')
    .delete()
    .eq('id', trackerId)
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)

  if (error) {
    throw error
  }
}
