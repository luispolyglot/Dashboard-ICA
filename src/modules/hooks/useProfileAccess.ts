import { useEffect, useState } from 'react'
import { fetchAdminRole } from '../services/adminAnalytics'
import {
  fetchCoachingAccess,
  fetchCoachingPendingReviewSummary,
  fetchMyCoachingDashboard,
} from '../services/coaching'

export type ProfileAccess = {
  loaded: boolean
  canSeeAdminAnalytics: boolean
  isSuperAdmin: boolean
  canSeeCoachingPersonalized: boolean
  canManageCoaching: boolean
  pendingCoachingSessions: number
  pendingCoachingNotes: number
}

const EMPTY_ACCESS: ProfileAccess = {
  loaded: false,
  canSeeAdminAnalytics: false,
  isSuperAdmin: false,
  canSeeCoachingPersonalized: false,
  canManageCoaching: false,
  pendingCoachingSessions: 0,
  pendingCoachingNotes: 0,
}

/**
 * Qué secciones del perfil puede ver el usuario (coaching, admin...).
 * Solo consulta cuando `enabled` es true (p. ej. al abrir el panel de perfil en móvil).
 */
export function useProfileAccess(
  targetLang: string | undefined,
  enabled: boolean,
): ProfileAccess {
  const [access, setAccess] = useState<ProfileAccess>(EMPTY_ACCESS)

  useEffect(() => {
    if (!enabled) return
    let active = true

    const run = async () => {
      const [role, coachingAccess, coachingMemberships, pendingSummary] =
        await Promise.all([
          fetchAdminRole().catch(() => null),
          fetchCoachingAccess().catch(() => null),
          fetchMyCoachingDashboard(targetLang).catch(() => []),
          fetchCoachingPendingReviewSummary().catch(() => ({
            hasPendingReviews: false,
            pendingSessions: 0,
            pendingNotes: 0,
          })),
        ])
      if (!active) return

      setAccess({
        loaded: true,
        canSeeAdminAnalytics: role === 'admin' || role === 'super_admin',
        isSuperAdmin: role === 'super_admin',
        canSeeCoachingPersonalized:
          Array.isArray(coachingMemberships) && coachingMemberships.length > 0,
        canManageCoaching: Boolean(coachingAccess?.isCoachingAdmin),
        pendingCoachingSessions: pendingSummary.pendingSessions,
        pendingCoachingNotes: pendingSummary.pendingNotes,
      })
    }

    void run()

    return () => {
      active = false
    }
  }, [enabled, targetLang])

  return access
}
