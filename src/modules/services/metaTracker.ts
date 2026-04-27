import { supabase } from '../../lib/supabase'
import type { MetaTrackerProfile, MetaTrackerStartLevel } from '../types'

type SaveMetaTrackerInput = {
  startLevel: MetaTrackerStartLevel
  priorIcaWords: number
  confirmedAt: number
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function toProfile(row: {
  start_level: string
  prior_ica_words: number
  activation_words_total: number
  confirmed_at: string | null
}): MetaTrackerProfile {
  return {
    startLevel: (row.start_level || '0') as MetaTrackerStartLevel,
    priorIcaWords: Number(row.prior_ica_words || 0),
    activationWordsTotal: Number(row.activation_words_total || 0),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).getTime() : null,
  }
}

export async function loadMetaTrackerProfile(
  targetLang: string,
  nativeLang: string,
): Promise<MetaTrackerProfile | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  try {
    const { data, error } = await supabase
      .from('user_meta_tracker')
      .select('start_level, prior_ica_words, activation_words_total, confirmed_at')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .maybeSingle()

    if (error) throw error
    if (!data) return null
    return toProfile(data)
  } catch {
    return null
  }
}

export async function saveMetaTrackerProfile(
  targetLang: string,
  nativeLang: string,
  input: SaveMetaTrackerInput,
): Promise<MetaTrackerProfile | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data: existing, error: existingError } = await supabase
    .from('user_meta_tracker')
    .select('activation_words_total')
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .maybeSingle()

  if (existingError) throw existingError

  let initialActivationWords = Number(existing?.activation_words_total || 0)
  if (!existing) {
    const { data: activationRows, error: activationError } = await supabase
      .from('lexicards')
      .select('id')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .gt('activation_count', 0)

    if (activationError) throw activationError

    initialActivationWords = (activationRows || []).length
  }

  const payload = {
    user_id: userId,
    target_lang: targetLang,
    native_lang: nativeLang,
    start_level: input.startLevel,
    prior_ica_words: Math.max(0, Math.floor(input.priorIcaWords)),
    activation_words_total: initialActivationWords,
    confirmed_at: new Date(input.confirmedAt).toISOString(),
  }

  const { data, error } = await supabase
    .from('user_meta_tracker')
    .upsert(payload, { onConflict: 'user_id,target_lang,native_lang' })
    .select('start_level, prior_ica_words, activation_words_total, confirmed_at')
    .single()

  if (error) {
    throw error
  }

  return toProfile(data)
}

export async function fetchWordActivationCounts(
  lexicardIds: string[],
  targetLang: string,
  nativeLang: string,
): Promise<Record<string, number>> {
  if (!supabase) return {}
  const userId = await getCurrentUserId()
  if (!userId) return {}

  const ids = Array.from(new Set(lexicardIds.filter((id) => id.length > 0)))
  if (ids.length === 0) return {}

  try {
    const { data, error } = await supabase
      .from('lexicards')
      .select('id, activation_count')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .in('id', ids)

    if (error) throw error

    const map: Record<string, number> = {}
    for (const row of data || []) {
      map[row.id] = Number(row.activation_count || 0)
    }

    return map
  } catch {
    return {}
  }
}

export async function registerWordActivations(
  lexicardIds: string[],
  targetLang: string,
  nativeLang: string,
  sourceWords: string[] = [],
): Promise<number | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const ids = lexicardIds.filter((id) => id.length > 0)

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

  let activationIds = Array.from(new Set(ids.filter((id) => isUuid(id))))

  if (activationIds.length === 0 && sourceWords.length > 0) {
    const normalizedWords = Array.from(
      new Set(sourceWords.map((word) => word.trim().toLowerCase()).filter(Boolean)),
    )

    const { data: scopedRows, error: scopedRowsError } = await supabase
      .from('lexicards')
      .select('id, target')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)

    if (scopedRowsError) {
      console.error('Could not resolve lexicard ids by words', scopedRowsError)
      return null
    }

    let rows = scopedRows || []

    if (rows.length === 0) {
      const { data: legacyRows, error: legacyRowsError } = await supabase
        .from('lexicards')
        .select('id, target')
        .eq('user_id', userId)
        .is('target_lang', null)
        .is('native_lang', null)

      if (legacyRowsError) {
        console.error('Could not resolve legacy lexicard ids by words', legacyRowsError)
        return null
      }

      rows = legacyRows || []
    }

    const byTarget = new Map<string, string>()
    for (const row of rows) {
      const normalizedTarget = String(row.target || '').trim().toLowerCase()
      if (!normalizedTarget || byTarget.has(normalizedTarget)) continue
      byTarget.set(normalizedTarget, String(row.id))
    }

    activationIds = normalizedWords
      .map((word) => byTarget.get(word) || '')
      .filter((id) => id.length > 0)
  }

  if (activationIds.length === 0) return null

  try {
    const { data, error } = await supabase.rpc('register_lexicard_activations', {
      p_lexicard_ids: activationIds,
      p_target_lang: targetLang,
      p_native_lang: nativeLang,
    })

    if (error) throw error

    const total = Array.isArray(data)
      ? Number(data[0]?.activation_words_total)
      : Number(data?.activation_words_total)

    return Number.isFinite(total) ? total : null
  } catch (error) {
    console.error('register_lexicard_activations RPC failed, using fallback', error)
  }

  try {
    const countsById = new Map<string, number>()
    for (const id of activationIds) {
      countsById.set(id, (countsById.get(id) || 0) + 1)
    }

    const uniqueIds = Array.from(countsById.keys())
    const { data: rows, error: rowsError } = await supabase
      .from('lexicards')
      .select('id, user_id, target_lang, native_lang, activation_count, first_activated_at')
      .eq('user_id', userId)
      .in('id', uniqueIds)

    if (rowsError) throw rowsError

    const validRows = (rows || []).filter(
      (row) =>
        (row.target_lang || targetLang) === targetLang
        && (row.native_lang || nativeLang) === nativeLang,
    )

    let newlyActivated = 0
    for (const row of validRows) {
      const delta = countsById.get(row.id) || 0
      if (delta <= 0) continue
      const wasInactive = Number(row.activation_count || 0) <= 0

      const nextCount = Number(row.activation_count || 0) + delta
      const nowIso = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('lexicards')
        .update({
          activation_count: nextCount,
          first_activated_at: row.first_activated_at || nowIso,
          last_activated_at: nowIso,
        })
        .eq('id', row.id)
        .eq('user_id', userId)

      if (updateError) throw updateError
      if (wasInactive) newlyActivated += 1
    }

    const { data: tracker, error: trackerError } = await supabase
      .from('user_meta_tracker')
      .select('activation_words_total')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .maybeSingle()

    if (trackerError) throw trackerError

    const currentTotal = Number(tracker?.activation_words_total || 0)
    const nextTotal = currentTotal + newlyActivated

    const { error: upsertError } = await supabase
      .from('user_meta_tracker')
      .upsert(
        {
          user_id: userId,
          target_lang: targetLang,
          native_lang: nativeLang,
          activation_words_total: nextTotal,
        },
        { onConflict: 'user_id,target_lang,native_lang' },
      )

    if (upsertError) throw upsertError

    return nextTotal
  } catch (fallbackError) {
    console.error('registerWordActivations fallback failed', fallbackError)
    return null
  }
}
