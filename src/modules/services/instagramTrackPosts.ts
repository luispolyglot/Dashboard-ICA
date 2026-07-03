import { supabase } from '@/lib/supabase'
import type { InstagramTrackPostEntry, InstagramTrackPostInput } from '../types'

type InstagramTrackPostRow = {
  id: string
  track_month: string
  day_index: number
  post_url: string | null
  created_at: string
  updated_at: string
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function toInstagramTrackPostEntry(row: InstagramTrackPostRow): InstagramTrackPostEntry {
  return {
    id: row.id,
    trackMonth: row.track_month,
    dayIndex: Number(row.day_index),
    postUrl: row.post_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getCurrentMonthDate(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function getMonthLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  const label = date.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function getTrackPostErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'No se pudo guardar el link de Instagram.'

  if (
    error.message.includes('TRACK_POST_EDIT_WINDOW_EXPIRED')
    || error.message.includes('new row violates row-level security policy')
  ) {
    return 'La ventana de 48 horas para este día ya cerró.'
  }
  if (error.message.includes('TRACK_POST_DAY_NOT_UNLOCKED')) {
    return 'Ese día todavía no está desbloqueado.'
  }
  if (error.message.includes('TRACK_POST_DAY_OUT_OF_RANGE')) {
    return 'Solo se permiten días del 1 al 28.'
  }
  if (error.message.includes('TRACK_POST_URL_INVALID')) {
    return 'El link debe ser de Instagram (instagram.com).'
  }
  if (error.message.includes('TRACK_POST_MONTH_INVALID')) {
    return 'El mes seleccionado no es válido.'
  }

  return error.message || 'No se pudo guardar el link de Instagram.'
}

export function buildTrackPostDayDate(trackMonth: string, dayIndex: number): string {
  const day = Math.max(1, Math.min(28, dayIndex))
  const date = new Date(`${trackMonth}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return trackMonth
  date.setUTCDate(day)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getDayUnlockWindow(trackMonth: string, dayIndex: number, now = new Date()): {
  unlockAt: Date
  closeAt: Date
  isUnlocked: boolean
  isEditable: boolean
} {
  const dayDate = buildTrackPostDayDate(trackMonth, dayIndex)
  const unlockAt = new Date(`${dayDate}T00:00:00Z`)
  const closeAt = new Date(unlockAt.getTime() + 48 * 60 * 60 * 1000)
  const isUnlocked = now.getTime() >= unlockAt.getTime()
  const isEditable = isUnlocked && now.getTime() <= closeAt.getTime()

  return {
    unlockAt,
    closeAt,
    isUnlocked,
    isEditable,
  }
}

export async function listInstagramTrackMonths(
  targetLang: string,
  nativeLang: string,
): Promise<string[]> {
  if (!supabase) return [getCurrentMonthDate()]
  const userId = await getCurrentUserId()
  if (!userId) return [getCurrentMonthDate()]

  const { data, error } = await supabase
    .from('instagram_track_posts')
    .select('track_month')
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .order('track_month', { ascending: false })

  if (error) {
    throw error
  }

  const months = new Set<string>((data || []).map((row) => row.track_month))
  months.add(getCurrentMonthDate())

  return Array.from(months).sort((a, b) => b.localeCompare(a))
}

export async function listInstagramTrackPostsByMonth(
  targetLang: string,
  nativeLang: string,
  trackMonth: string,
): Promise<InstagramTrackPostEntry[]> {
  if (!supabase) return []
  const userId = await getCurrentUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from('instagram_track_posts')
    .select('id, track_month, day_index, post_url, created_at, updated_at')
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .eq('track_month', trackMonth)
    .order('day_index', { ascending: true })

  if (error) {
    throw error
  }

  return (data || []).map((row) => toInstagramTrackPostEntry(row as InstagramTrackPostRow))
}

export async function upsertInstagramTrackPost(input: InstagramTrackPostInput): Promise<InstagramTrackPostEntry> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Necesitas iniciar sesión para guardar links.')
  }

  const payload = {
    user_id: userId,
    target_lang: input.targetLang,
    native_lang: input.nativeLang,
    track_month: input.trackMonth,
    day_index: Math.max(1, Math.min(28, Number(input.dayIndex))),
    post_url: input.postUrl?.trim() || null,
  }

  const { data, error } = await supabase
    .from('instagram_track_posts')
    .upsert(payload, {
      onConflict: 'user_id,target_lang,native_lang,track_month,day_index',
    })
    .select('id, track_month, day_index, post_url, created_at, updated_at')
    .single()

  if (error) {
    throw error
  }

  return toInstagramTrackPostEntry(data as InstagramTrackPostRow)
}
