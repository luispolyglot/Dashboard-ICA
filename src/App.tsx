import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { DashboardProvider } from './modules/context/DashboardContext'
import { DashboardLayout } from './modules/layout/DashboardLayout'
import {
  ActivationPhrasePage,
  FlashcardsPage,
  HomePage,
  MyIcaWordsPage,
  NewIcaWordsPage,
  PhraseHistoryPage,
} from './modules/routes/DashboardPages'
import { DASHBOARD_ROUTES } from './modules/routes/paths'
import { PrivateRoute, PublicOnlyRoute } from './router/RouteGuards'
import { LoginPage } from './views/LoginPage'
import { RegisterPage } from './views/RegisterPage'

function RootRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background text-muted-foreground'>
        Cargando...
      </div>
    )
  }

  return <Navigate to={user ? DASHBOARD_ROUTES.home : '/login'} replace />
}

function DashboardShell() {
  const { signOut } = useAuth()
  return (
    <DashboardProvider>
      <DashboardLayout onLogout={signOut} />
    </DashboardProvider>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/register' element={<RegisterPage />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route element={<DashboardShell />}>
          <Route index element={<HomePage />} />
          <Route path='new-ica-words' element={<NewIcaWordsPage />} />
          <Route path='my-ica-words' element={<MyIcaWordsPage />} />
          <Route path='flashcards' element={<FlashcardsPage />} />
          <Route path='activation-phrase' element={<ActivationPhrasePage />} />
          <Route path='phrase-history' element={<PhraseHistoryPage />} />
        </Route>
      </Route>
      <Route path='*' element={<RootRedirect />} />
    </Routes>
  )
}
