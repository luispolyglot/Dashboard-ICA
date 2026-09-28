export const OFFLINE_SAFE_ROUTE_TRIGGER_EVENT = 'app:network-unreachable'
export const OFFLINE_SAFE_LAST_PATH_STORAGE_KEY = 'dashboard-ica:offline-safe:last-path'
export const OFFLINE_SAFE_AUTO_RETURN_STORAGE_KEY = 'dashboard-ica:offline-safe:auto-return'

/** Vueltas automáticas permitidas antes de exigir que el usuario pulse "Reintentar". */
export const OFFLINE_SAFE_MAX_AUTO_RETURNS = 3
/** Si pasa este tiempo sin volver a caer en offline, el contador se reinicia. */
const OFFLINE_SAFE_AUTO_RETURN_WINDOW_MS = 2 * 60 * 1000
const OFFLINE_SAFE_AUTO_RETURN_BASE_DELAY_MS = 700

type AutoReturnState = {
  count: number
  lastAt: number
}

function readAutoReturnState(): AutoReturnState {
  if (typeof window === 'undefined') return { count: 0, lastAt: 0 }
  try {
    const raw = window.sessionStorage.getItem(OFFLINE_SAFE_AUTO_RETURN_STORAGE_KEY)
    if (!raw) return { count: 0, lastAt: 0 }
    const parsed = JSON.parse(raw) as Partial<AutoReturnState>
    const count = Number(parsed.count) || 0
    const lastAt = Number(parsed.lastAt) || 0
    if (Date.now() - lastAt > OFFLINE_SAFE_AUTO_RETURN_WINDOW_MS) {
      return { count: 0, lastAt: 0 }
    }
    return { count, lastAt }
  } catch {
    return { count: 0, lastAt: 0 }
  }
}

/**
 * Registra una vuelta automática y devuelve el retraso a aplicar
 * (700 ms, 1.4 s, 2.8 s...). Devuelve `null` si ya se alcanzó el máximo.
 */
export function registerOfflineSafeAutoReturn(): number | null {
  const state = readAutoReturnState()
  if (state.count >= OFFLINE_SAFE_MAX_AUTO_RETURNS) return null

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        OFFLINE_SAFE_AUTO_RETURN_STORAGE_KEY,
        JSON.stringify({ count: state.count + 1, lastAt: Date.now() }),
      )
    } catch {
      // sessionStorage no disponible: seguimos sin límite persistente.
    }
  }

  return OFFLINE_SAFE_AUTO_RETURN_BASE_DELAY_MS * 2 ** state.count
}

/** Reinicia el contador (p. ej. cuando el usuario pulsa "Reintentar"). */
export function resetOfflineSafeAutoReturns(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(OFFLINE_SAFE_AUTO_RETURN_STORAGE_KEY)
  } catch {
    // ignorar
  }
}
