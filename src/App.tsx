import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardICAApp from './modules/DashboardICA'
import { useAuth } from './auth/AuthContext'
import { PrivateRoute, PublicOnlyRoute } from './router/RouteGuards'
import { LoginPage } from './views/LoginPage'
import { RegisterPage } from './views/RegisterPage'

function RootRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-950 text-slate-400'>
        Cargando...
      </div>
    )
  }

  return <Navigate to={user ? '/app' : '/login'} replace />
}

function DashboardRoute() {
  const { signOut } = useAuth()
  return <DashboardICAApp onLogout={signOut} />
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/register' element={<RegisterPage />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route path='/app' element={<DashboardRoute />} />
      </Route>

      <Route path='/' element={<RootRedirect />} />
      <Route path='*' element={<RootRedirect />} />
    </Routes>
  )
}
