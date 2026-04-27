import { supabase } from '../../lib/supabase'
import type { AppConfig, DailyProgressMap, Lexicard } from '../types'

const CREATION_GOAL_DEFAULT = 5
const REVIEW_GOAL_DEFAULT = 10

type DashboardStorageKey =
  | 'dashboard-ICA-words'
  | 'dashboard-ICA-config'
  | 'dashboard-ICA-completed'
  | 'dashboard-ICA-creation-days'
  | 'dashboard-ICA-daily-progress'
  | 'dashboard-ICA-review-session'

function assertSupportedKey(key: string): asserts key is DashboardStorageKey {
  const supported: DashboardStorageKey[] = [
    'dashboard-ICA-words',
    'dashboard-ICA-config',
    'dashboard-ICA-completed',
    'dashboard-ICA-creation-days',
    'dashboard-ICA-daily-progress',
    'dashboard-ICA-review-session',
  ]

  if (!supported.includes(key as DashboardStorageKey)) {
    throw new Error(`Clave de storage no soportada: ${key}`)
  }
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function loadLocalNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveLocalNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // noop
  }
}

function toIsoFromMillis(value: number | null): string | null {
  return value ? new Date(value).toISOString() : null
}

function toMillisFromIso(value: string | null): number | null {
  return value ? new Date(value).getTime() : null
}

async function loadWords(userId: string): Promise<Lexicard[]> {
  if (!supabase) return []

  const { data: settings } = await supabase
    .from('user_settings')
    .select('native_lang, target_lang')
    .eq('user_id', userId)
    .maybeSingle()

  const activeNative = settings?.native_lang || null
  const activeTarget = settings?.target_lang || null

  const mapRows = (rows: Array<Record<string, unknown>>): Lexicard[] =>
    rows.map((row) => ({
      id: String(row.id),
      target: String(row.target),
      native: String(row.native),
      targetLang: typeof row.target_lang === 'string' ? row.target_lang : undefined,
      nativeLang: typeof row.native_lang === 'string' ? row.native_lang : undefined,
      examplePhrase: typeof row.example_phrase === 'string' ? row.example_phrase : null,
      exampleTranslation: typeof row.example_translation === 'string' ? row.example_translation : null,
      importance: row.importance as Lexicard['importance'],
      interval: Number(row.interval),
      easeFactor: Number(row.ease_factor),
      streak: Number(row.streak),
      activationCount: typeof row.activation_count === 'number' ? row.activation_count : 0,
      firstActivatedAt: toMillisFromIso((row.first_activated_at as string | null) || null),
      lastActivatedAt: toMillisFromIso((row.last_activated_at as string | null) || null),
      lastReviewed: toMillisFromIso((row.last_reviewed_at as string | null) || null),
      lastSeenSession: typeof row.last_seen_session === 'number' ? row.last_seen_session : undefined,
      createdAt: new Date(String(row.created_at)).getTime(),
    }))

  const baseSelection = [
    'id',
    'target',
    'native',
    'importance',
    'interval',
    'ease_factor',
    'streak',
    'last_reviewed_at',
    'created_at',
    'target_lang',
    'native_lang',
    'example_phrase',
    'example_translation',
    'last_seen_session',
    'activation_count',
    'first_activated_at',
    'last_activated_at',
  ].join(', ')

  try {
    let query = supabase
      .from('lexicards')
      .select(baseSelection)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (activeNative && activeTarget) {
      query = query
        .eq('native_lang', activeNative)
        .eq('target_lang', activeTarget)
    }

    const { data, error } = await query
    if (error) throw error

    const mapped = mapRows((data || []) as unknown as Array<Record<string, unknown>>)
    if (mapped.length > 0 || !activeNative || !activeTarget) {
      return mapped
    }

    const { data: legacyRows, error: legacyError } = await supabase
      .from('lexicards')
      .select(baseSelection)
      .eq('user_id', userId)
      .is('native_lang', null)
      .is('target_lang', null)
      .order('created_at', { ascending: true })

    if (legacyError) {
      return mapped
    }

    return mapRows((legacyRows || []) as unknown as Array<Record<string, unknown>>).map((card) => ({
      ...card,
      nativeLang: activeNative,
      targetLang: activeTarget,
    }))
  } catch {
    const { data, error } = await supabase
      .from('lexicards')
      .select('id, target, native, importance, interval, ease_factor, streak, last_reviewed_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return mapRows((data || []) as unknown as Array<Record<string, unknown>>)
  }
}

async function saveWords(userId: string, cards: Lexicard[]): Promise<void> {
  if (!supabase) return

  const { data: settings } = await supabase
    .from('user_settings')
    .select('native_lang, target_lang')
    .eq('user_id', userId)
    .maybeSingle()

  const scopedNative = settings?.native_lang || cards[0]?.nativeLang || null
  const scopedTarget = settings?.target_lang || cards[0]?.targetLang || null

  const payload = cards.map((card) => ({
    id: card.id,
    user_id: userId,
    target: card.target,
    native: card.native,
    target_lang: card.targetLang || null,
    native_lang: card.nativeLang || null,
    example_phrase: card.examplePhrase || null,
    example_translation: card.exampleTranslation || null,
    importance: card.importance,
    interval: card.interval,
    ease_factor: card.easeFactor,
    streak: card.streak,
    last_reviewed_at: toIsoFromMillis(card.lastReviewed),
    last_seen_session: card.lastSeenSession ?? null,
    created_at: new Date(card.createdAt).toISOString(),
  }))

  if (payload.length > 0) {
    try {
      const { error } = await supabase.from('lexicards').upsert(payload)
      if (error) throw error
    } catch {
      const legacyPayload = cards.map((card) => ({
        id: card.id,
        user_id: userId,
        target: card.target,
        native: card.native,
        importance: card.importance,
        interval: card.interval,
        ease_factor: card.easeFactor,
        streak: card.streak,
        last_reviewed_at: toIsoFromMillis(card.lastReviewed),
        created_at: new Date(card.createdAt).toISOString(),
      }))
      const { error } = await supabase.from('lexicards').upsert(legacyPayload)
      if (error) throw error
    }
  }

  let existingRowsQuery = supabase
    .from('lexicards')
    .select('id')
    .eq('user_id', userId)

  if (scopedNative && scopedTarget) {
    existingRowsQuery = existingRowsQuery
      .eq('native_lang', scopedNative)
      .eq('target_lang', scopedTarget)
  } else {
    existingRowsQuery = existingRowsQuery
      .is('native_lang', null)
      .is('target_lang', null)
  }

  const { data: existingRows, error: existingError } = await existingRowsQuery

  if (existingError) throw existingError

  const nextIds = new Set(cards.map((card) => card.id))
  const idsToDelete = (existingRows || [])
    .map((row) => row.id)
    .filter((id) => !nextIds.has(id))

  if (idsToDelete.length > 0) {
    let deleteQuery = supabase
      .from('lexicards')
      .delete()
      .eq('user_id', userId)

    if (scopedNative && scopedTarget) {
      deleteQuery = deleteQuery
        .eq('native_lang', scopedNative)
        .eq('target_lang', scopedTarget)
    } else {
      deleteQuery = deleteQuery
        .is('native_lang', null)
        .is('target_lang', null)
    }

    const { error } = await deleteQuery.in('id', idsToDelete)
    if (error) throw error
  }
}

async function loadConfig(userId: string): Promise<AppConfig | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_settings')
    .select('native_lang, target_lang, cefr_level')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    nativeLang: data.native_lang,
    targetLang: data.target_lang,
    level: data.cefr_level,
  }
}

async function saveConfig(userId: string, config: AppConfig): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    native_lang: config.nativeLang,
    target_lang: config.targetLang,
    cefr_level: config.level,
  })
  if (error) throw error
}

function toGoalType(key: DashboardStorageKey): 'review_goal' | 'creation_goal' | null {
  if (key === 'dashboard-ICA-completed') return 'review_goal'
  if (key === 'dashboard-ICA-creation-days') return 'creation_goal'
  return null
}

async function loadGoalDays(userId: string, goalType: 'review_goal' | 'creation_goal'): Promise<string[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('goal_completions')
    .select('day')
    .eq('user_id', userId)
    .eq('goal_type', goalType)
    .eq('completed', true)
    .order('day', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => row.day)
}

async function saveGoalDays(
  userId: string,
  goalType: 'review_goal' | 'creation_goal',
  days: string[],
): Promise<void> {
  if (!supabase) return

  const uniqueDays = Array.from(new Set(days)).sort()
  const payload = uniqueDays.map((day) => ({
    user_id: userId,
    day,
    goal_type: goalType,
    completed: true,
    progress_value: 1,
    target_value: 1,
  }))

  if (payload.length > 0) {
    const { error } = await supabase
      .from('goal_completions')
      .upsert(payload, { onConflict: 'user_id,day,goal_type' })
    if (error) throw error
  }

  const { data: existing, error: existingError } = await supabase
    .from('goal_completions')
    .select('day')
    .eq('user_id', userId)
    .eq('goal_type', goalType)

  if (existingError) throw existingError

  const nextDaySet = new Set(uniqueDays)
  const daysToDelete = (existing || []).map((row) => row.day).filter((day) => !nextDaySet.has(day))

  if (daysToDelete.length > 0) {
    const { error } = await supabase
      .from('goal_completions')
      .delete()
      .eq('user_id', userId)
      .eq('goal_type', goalType)
      .in('day', daysToDelete)
    if (error) throw error
  }
}

async function loadDailyProgress(userId: string): Promise<DailyProgressMap> {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('day, words_added, phrase_generated, correct_reviews')
    .eq('user_id', userId)

  if (error) throw error

  const map: DailyProgressMap = {}
  for (const row of data || []) {
    map[row.day] = {
      wordsAdded: row.words_added,
      phraseGenerated: row.phrase_generated,
      reviewCorrect: row.correct_reviews ?? 0,
    }
  }

  return map
}

async function saveDailyProgress(userId: string, progress: DailyProgressMap): Promise<void> {
  if (!supabase) return

  const entries = Object.entries(progress)
  const payload = entries.map(([day, value]) => ({
    user_id: userId,
    day,
    words_added: value.wordsAdded,
    phrase_generated: value.phraseGenerated,
    correct_reviews: value.reviewCorrect,
    review_goal_completed: value.reviewCorrect >= REVIEW_GOAL_DEFAULT,
    creation_goal_completed: value.wordsAdded >= CREATION_GOAL_DEFAULT && value.phraseGenerated,
  }))

  if (payload.length > 0) {
    const { error } = await supabase
      .from('daily_metrics')
      .upsert(payload, { onConflict: 'user_id,day' })
    if (error) throw error
  }

  const { data: existing, error: existingError } = await supabase
    .from('daily_metrics')
    .select('day')
    .eq('user_id', userId)

  if (existingError) throw existingError

  const nextDaySet = new Set(entries.map(([day]) => day))
  const daysToDelete = (existing || []).map((row) => row.day).filter((day) => !nextDaySet.has(day))

  if (daysToDelete.length > 0) {
    const { error } = await supabase
      .from('daily_metrics')
      .delete()
      .eq('user_id', userId)
      .in('day', daysToDelete)
    if (error) throw error
  }
}

export async function loadData<T>(key: string, fallback: T): Promise<T> {
  try {
    assertSupportedKey(key)

    if (key === 'dashboard-ICA-review-session') {
      return loadLocalNumber(key, Number(fallback) || 0) as T
    }

    const userId = await getCurrentUserId()
    if (!userId) return fallback

    if (key === 'dashboard-ICA-words') {
      return (await loadWords(userId)) as T
    }

    if (key === 'dashboard-ICA-config') {
      return ((await loadConfig(userId)) ?? fallback) as T
    }

    if (key === 'dashboard-ICA-daily-progress') {
      return (await loadDailyProgress(userId)) as T
    }

    const goalType = toGoalType(key)
    if (goalType) {
      return (await loadGoalDays(userId, goalType)) as T
    }

    return fallback
  } catch {
    return fallback
  }
}

export async function saveData<T>(key: string, value: T): Promise<void> {
  try {
    assertSupportedKey(key)

    if (key === 'dashboard-ICA-review-session') {
      saveLocalNumber(key, Number(value) || 0)
      return
    }

    const userId = await getCurrentUserId()
    if (!userId) return

    if (key === 'dashboard-ICA-words') {
      await saveWords(userId, value as Lexicard[])
      return
    }

    if (key === 'dashboard-ICA-config') {
      await saveConfig(userId, value as AppConfig)
      return
    }

    if (key === 'dashboard-ICA-daily-progress') {
      await saveDailyProgress(userId, value as DailyProgressMap)
      return
    }

    const goalType = toGoalType(key)
    if (goalType) {
      await saveGoalDays(userId, goalType, value as string[])
    }
  } catch (error) {
    console.error(error)
  }
}
