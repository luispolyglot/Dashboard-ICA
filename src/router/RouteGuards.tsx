import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { PageLoading } from '@/components/ui/loading-state'
import { checkAdminAccess, checkSuperAdminAccess } from '@/modules/services/adminAnalytics'
import {
  checkCoachingAdminAccess,
  fetchMyCoachingDashboard,
} from '@/modules/services/coaching'
import { useDashboardContext } from '@/modules/context/DashboardContext'
import { useAuth } from '../auth/AuthContext'

function FullscreenMessage({ message }: { message: string }) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-background px-6 text-center text-muted-foreground'>
      {message}
    </div>
  )
}

/**
 * Permisos ya comprobados en esta visita (por usuario). Así, al volver a entrar
 * en coaching o en una zona de admin, la página sale al momento: se comprueba
 * otra vez por detrás y solo se te saca si ya no tienes acceso.
 */
const accessCache = new Map<string, boolean>()

type AccessKind = 'admin' | 'super-admin' | 'coaching-member' | 'coaching-admin'

function useCachedAccess(
  kind: AccessKind,
  userId: string | undefined,
  ready: boolean,
  check: () => Promise<boolean>,
): { checking: boolean; hasAccess: boolean } {
  const cacheKey = userId ? `${kind}:${userId}` : null
  const [result, setResult] = useState<{ key: string | null; allowed: boolean } | null>(null)
  const checkRef = useRef(check)
  checkRef.current = check

  useEffect(() => {
    if (!ready) return
    if (!cacheKey) {
      setResult({ key: null, allowed: false })
      return
    }

    let active = true
    checkRef
      .current()
      .then((allowed) => {
        accessCache.set(cacheKey, allowed)
        if (active) setResult({ key: cacheKey, allowed })
      })
      .catch(() => {
        // Si falla la conexión y ya sabíamos que tenía acceso, no se le echa.
        const known = accessCache.get(cacheKey)
        if (active) setResult({ key: cacheKey, allowed: known ?? false })
      })

    return () => {
      active = false
    }
  }, [cacheKey, ready])

  const known =
    result && result.key === cacheKey
      ? result.allowed
      : cacheKey
        ? accessCache.get(cacheKey)
        : undefined

  return { checking: known === undefined, hasAccess: known === true }
}

export function PrivateRoute() {
  const { user, loading, hasSupabaseConfig, isPasswordRecovery } = useAuth()
  const location = useLocation()

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading) return <FullscreenLoading label='Cargando sesión...' />
  if (isPasswordRecovery) return <Navigate to='/reset-password' replace />
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()

  if (!hasSupabaseConfig) {
    return <Outlet />
  }

  if (loading) return <FullscreenLoading label='Cargando sesión...' />
  if (user) return <Navigate to='/' replace />
  return <Outlet />
}

export function AnalyticsAdminRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const location = useLocation()
  const { checking, hasAccess } = useCachedAccess('admin', user?.id, !loading, checkAdminAccess)

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading || (user && checking)) {
    return <PageLoading label='Verificando permisos de admin...' />
  }
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (!hasAccess) return <Navigate to='/' replace />
  return <Outlet />
}

export function SuperAdminRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const location = useLocation()
  const { checking, hasAccess } = useCachedAccess(
    'super-admin',
    user?.id,
    !loading,
    checkSuperAdminAccess,
  )

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading || (user && checking)) {
    return <PageLoading label='Verificando permisos de super admin...' />
  }
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (!hasAccess) return <Navigate to='/' replace />
  return <Outlet />
}

async function hasCoachingMembership(): Promise<boolean> {
  const memberships = await fetchMyCoachingDashboard()
  return memberships.length > 0
}

export function CoachingMemberRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const { loading: dashboardLoading } = useDashboardContext()
  const location = useLocation()
  const { checking, hasAccess } = useCachedAccess(
    'coaching-member',
    user?.id,
    !loading && !dashboardLoading,
    hasCoachingMembership,
  )

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading || dashboardLoading || (user && checking)) {
    return <PageLoading label='Verificando acceso a coaching...' />
  }

  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (!hasAccess) return <Navigate to='/' replace />
  return <Outlet />
}

export function CoachingAdminRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const location = useLocation()
  const { checking, hasAccess } = useCachedAccess(
    'coaching-admin',
    user?.id,
    !loading,
    checkCoachingAdminAccess,
  )

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading || (user && checking)) {
    return <PageLoading label='Verificando permisos de coaching...' />
  }

  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (!hasAccess) return <Navigate to='/' replace />
  return <Outlet />
}
