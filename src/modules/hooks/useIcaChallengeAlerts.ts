/**
 * Avisos de Desafíos ICA para toda la app: retos nuevos y turnos pendientes.
 * Lo usan la barra de abajo (móvil), la cabecera (ordenador), Inicio y Juegos ICA.
 * Hay una sola consulta compartida: se repite al volver a la app, cada 90 s
 * mientras está abierta y cuando se juega o se responde un reto.
 */
import { useEffect, useState } from 'react'
import { t, tn } from '@/i18n'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchMyIcaChallengeAlerts, type IcaChallengeAlerts } from '../services/icaChallenges'
import { ICA_CHALLENGES_LOCAL } from '../services/icaChallengesLocalMode'
import { useFeatureFlagsStore } from '../stores/featureFlagsStore'

export type IcaChallengeAlertState = IcaChallengeAlerts & { total: number }

const EMPTY: IcaChallengeAlertState = { invites: 0, myTurn: 0, total: 0 }
const POLL_MS = 90_000
const MIN_GAP_MS = 10_000

let current: IcaChallengeAlertState = EMPTY
let lastFetchAt = 0
let inflight: Promise<void> | null = null
const listeners = new Set<(state: IcaChallengeAlertState) => void>()

function publish(next: IcaChallengeAlertState) {
  current = next
  listeners.forEach((listener) => listener(next))
}

/** Vuelve a mirar si hay retos nuevos o turnos. `force` salta la espera mínima. */
export function refreshIcaChallengeAlerts(force = false): Promise<void> {
  if (inflight) return inflight
  if (!force && Date.now() - lastFetchAt < MIN_GAP_MS) return Promise.resolve()
  lastFetchAt = Date.now()
  inflight = fetchMyIcaChallengeAlerts()
    .then((alerts) => publish({ ...alerts, total: alerts.invites + alerts.myTurn }))
    .catch(() => {
      // Sin conexión: se deja lo último que se sabía.
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useIcaChallengeAlerts(): IcaChallengeAlertState {
  const loadFlags = useFeatureFlagsStore((state) => state.loadFlags)
  const flagEnabled = useFeatureFlagsStore((state) => Boolean(state.flags['ica-challenges']))
  const enabled = flagEnabled || ICA_CHALLENGES_LOCAL
  const [alerts, setAlerts] = useState<IcaChallengeAlertState>(current)

  useEffect(() => {
    void loadFlags()
  }, [loadFlags])

  useEffect(() => {
    if (!enabled) return
    listeners.add(setAlerts)
    setAlerts(current)
    void refreshIcaChallengeAlerts()

    const onFocus = () => void refreshIcaChallengeAlerts()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshIcaChallengeAlerts()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshIcaChallengeAlerts()
    }, POLL_MS)

    return () => {
      listeners.delete(setAlerts)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(intervalId)
    }
  }, [enabled])

  return enabled ? alerts : EMPTY
}

/** Si te han retado, se abre directamente la pestaña «Pendientes». */
export function challengesRouteForAlerts(alerts: IcaChallengeAlerts): string {
  return alerts.invites > 0 ? `${DASHBOARD_ROUTES.challengesIca}?tab=pending` : DASHBOARD_ROUTES.challengesIca
}

/** Texto corto para avisos y tooltips: «1 reto nuevo · te toca en 1». */
export function describeIcaChallengeAlerts(alerts: IcaChallengeAlerts): string {
  const parts: string[] = []
  if (alerts.invites > 0) {
    parts.push(tn(alerts.invites, '{n} reto nuevo', '{n} retos nuevos'))
  }
  if (alerts.myTurn > 0) {
    parts.push(alerts.myTurn === 1 ? t('te toca jugar') : t('te toca jugar en {n}', { n: alerts.myTurn }))
  }
  return parts.join(' · ')
}
