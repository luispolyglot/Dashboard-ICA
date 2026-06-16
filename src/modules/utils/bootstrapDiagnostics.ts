const BOOTSTRAP_DIAGNOSTICS_FLAG = 'dashboard-ica:debug-bootstrap'
const BOOTSTRAP_DIAGNOSTIC_EVENT = 'dashboard-ica:bootstrap-diagnostic'

type BootstrapDiagnosticPayload = Record<string, unknown>

export function isBootstrapDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false

  if (import.meta.env.DEV) return true

  try {
    return window.localStorage.getItem(BOOTSTRAP_DIAGNOSTICS_FLAG) === '1'
  } catch {
    return false
  }
}

export function recordBootstrapDiagnostic(
  event: string,
  payload: BootstrapDiagnosticPayload = {},
): void {
  if (typeof window === 'undefined') return
  if (!isBootstrapDiagnosticsEnabled()) return

  const detail = {
    event,
    ...payload,
    timestamp: new Date().toISOString(),
  }

  console.info('[bootstrap]', detail)
  window.dispatchEvent(new CustomEvent(BOOTSTRAP_DIAGNOSTIC_EVENT, { detail }))
}
