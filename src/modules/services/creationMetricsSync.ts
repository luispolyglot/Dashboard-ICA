export const CREATION_METRICS_CHANGED_EVENT = 'ica:creation-metrics-changed'
export const ACTIVATION_METRICS_CHANGED_EVENT = 'ica:activation-metrics-changed'

export function notifyCreationMetricsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CREATION_METRICS_CHANGED_EVENT))
}

export function notifyActivationMetricsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ACTIVATION_METRICS_CHANGED_EVENT))
}
