import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { fetchAllPages } from '../../src/modules/services/lexicardsPagination'

type AuthedUser = {
  userId: string
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
  return `integration.pagination.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`
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

  return { userId: created.user.id }
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

describe('lexicards pagination', () => {
  it('retrieves words beyond the default 1000 row limit when using range pagination', async () => {
    const { userId } = await createAuthenticatedUser()
    const targetLang = 'Inglés'
    const nativeLang = 'Español'
    const totalRows = 1005
    const baseTime = Date.now() - totalRows * 1000

    const rows = Array.from({ length: totalRows }, (_, index) => ({
      user_id: userId,
      target: `bulk-word-${String(index + 1).padStart(4, '0')}`,
      native: `native-${index + 1}`,
      importance: 'frequent',
      target_lang: targetLang,
      native_lang: nativeLang,
      created_at: new Date(baseTime + index * 1000).toISOString(),
    }))

    for (let start = 0; start < rows.length; start += 200) {
      const batch = rows.slice(start, start + 200)
      const { error } = await adminClient.from('lexicards').insert(batch)
      expect(error).toBeNull()
    }

    const { data: unpaginatedRows, error: unpaginatedError } = await adminClient
      .from('lexicards')
      .select('target')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    expect(unpaginatedError).toBeNull()
    expect((unpaginatedRows || []).length).toBe(1000)
    expect((unpaginatedRows || []).some((row) => row.target === 'bulk-word-1005')).toBe(false)

    const paginatedRows = await fetchAllPages<{ target: string }>(async (from, to) => {
      return adminClient
        .from('lexicards')
        .select('target')
        .eq('user_id', userId)
        .eq('target_lang', targetLang)
        .eq('native_lang', nativeLang)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    })

    expect(paginatedRows.length).toBe(totalRows)
    expect(paginatedRows.some((row) => row.target === 'bulk-word-1005')).toBe(true)
  })
})
