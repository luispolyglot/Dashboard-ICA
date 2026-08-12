import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

type AuthedUser = {
  userId: string
  client: SupabaseClient
}

const supabaseUrl =
  process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || 'http://127.0.0.1:54321'
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing envs for integration tests: SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.',
  )
}

const createdUserIds: string[] = []
const createdWhitelistEmails: string[] = []

let adminClient: SupabaseClient

function makeRandomEmail(): string {
  return `integration.flow.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`
}

function makeRandomPassword(): string {
  return `Pwd!${Math.random().toString(36).slice(2)}${Date.now()}`
}

async function createAuthenticatedUser(): Promise<AuthedUser> {
  const email = makeRandomEmail()
  const password = makeRandomPassword()

  const { error: whitelistError } = await adminClient.from('auth_whitelist').upsert({
    email,
    can_register: true,
    can_login: true,
    source: 'integration_test',
  })
  if (whitelistError) throw whitelistError
  createdWhitelistEmails.push(email)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) throw createError
  if (!created.user?.id) throw new Error('Could not create integration test user')

  createdUserIds.push(created.user.id)

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  return {
    userId: created.user.id,
    client,
  }
}

async function cleanupCreatedIntegrationData(): Promise<void> {
  const userIds = createdUserIds.splice(0)
  for (const userId of userIds) {
    const { error: hardDeleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (!hardDeleteError) continue
    if (hardDeleteError.message.toLowerCase().includes('not found')) continue

    const { error: softDeleteError } = await adminClient.auth.admin.deleteUser(userId, true)
    if (softDeleteError && !softDeleteError.message.toLowerCase().includes('not found')) {
      throw softDeleteError
    }
  }

  const whitelistEmails = [...new Set(createdWhitelistEmails.splice(0))]
  if (whitelistEmails.length === 0) return

  const { error } = await adminClient
    .from('auth_whitelist')
    .delete()
    .in('email', whitelistEmails)

  if (error) throw error
}

beforeAll(() => {
  adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
})

afterEach(async () => {
  await cleanupCreatedIntegrationData()
})

afterAll(async () => {
  await cleanupCreatedIntegrationData()
})

describe('end-to-end user flow (creation + activations + reviews)', () => {
  it('completes ICA and flashcards streak in same day', async () => {
    const { client, userId } = await createAuthenticatedUser()
    const day = new Date().toISOString().slice(0, 10)
    const targetLang = 'Inglés'
    const nativeLang = 'Español'

    const firstBatchWords = ['Whose', 'Instead', 'Obey', 'Although', 'Despite']
    const secondBatchWords = ['Meanwhile', 'Unless', 'Whether', 'Towards', 'Beyond']

    const insertBatch = async (words: string[], startIndex: number): Promise<string[]> => {
      const rows = words.map((word, idx) => ({
        user_id: userId,
        target: word,
        native: `native-${startIndex + idx + 1}`,
        importance: 'frequent',
        target_lang: targetLang,
        native_lang: nativeLang,
      }))
      const { data, error } = await adminClient
        .from('lexicards')
        .insert(rows)
        .select('id')
      expect(error).toBeNull()
      return (data || []).map((row) => String(row.id))
    }

    const firstIds = await insertBatch(firstBatchWords, 0)

    for (let i = 1; i <= 5; i += 1) {
      const { error } = await client.rpc('bump_daily_creation_metrics', {
        p_day: day,
        p_words_added: i,
        p_phrase_generated: false,
        p_xp_delta: 5,
      })
      expect(error).toBeNull()
    }

    const { data: afterFiveWords, error: afterFiveWordsError } = await adminClient
      .from('daily_metrics')
      .select('words_added, phrase_generated, creation_goal_completed')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(afterFiveWordsError).toBeNull()
    expect(afterFiveWords?.words_added).toBe(5)
    expect(afterFiveWords?.phrase_generated).toBe(false)
    expect(afterFiveWords?.creation_goal_completed).toBe(false)

    const { data: phraseData, error: phraseError } = await adminClient
      .from('phrase_generations')
      .insert({
        user_id: userId,
        source_words: firstBatchWords,
        generated_phrase: 'Whose instead obey although despite',
        translation: 'frase de activacion',
        success: true,
        target_lang: targetLang,
        native_lang: nativeLang,
      })
      .select('id')
      .single()
    expect(phraseError).toBeNull()
    const phraseGenerationId = String(phraseData?.id || '')

    const { error: activationError } = await client.rpc('register_lexicard_activations', {
      p_lexicard_ids: firstIds,
      p_target_lang: targetLang,
      p_native_lang: nativeLang,
    })
    expect(activationError).toBeNull()

    const { error: phraseMetricError } = await client.rpc('bump_daily_creation_metrics', {
      p_day: day,
      p_words_added: 5,
      p_phrase_generated: true,
      p_xp_delta: 20,
    })
    expect(phraseMetricError).toBeNull()

    const { data: afterPhrase, error: afterPhraseError } = await adminClient
      .from('daily_metrics')
      .select('phrase_generated, creation_goal_completed')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(afterPhraseError).toBeNull()
    expect(afterPhrase?.phrase_generated).toBe(true)
    expect(afterPhrase?.creation_goal_completed).toBe(false)

    const { data: activatedRows, error: activatedRowsError } = await adminClient
      .from('lexicards')
      .select('id, activation_count')
      .in('id', firstIds)
    expect(activatedRowsError).toBeNull()
    for (const row of activatedRows || []) {
      expect(row.activation_count).toBe(1)
    }

    const { data: trackerRow, error: trackerError } = await adminClient
      .from('user_meta_tracker')
      .select('activation_words_total')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .single()
    expect(trackerError).toBeNull()
    expect(trackerRow?.activation_words_total).toBe(5)

    const { error: voiceError } = await adminClient
      .from('phrase_voice_activations')
      .insert({
        user_id: userId,
        phrase_generation_id: phraseGenerationId,
        storage_path: `${userId}/master-note/${Date.now()}.webm`,
        duration_ms: 12_000,
        mime_type: 'audio/webm',
        size_bytes: 12_345,
        status: 'ready',
        activation_source: 'master_note_chunk',
      })
    expect(voiceError).toBeNull()

    const { data: afterVoice, error: afterVoiceError } = await adminClient
      .from('daily_metrics')
      .select('creation_goal_completed')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(afterVoiceError).toBeNull()
    expect(afterVoice?.creation_goal_completed).toBe(true)

    await insertBatch(secondBatchWords, 5)

    for (let i = 6; i <= 10; i += 1) {
      const { error } = await client.rpc('bump_daily_creation_metrics', {
        p_day: day,
        p_words_added: i,
        p_phrase_generated: true,
        p_xp_delta: 5,
      })
      expect(error).toBeNull()
    }

    const { data: allCards, error: allCardsError } = await adminClient
      .from('lexicards')
      .select('id')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .order('created_at', { ascending: true })
      .limit(10)
    expect(allCardsError).toBeNull()
    expect((allCards || []).length).toBe(10)

    for (const row of allCards || []) {
      const { error: reviewInsertError } = await adminClient
        .from('lexicard_reviews')
        .insert({
          user_id: userId,
          lexicard_id: row.id,
          knew: true,
          previous_interval: 1,
          next_interval: 2,
          previous_ease_factor: 2.5,
          next_ease_factor: 2.6,
        })
      expect(reviewInsertError).toBeNull()

      const { error: reviewMetricError } = await client.rpc('bump_daily_review_metrics', {
        p_day: day,
        p_correct_delta: 1,
        p_xp_delta: 10,
      })
      expect(reviewMetricError).toBeNull()
    }

    const { data: finalMetrics, error: finalMetricsError } = await adminClient
      .from('daily_metrics')
      .select('words_added, correct_reviews, phrase_generated, creation_goal_completed, review_goal_completed')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(finalMetricsError).toBeNull()
    expect(finalMetrics?.words_added).toBe(10)
    expect(finalMetrics?.correct_reviews).toBe(10)
    expect(finalMetrics?.phrase_generated).toBe(true)
    expect(finalMetrics?.creation_goal_completed).toBe(true)
    expect(finalMetrics?.review_goal_completed).toBe(true)
  })
})
