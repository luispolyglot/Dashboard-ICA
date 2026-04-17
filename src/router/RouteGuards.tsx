import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { useAuth } from '../auth/AuthContext'

function FullscreenMessage({ message }: { message: string }) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-background px-6 text-center text-muted-foreground'>
      {message}
    </div>
  )
}

export function PrivateRoute() {
  const { user, loading, hasSupabaseConfig } = useAuth()
  const location = useLocation()

  if (!hasSupabaseConfig) {
    return <FullscreenMessage message='Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar autenticación.' />
  }

  if (loading) return <FullscreenLoading label='Cargando sesión...' />
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
