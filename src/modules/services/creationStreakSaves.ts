import { supabase } from '../../lib/supabase'
import { todayKey } from '../utils'
import { notifyCreationMetricsChanged } from './creationMetricsSync'

const CREATION_STREAK_SAVES_LIMIT = 2

export class CreationStreakSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreationStreakSaveError'
  }
}

type SaveCreationStreakDayResultRow = {
  saved_day: string
  saves_used_this_month: number
  saves_left_this_month: number
}

export type CreationStreakSaveState = {
  savedDays: string[]
  savesUsedThisMonth: number
  savesLimit: number
}

function monthBounds(dayKey: string): { monthStart: string; monthEnd: string } {
  const [year, month] = dayKey.split('-').map(Number)
  const safeYear = year || new Date().getFullYear()
  const safeMonth = month || 1
  const lastDay = new Date(safeYear, safeMonth, 0).getDate()
  const monthStart = `${safeYear}-${String(safeMonth).padStart(2, '0')}-01`
  const monthEnd = `${safeYear}-${String(safeMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { monthStart, monthEnd }
}

function mapSaveError(message: string): string {
  if (message.includes('SAVE_LIMIT_REACHED')) {
    return 'Ya usaste tus 2 CongeladICA del mes.'
  }
  if (message.includes('DAY_OUT_OF_CURRENT_MONTH')) {
    return 'Solo puedes salvar días no completados del mes actual.'
  }
  if (message.includes('DAY_NOT_ELIGIBLE')) {
    return 'Solo puedes salvar días pasados no completados.'
  }
  if (message.includes('DAY_ALREADY_COMPLETED')) {
    return 'Ese día ya estaba completado.'
  }
  if (message.includes('DAY_ALREADY_SAVED')) {
    return 'Ese día ya fue congelado.'
  }
  if (message.includes('AUTH_REQUIRED')) {
    return 'Necesitas iniciar sesión para usar CongeladICA.'
  }

  return 'No se pudo salvar la racha ICA.'
}

export async function loadCreationStreakSaveState(): Promise<CreationStreakSaveState> {
  if (!supabase) {
    return {
      savedDays: [],
      savesUsedThisMonth: 0,
      savesLimit: CREATION_STREAK_SAVES_LIMIT,
    }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id

  if (!userId) {
    return {
      savedDays: [],
      savesUsedThisMonth: 0,
      savesLimit: CREATION_STREAK_SAVES_LIMIT,
    }
  }

  const { data: savedRows, error: savedError } = await supabase
    .from('daily_metrics')
    .select('day')
    .eq('user_id', userId)
    .not('creation_streak_saved_at', 'is', null)
    .order('day', { ascending: true })

  if (savedError) throw new CreationStreakSaveError('No se pudo cargar días congelados.')

  const today = todayKey()
  const { monthStart, monthEnd } = monthBounds(today)
  const { count, error: countError } = await supabase
    .from('daily_metrics')
    .select('day', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('day', monthStart)
    .lte('day', monthEnd)
    .not('creation_streak_saved_at', 'is', null)

  if (countError) throw new CreationStreakSaveError('No se pudo cargar el límite mensual de CongeladICA.')

  return {
    savedDays: (savedRows || []).map((row) => row.day),
    savesUsedThisMonth: Number(count || 0),
    savesLimit: CREATION_STREAK_SAVES_LIMIT,
  }
}

export async function saveCreationStreakDay(day?: string): Promise<{
  savedDay: string
  savesUsedThisMonth: number
  savesLeftThisMonth: number
}> {
  if (!supabase) {
    throw new CreationStreakSaveError('CongeladICA no está disponible ahora.')
  }

  const payload = day ? { p_day: day } : {}
  const { data, error } = await supabase.rpc('save_creation_streak_day', payload)

  if (error) {
    throw new CreationStreakSaveError(mapSaveError(error.message || ''))
  }

  const row = (Array.isArray(data) ? data[0] : data) as SaveCreationStreakDayResultRow | null
  if (!row?.saved_day) {
    throw new CreationStreakSaveError('No se pudo confirmar el día congelado.')
  }

  notifyCreationMetricsChanged()

  return {
    savedDay: row.saved_day,
    savesUsedThisMonth: Number(row.saves_used_this_month || 0),
    savesLeftThisMonth: Number(row.saves_left_this_month || 0),
  }
}
