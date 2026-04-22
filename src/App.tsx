import { Navigate, Route, Routes } from 'react-router-dom'
import { FullscreenLoading } from './components/ui/fullscreen-loading'
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
  ProfilePage,
} from './modules/routes/DashboardPages'
import { DASHBOARD_ROUTES } from './modules/routes/paths'
import { PrivateRoute, PublicOnlyRoute } from './router/RouteGuards'
import { ForgotPasswordPage } from './views/ForgotPasswordPage'
import { LoginPage } from './views/LoginPage'
import { RegisterPage } from './views/RegisterPage'
import { ResetPasswordPage } from './views/ResetPasswordPage'

function RootRedirect() {
  const { user, loading } = useAuth()

  if (loading) return <FullscreenLoading label='Cargando...' />

  return <Navigate to={user ? DASHBOARD_ROUTES.home : '/login'} replace />
}

function DashboardShell() {
  return (
    <DashboardProvider>
      <DashboardLayout />
    </DashboardProvider>
  )
}

export function App() {
  return (
    <Routes>
      <Route path='/reset-password' element={<ResetPasswordPage />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/register' element={<RegisterPage />} />
        <Route path='/forgot-password' element={<ForgotPasswordPage />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route element={<DashboardShell />}>
          <Route index element={<HomePage />} />
          <Route path='new-ica-words' element={<NewIcaWordsPage />} />
          <Route path='my-ica-words' element={<MyIcaWordsPage />} />
          <Route path='flashcards' element={<FlashcardsPage />} />
          <Route path='activation-phrase' element={<ActivationPhrasePage />} />
          <Route path='phrase-history' element={<PhraseHistoryPage />} />
          <Route path='profile' element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path='*' element={<RootRedirect />} />
    </Routes>
  )
}
