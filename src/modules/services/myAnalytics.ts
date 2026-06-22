import { supabase } from '@/lib/supabase'

export type MonthlyAnalyticsKpis = {
  wordsAdded: number
  phrasesCreated: number
  masterNotesClosed: number
  masterNotesListenedMinutes: number
  flashcardsCorrect: number
}

function parseMonthCode(monthCode: string): { startIso: string; endIso: string } {
  const cleanCode = monthCode.trim()
  const match = cleanCode.match(/^(0[1-9]|1[0-2])(\d{4})$/)
  if (!match) {
    throw new Error('Mes invalido. Usa formato MMAAAA.')
  }

  const month = Number(match[1])
  const year = Number(match[2])
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

export async function fetchMyMonthlyAnalytics(
  monthCode: string,
  userId: string,
  targetLang: string,
  nativeLang: string,
): Promise<MonthlyAnalyticsKpis> {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.')
  }

  if (!userId) {
    throw new Error('No se pudo identificar al usuario actual.')
  }
  if (!targetLang || !nativeLang) {
    throw new Error('Configura idioma objetivo y materno para ver analiticas.')
  }

  const { startIso, endIso } = parseMonthCode(monthCode)
  const normalizedTargetLang = targetLang.trim().toLowerCase()
  const normalizedNativeLang = nativeLang.trim().toLowerCase()

  const startDay = startIso.slice(0, 10)
  const endDay = endIso.slice(0, 10)

  const [wordsRes, phrasesRes, notesRes, reviewsRes, listeningRes] = await Promise.all([
    supabase
      .from('lexicards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('phrase_generations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('success', true)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('master_notes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('state', 'closed')
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .gte('closed_at', startIso)
      .lt('closed_at', endIso),
    supabase
      .from('lexicard_reviews')
      .select('id, lexicards!inner(id)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('knew', true)
      .eq('lexicards.target_lang', targetLang)
      .eq('lexicards.native_lang', nativeLang)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('master_note_listening_daily_metrics')
      .select('listened_seconds')
      .eq('user_id', userId)
      .ilike('target_lang', normalizedTargetLang)
      .ilike('native_lang', normalizedNativeLang)
      .gte('day', startDay)
      .lt('day', endDay),
  ])

  if (wordsRes.error) throw wordsRes.error
  if (phrasesRes.error) throw phrasesRes.error
  if (notesRes.error) throw notesRes.error
  if (reviewsRes.error) throw reviewsRes.error
  if (listeningRes.error) throw listeningRes.error

  const listenedSeconds = (listeningRes.data || []).reduce((sum, row) => {
    const value = Number((row as { listened_seconds?: number }).listened_seconds || 0)
    return sum + (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0)
  }, 0)

  return {
    wordsAdded: wordsRes.count ?? 0,
    phrasesCreated: phrasesRes.count ?? 0,
    masterNotesClosed: notesRes.count ?? 0,
    masterNotesListenedMinutes: Math.floor(listenedSeconds / 60),
    flashcardsCorrect: reviewsRes.count ?? 0,
  }
}
