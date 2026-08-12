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
  return `integration.activations.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`
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
    const { error: voiceDeleteError } = await adminClient
      .from('phrase_voice_activations')
      .delete()
      .eq('user_id', userId)
    if (voiceDeleteError) throw voiceDeleteError

    const { error: phraseDeleteError } = await adminClient
      .from('phrase_generations')
      .delete()
      .eq('user_id', userId)
    if (phraseDeleteError) throw phraseDeleteError

    const { error: lexicardsDeleteError } = await adminClient
      .from('lexicards')
      .delete()
      .eq('user_id', userId)
    if (lexicardsDeleteError) throw lexicardsDeleteError

    const { error: hardDeleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (hardDeleteError && !hardDeleteError.message.toLowerCase().includes('not found')) {
      throw hardDeleteError
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

describe('register_lexicard_activations integration', () => {
  it('increments activation_count and keeps unique activation_words_total', async () => {
    const { client, userId } = await createAuthenticatedUser()

    const { data: cardData, error: cardError } = await adminClient
      .from('lexicards')
      .insert({
        user_id: userId,
        target: 'Whose',
        native: 'de quien',
        importance: 'frequent',
        target_lang: 'Ingles',
        native_lang: 'Espanol',
      })
      .select('id')
      .single()
    expect(cardError).toBeNull()
    const lexicardId = String(cardData?.id || '')
    expect(lexicardId.length).toBeGreaterThan(0)

    const first = await client.rpc('register_lexicard_activations', {
      p_lexicard_ids: [lexicardId],
      p_target_lang: 'Ingles',
      p_native_lang: 'Espanol',
    })
    expect(first.error).toBeNull()

    const second = await client.rpc('register_lexicard_activations', {
      p_lexicard_ids: [lexicardId],
      p_target_lang: 'Ingles',
      p_native_lang: 'Espanol',
    })
    expect(second.error).toBeNull()

    const { data: cardRow, error: cardRowError } = await adminClient
      .from('lexicards')
      .select('activation_count')
      .eq('id', lexicardId)
      .single()
    expect(cardRowError).toBeNull()
    expect(cardRow?.activation_count).toBe(2)

    const { data: trackerRow, error: trackerError } = await adminClient
      .from('user_meta_tracker')
      .select('activation_words_total')
      .eq('user_id', userId)
      .eq('target_lang', 'Ingles')
      .eq('native_lang', 'Espanol')
      .single()
    expect(trackerError).toBeNull()
    expect(trackerRow?.activation_words_total).toBe(1)
  })

  it('accepts case and spacing mismatch in language params', async () => {
    const { client, userId } = await createAuthenticatedUser()

    const { data: cardData, error: cardError } = await adminClient
      .from('lexicards')
      .insert({
        user_id: userId,
        target: 'Instead',
        native: 'en lugar de',
        importance: 'frequent',
        target_lang: 'Inglés',
        native_lang: 'Español',
      })
      .select('id')
      .single()
    expect(cardError).toBeNull()
    const lexicardId = String(cardData?.id || '')

    const { error } = await client.rpc('register_lexicard_activations', {
      p_lexicard_ids: [lexicardId],
      p_target_lang: '  inglés  ',
      p_native_lang: 'español',
    })
    expect(error).toBeNull()

    const { data: cardRow, error: cardRowError } = await adminClient
      .from('lexicards')
      .select('activation_count')
      .eq('id', lexicardId)
      .single()
    expect(cardRowError).toBeNull()
    expect(cardRow?.activation_count).toBe(1)
  })

  it('does not allow activating another user lexicard', async () => {
    const owner = await createAuthenticatedUser()
    const attacker = await createAuthenticatedUser()

    const { data: cardData, error: cardError } = await adminClient
      .from('lexicards')
      .insert({
        user_id: owner.userId,
        target: 'Obey',
        native: 'obedecer',
        importance: 'frequent',
        target_lang: 'Ingles',
        native_lang: 'Espanol',
      })
      .select('id')
      .single()
    expect(cardError).toBeNull()
    const lexicardId = String(cardData?.id || '')

    const { error } = await attacker.client.rpc('register_lexicard_activations', {
      p_lexicard_ids: [lexicardId],
      p_target_lang: 'Ingles',
      p_native_lang: 'Espanol',
    })
    expect(error).toBeNull()

    const { data: cardRow, error: cardRowError } = await adminClient
      .from('lexicards')
      .select('activation_count')
      .eq('id', lexicardId)
      .single()
    expect(cardRowError).toBeNull()
    expect(cardRow?.activation_count).toBe(0)
  })

  it('recovers activation fields after stale client update when re-activating', async () => {
    const { client, userId } = await createAuthenticatedUser()

    const { data: cardData, error: cardError } = await adminClient
      .from('lexicards')
      .insert({
        user_id: userId,
        target: 'hustle',
        native: 'ajetreo',
        importance: 'frequent',
        target_lang: 'Inglés',
        native_lang: 'Español',
      })
      .select('id')
      .single()
    expect(cardError).toBeNull()
    const lexicardId = String(cardData?.id || '')

    const { error: activationError } = await client.rpc('register_lexicard_activations', {
      p_lexicard_ids: [lexicardId],
      p_target_lang: 'Inglés',
      p_native_lang: 'Español',
    })
    expect(activationError).toBeNull()

    const { data: beforeRow, error: beforeError } = await adminClient
      .from('lexicards')
      .select('activation_count, first_activated_at, last_activated_at')
      .eq('id', lexicardId)
      .single()
    expect(beforeError).toBeNull()
    expect(beforeRow?.activation_count).toBe(1)

    const { error: staleUpdateError } = await client
      .from('lexicards')
      .update({
        activation_count: 0,
        first_activated_at: null,
        last_activated_at: null,
        last_reviewed_at: new Date().toISOString(),
      })
      .eq('id', lexicardId)
    expect(staleUpdateError).toBeNull()

    const { error: reactivationError } = await client.rpc('register_lexicard_activations', {
      p_lexicard_ids: [lexicardId],
      p_target_lang: 'Inglés',
      p_native_lang: 'Español',
    })
    expect(reactivationError).toBeNull()

    const { data: afterRow, error: afterError } = await adminClient
      .from('lexicards')
      .select('activation_count, first_activated_at, last_activated_at')
      .eq('id', lexicardId)
      .single()
    expect(afterError).toBeNull()
    expect(afterRow?.activation_count).toBe(1)
    expect(afterRow?.first_activated_at).toBeTruthy()
    expect(afterRow?.last_activated_at).toBeTruthy()
  })
})
