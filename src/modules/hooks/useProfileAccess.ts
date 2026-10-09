import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { peekQuick, storeQuick } from '../services/quickCache'
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
  /** In a coaching right now (finished or cancelled ones do not count). */
  hasActiveCoaching: boolean
  canManageCoaching: boolean
  pendingCoachingSessions: number
  pendingCoachingNotes: number
}

const EMPTY_ACCESS: ProfileAccess = {
  loaded: false,
  canSeeAdminAnalytics: false,
  isSuperAdmin: false,
  canSeeCoachingPersonalized: false,
  hasActiveCoaching: false,
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
  const { user } = useAuth()
  const cacheKey = user?.id ? `profile-access:${user.id}:${targetLang || ''}` : null
  // Lo último que se supo sale al momento (secciones de coaching y admin sin esperar).
  const [access, setAccess] = useState<ProfileAccess>(() => (cacheKey ? peekQuick<ProfileAccess>(cacheKey) : undefined) ?? EMPTY_ACCESS)

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

      const next: ProfileAccess = {
        loaded: true,
        canSeeAdminAnalytics: role === 'admin' || role === 'super_admin',
        isSuperAdmin: role === 'super_admin',
        canSeeCoachingPersonalized:
          Array.isArray(coachingMemberships) && coachingMemberships.length > 0,
        hasActiveCoaching:
          Array.isArray(coachingMemberships) && coachingMemberships.some((row) => row.status === 'active'),
        canManageCoaching: Boolean(coachingAccess?.isCoachingAdmin),
        pendingCoachingSessions: pendingSummary.pendingSessions,
        pendingCoachingNotes: pendingSummary.pendingNotes,
      }
      setAccess(next)
      if (cacheKey) storeQuick(cacheKey, next)
    }

    void run()

    return () => {
      active = false
    }
  }, [cacheKey, enabled, targetLang])

  return access
}
