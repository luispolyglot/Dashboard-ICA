import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export async function getSessionSafe(): Promise<Session | null> {
  if (!supabase) return null

  try {
    const result = await supabase.auth.getSession()
    return result?.data?.session || null
  } catch {
    return null
  }
}
