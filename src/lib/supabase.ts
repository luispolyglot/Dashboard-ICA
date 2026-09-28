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

const REACHABILITY_PROBE_TIMEOUT_MS = 5000

let reachabilityProbe: Promise<boolean> | null = null

/**
 * Comprueba si el servidor de Supabase responde de verdad.
 *
 * `fetch` lanza TypeError no solo sin conexión: también cuando la respuesta no
 * trae cabeceras CORS (p. ej. un 431/414 del gateway por URL demasiado larga,
 * o un 5xx de una edge function). En esos casos hay internet y no debemos
 * mandar al usuario al modo offline, porque al volver se repite la misma
 * request y se entra en un bucle.
 *
 * Se usa `mode: 'no-cors'`: la promesa se resuelve (respuesta opaca) si hay
 * red hasta el servidor, sin importar el status ni las cabeceras CORS, y solo
 * se rechaza ante un fallo de red real.
 */
function isSupabaseReachable(): Promise<boolean> {
  if (reachabilityProbe) return reachabilityProbe
  if (!supabaseUrl) return Promise.resolve(false)

  reachabilityProbe = (async () => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REACHABILITY_PROBE_TIMEOUT_MS)
    try {
      await fetch(`${supabaseUrl}/auth/v1/health`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      })
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timeoutId)
    }
  })().finally(() => {
    reachabilityProbe = null
  })

  return reachabilityProbe
}

async function handleConnectivityError(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    dispatchNetworkUnreachableEvent()
    return
  }

  const reachable = await isSupabaseReachable()
  if (!reachable) {
    dispatchNetworkUnreachableEvent()
  }
}

const supabaseFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (isConnectivityError(error)) {
      if (import.meta.env.DEV) {
        console.warn('[supabase] request falló a nivel de red', input, error)
      }
      void handleConnectivityError()
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
