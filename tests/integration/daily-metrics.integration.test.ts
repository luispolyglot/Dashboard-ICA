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
  return `integration.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`
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

describe('daily metrics DB integration', () => {
  it('updates review metrics via RPC and blocks direct writes', async () => {
    const { client, userId } = await createAuthenticatedUser()
    const day = '2001-01-01'

    const { data: firstData, error: firstError } = await client.rpc('bump_daily_review_metrics', {
      p_day: day,
      p_correct_delta: 1,
      p_xp_delta: 10,
    })
    expect(firstError).toBeNull()
    const firstRow = Array.isArray(firstData) ? firstData[0] : firstData
    expect(Number(firstRow?.correct_reviews ?? 0)).toBe(1)
    expect(Number(firstRow?.xp_earned ?? 0)).toBe(10)

    const { data: secondData, error: secondError } = await client.rpc('bump_daily_review_metrics', {
      p_day: day,
      p_correct_delta: 0,
      p_xp_delta: 2,
    })
    expect(secondError).toBeNull()
    const secondRow = Array.isArray(secondData) ? secondData[0] : secondData
    expect(Number(secondRow?.correct_reviews ?? 0)).toBe(1)
    expect(Number(secondRow?.xp_earned ?? 0)).toBe(12)

    const { data: metricRow, error: metricError } = await client
      .from('daily_metrics')
      .select('correct_reviews, xp_earned')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(metricError).toBeNull()
    expect(metricRow?.correct_reviews).toBe(1)
    expect(metricRow?.xp_earned).toBe(12)

    const { error: updateError } = await client
      .from('daily_metrics')
      .update({ correct_reviews: 0 })
      .eq('user_id', userId)
      .eq('day', day)

    if (!updateError) {
      const { data: afterUpdateRow, error: afterUpdateError } = await client
        .from('daily_metrics')
        .select('correct_reviews')
        .eq('user_id', userId)
        .eq('day', day)
        .single()
      expect(afterUpdateError).toBeNull()
      expect(afterUpdateRow?.correct_reviews).toBe(1)
    } else {
      expect(updateError).toBeTruthy()
    }

    const { error: insertError } = await client.from('daily_metrics').insert({
      user_id: userId,
      day: '2001-01-02',
      correct_reviews: 99,
    })
    expect(insertError).toBeTruthy()
  })

  it('keeps creation metrics monotonic and updates xp atomically', async () => {
    const { client, userId } = await createAuthenticatedUser()
    const day = '2001-01-03'

    const { data: firstData, error: firstError } = await client.rpc('bump_daily_creation_metrics', {
      p_day: day,
      p_words_added: 2,
      p_phrase_generated: false,
      p_xp_delta: 5,
    })
    expect(firstError).toBeNull()
    const firstRow = Array.isArray(firstData) ? firstData[0] : firstData
    expect(Number(firstRow?.words_added ?? 0)).toBe(2)
    expect(Boolean(firstRow?.phrase_generated ?? false)).toBe(false)
    expect(Number(firstRow?.xp_earned ?? 0)).toBe(5)

    const { data: secondData, error: secondError } = await client.rpc('bump_daily_creation_metrics', {
      p_day: day,
      p_words_added: 1,
      p_words_added_delta: 1,
      p_phrase_generated: true,
      p_xp_delta: 20,
    })
    expect(secondError).toBeNull()
    const secondRow = Array.isArray(secondData) ? secondData[0] : secondData
    expect(Number(secondRow?.words_added ?? 0)).toBe(3)
    expect(Boolean(secondRow?.phrase_generated ?? false)).toBe(true)
    expect(Number(secondRow?.xp_earned ?? 0)).toBe(25)

    const { data: thirdData, error: thirdError } = await client.rpc('bump_daily_creation_metrics', {
      p_day: day,
      p_words_added: 2,
      p_words_added_delta: 1,
      p_phrase_generated: true,
      p_xp_delta: 0,
    })
    expect(thirdError).toBeNull()
    const thirdRow = Array.isArray(thirdData) ? thirdData[0] : thirdData
    expect(Number(thirdRow?.words_added ?? 0)).toBe(4)
    expect(Boolean(thirdRow?.phrase_generated ?? false)).toBe(true)
    expect(Number(thirdRow?.xp_earned ?? 0)).toBe(25)
    expect(Boolean(thirdRow?.creation_goal_completed ?? false)).toBe(false)

    const { data: fourthData, error: fourthError } = await client.rpc('bump_daily_creation_metrics', {
      p_day: day,
      p_words_added: 3,
      p_words_added_delta: 1,
      p_phrase_generated: true,
      p_xp_delta: 0,
    })
    expect(fourthError).toBeNull()
    const fourthRow = Array.isArray(fourthData) ? fourthData[0] : fourthData
    expect(Number(fourthRow?.words_added ?? 0)).toBe(5)
    expect(Boolean(fourthRow?.creation_goal_completed ?? false)).toBe(true)

    const { data: metricRow, error: metricError } = await client
      .from('daily_metrics')
      .select('words_added, phrase_generated, xp_earned')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(metricError).toBeNull()
    expect(metricRow?.words_added).toBe(5)
    expect(metricRow?.phrase_generated).toBe(true)
    expect(metricRow?.xp_earned).toBe(25)
  })

  it('prevents decreasing correct_reviews even with privileged update', async () => {
    const { userId } = await createAuthenticatedUser()
    const day = '2001-01-04'

    const { error: seedError } = await adminClient.from('daily_metrics').upsert(
      {
        user_id: userId,
        day,
        correct_reviews: 5,
        xp_earned: 10,
      },
      { onConflict: 'user_id,day' },
    )
    expect(seedError).toBeNull()

    const { error: lowerError } = await adminClient
      .from('daily_metrics')
      .update({ correct_reviews: 1 })
      .eq('user_id', userId)
      .eq('day', day)
    expect(lowerError).toBeNull()

    const { data: row, error: rowError } = await adminClient
      .from('daily_metrics')
      .select('correct_reviews')
      .eq('user_id', userId)
      .eq('day', day)
      .single()
    expect(rowError).toBeNull()
    expect(row?.correct_reviews).toBe(5)
  })
})
