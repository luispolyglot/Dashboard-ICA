import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

const DEFAULT_SESSION_TIMEOUT_MS = 3500

export async function getSessionWithTimeout(
  timeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
): Promise<Session | null> {
  if (!supabase) return null

  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: Session | null } }>((resolve) => {
        globalThis.setTimeout(() => {
          resolve({ data: { session: null } })
        }, timeoutMs)
      }),
    ])

    return result?.data?.session || null
  } catch {
    return null
  }
}
