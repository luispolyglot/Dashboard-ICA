import { supabase } from '../../lib/supabase'
import { notifyActivationMetricsChanged } from './creationMetricsSync'
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

function normalizeActivationToken(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^\d+[\).\-:]\s*/u, '')
    .replace(/^[•\-]\s*/u, '')
    .toLowerCase()
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
  phraseGenerationId: string,
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
      new Set(sourceWords.map((word) => normalizeActivationToken(word)).filter(Boolean)),
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
      const normalizedTarget = normalizeActivationToken(String(row.target || ''))
      if (!normalizedTarget || byTarget.has(normalizedTarget)) continue
      byTarget.set(normalizedTarget, String(row.id))
    }

    activationIds = normalizedWords
      .map((word) => byTarget.get(word) || '')
      .filter((id) => id.length > 0)
  }

  if (activationIds.length === 0) return null

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(phraseGenerationId)) {
    return null
  }

  try {
    const { data, error } = await supabase.rpc('register_phrase_lexicard_activations', {
      p_phrase_generation_id: phraseGenerationId,
      p_lexicard_ids: activationIds,
      p_target_lang: targetLang,
      p_native_lang: nativeLang,
    })

    if (error) throw error

    const total = Array.isArray(data)
      ? Number(data[0]?.activation_words_total)
      : Number(data?.activation_words_total)

    notifyActivationMetricsChanged()

    return Number.isFinite(total) ? total : null
  } catch (error) {
    console.error('register_phrase_lexicard_activations RPC failed', error)
    return null
  }
}
