import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { checkAdminAccess, checkSuperAdminAccess } from '@/modules/services/adminAnalytics'
import { useAuth } from '../auth/AuthContext'

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
  const [checking, setChecking] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      if (!user) {
        if (isMounted) {
          setHasAccess(false)
          setChecking(false)
        }
        return
      }

      setChecking(true)
      const allowed = await checkAdminAccess()

      if (isMounted) {
        setHasAccess(allowed)
        setChecking(false)
      }
    }

    if (!loading) {
      void run()
    }

    return () => {
      isMounted = false
    }
  }, [loading, user?.id])

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading || checking)
    return <FullscreenLoading label='Verificando permisos de admin...' />
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (!hasAccess) return <Navigate to='/' replace />
  return <Outlet />
}

export function SuperAdminRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const [checking, setChecking] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      if (!user) {
        if (isMounted) {
          setHasAccess(false)
          setChecking(false)
        }
        return
      }

      setChecking(true)
      const allowed = await checkSuperAdminAccess()

      if (isMounted) {
        setHasAccess(allowed)
        setChecking(false)
      }
    }

    if (!loading) {
      void run()
    }

    return () => {
      isMounted = false
    }
  }, [loading, user?.id])

  if (!hasSupabaseConfig) {
    return (
      <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
    )
  }

  if (loading || checking) {
    return <FullscreenLoading label='Verificando permisos de super admin...' />
  }
  if (!user) return <Navigate to='/login' state={{ from: location }} replace />
  if (!hasAccess) return <Navigate to='/' replace />
  return <Outlet />
}
