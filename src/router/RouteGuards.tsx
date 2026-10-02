import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { checkAdminAccess, checkSuperAdminAccess } from '@/modules/services/adminAnalytics'
import {
  checkCoachingAdminAccess,
  fetchMyCoachingDashboard,
} from '@/modules/services/coaching'
import { useDashboardContext } from '@/modules/context/DashboardContext'
import { useAuth } from '../auth/AuthContext'
import { t } from '@/i18n'
import { peekQuick, storeQuick } from '@/modules/services/quickCache'

function FullscreenMessage({ message }: { message: string }) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-background px-6 text-center text-muted-foreground'>
      {message}
    </div>
  )
}

export function PrivateRoute() {
  const { user, loading, hasSupabaseConfig, isPasswordRecovery } = useAuth()
  const location = useLocation()

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message={t('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.')} />
    )
  }

  if (loading) return <FullscreenLoading label={t('Cargando sesión...')} />
  if (isPasswordRecovery) return <Navigate to='/reset-password' replace />
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()

  if (!hasSupabaseConfig) {
    return <Outlet />
  }

  if (loading) return <FullscreenLoading label={t('Cargando sesión...')} />
  if (user) return <Navigate to='/' replace />
  return <Outlet />
}

/**
 * Comprueba un permiso recordando la última respuesta: si la última vez se podía entrar,
 * la pantalla sale al momento y el permiso se confirma por detrás (si ya no se puede,
 * se vuelve a Inicio). Los datos los protege siempre el servidor.
 */
function useCachedAccess(cacheKey: string | null, check: () => Promise<boolean>, ready: boolean) {
  const [state, setState] = useState(() => {
    const cached = cacheKey ? peekQuick<boolean>(cacheKey) : undefined
    return { checking: cached !== true, allowed: cached === true }
  })

  useEffect(() => {
    if (!ready) return
    if (!cacheKey) {
      setState({ checking: false, allowed: false })
      return
    }
    let active = true
    void check()
      .catch(() => false)
      .then((allowed) => {
        if (!active) return
        storeQuick(cacheKey, allowed)
        setState({ checking: false, allowed })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ready])

  return state
}

function GuardedOutlet({
  checking,
  allowed,
  label,
}: {
  checking: boolean
  allowed: boolean
  label: string
}) {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const location = useLocation()

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message={t('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.')} />
    )
  }
  if (loading) return <FullscreenLoading label={t('Cargando sesión...')} />
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (allowed) return <Outlet />
  if (checking) return <FullscreenLoading label={label} />
  return <Navigate to='/' replace />
}

export function AnalyticsAdminRoute() {
  const { user, loading } = useAuth()
  const access = useCachedAccess(user ? `guard-admin:${user.id}` : null, checkAdminAccess, !loading)
  return <GuardedOutlet {...access} label={t('Verificando permisos de admin...')} />
}

export function SuperAdminRoute() {
  const { user, loading } = useAuth()
  const access = useCachedAccess(user ? `guard-super-admin:${user.id}` : null, checkSuperAdminAccess, !loading)
  return <GuardedOutlet {...access} label={t('Verificando permisos de super admin...')} />
}

export function CoachingMemberRoute() {
  const { user, loading } = useAuth()
  const { loading: dashboardLoading } = useDashboardContext()
  const access = useCachedAccess(
    user ? `guard-coaching-member:${user.id}` : null,
    async () => (await fetchMyCoachingDashboard()).length > 0,
    !loading && !dashboardLoading,
  )
  if (dashboardLoading) return <FullscreenLoading label={t('Verificando acceso a coaching...')} />
  return <GuardedOutlet {...access} label={t('Verificando acceso a coaching...')} />
}

export function CoachingAdminRoute() {
  const { user, loading } = useAuth()
  const access = useCachedAccess(user ? `guard-coaching-admin:${user.id}` : null, checkCoachingAdminAccess, !loading)
  return <GuardedOutlet {...access} label={t('Verificando permisos de coaching...')} />
}
