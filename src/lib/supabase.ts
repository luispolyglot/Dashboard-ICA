import { createClient } from '@supabase/supabase-js'
import { OFFLINE_SAFE_ROUTE_TRIGGER_EVENT } from '../modules/offline/events'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const NETWORK_EVENT_THROTTLE_MS = 1500

let lastNetworkEventAt = 0

function dispatchNetworkUnreachableEvent(): void {
  if (typeof window === 'undefined') return

  const now = Date.now()
  if (now - lastNetworkEventAt < NETWORK_EVENT_THROTTLE_MS) return

  lastNetworkEventAt = now
  window.dispatchEvent(new CustomEvent(OFFLINE_SAFE_ROUTE_TRIGGER_EVENT))
}

function isConnectivityError(error: unknown): boolean {
  if (!error) return false

  if (error instanceof DOMException) {
    return error.name !== 'AbortError'
  }

  if (error instanceof TypeError) {
    return true
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('failed to fetch') || message.includes('networkerror')
  }

  return false
}

const supabaseFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (isConnectivityError(error)) {
      dispatchNetworkUnreachableEvent()
    }
    throw error
  }
}

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: supabaseFetch,
      },
    })
  : null
