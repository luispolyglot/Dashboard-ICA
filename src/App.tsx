import { Navigate, Route, Routes } from 'react-router-dom'
import { FullscreenLoading } from './components/ui/fullscreen-loading'
import { useAuth } from './auth/AuthContext'
import { ImportantInfoModal } from './modules/components/ImportantInfoModal'
import { DashboardProvider } from './modules/context/DashboardContext'
import { DashboardLayout } from './modules/layout/DashboardLayout'
import {
  AnalyticsPage,
  ActivationPhrasePage,
  CoachingPersonalizedPage,
  FlashcardsPage,
  FlashcardsPlayPage,
  HistoricLeaderboardPage,
  HomePage,
  LeaderboardPage,
  ManageWhitelistPage,
  ManageCoachingPage,
  ManageCoachingUserPage,
  MasterNoteActivatePhrasePage,
  MasterNoteDetailPage,
  MasterNotesPage,
  MyIcaWordsPage,
  NewTrackerPage,
  NewIcaWordsPage,
  PhraseHistoryPage,
  ProfilePage,
  StreaksPage,
  TrackerDetailPage,
  TrackersPage,
} from './modules/routes/DashboardPages'
import { DASHBOARD_ROUTES } from './modules/routes/paths'
import {
  AnalyticsAdminRoute,
  CoachingAdminRoute,
  CoachingMemberRoute,
  PrivateRoute,
  PublicOnlyRoute,
  SuperAdminRoute,
} from './router/RouteGuards'
import { ForgotPasswordPage } from './views/ForgotPasswordPage'
import { LoginPage } from './views/LoginPage'
import { RegisterPage } from './views/RegisterPage'
import { ResetPasswordPage } from './views/ResetPasswordPage'

function RootRedirect() {
  const { user, loading, isPasswordRecovery } = useAuth()

  if (loading) return <FullscreenLoading label='Cargando...' />
  if (isPasswordRecovery) return <Navigate to='/reset-password' replace />

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
    <>
      <ImportantInfoModal />
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
            <Route path='flashcards/play/:mode' element={<FlashcardsPlayPage />} />
            <Route path='activation-phrase' element={<ActivationPhrasePage />} />
            <Route path='phrase-history' element={<PhraseHistoryPage />} />
            <Route path='master-notes' element={<MasterNotesPage />} />
            <Route path='master-notes/note/:noteId' element={<MasterNoteDetailPage />} />
            <Route
              path='master-notes/note/:noteId/activate/:phraseId'
              element={<MasterNoteActivatePhrasePage />}
            />
            <Route path='leaderboard' element={<LeaderboardPage />} />
            <Route path='streaks' element={<StreaksPage />} />
            <Route path='profile' element={<ProfilePage />} />
            <Route path='trackers' element={<TrackersPage />} />
            <Route path='trackers/new' element={<NewTrackerPage />} />
            <Route path='trackers/:trackerId' element={<TrackerDetailPage />} />
            <Route element={<AnalyticsAdminRoute />}>
              <Route path='analytics' element={<AnalyticsPage />} />
            </Route>
            <Route element={<CoachingMemberRoute />}>
              <Route path='coaching-personalized' element={<CoachingPersonalizedPage />} />
            </Route>
            <Route element={<CoachingAdminRoute />}>
              <Route path='manage-coaching' element={<ManageCoachingPage />} />
              <Route path='manage-coaching/:userId' element={<ManageCoachingUserPage />} />
            </Route>
            <Route element={<SuperAdminRoute />}>
              <Route path='manage-whitelist' element={<ManageWhitelistPage />} />
              <Route path='historic-leaderboard' element={<HistoricLeaderboardPage />} />
            </Route>
          </Route>
        </Route>
        <Route path='*' element={<RootRedirect />} />
      </Routes>
    </>
  )
}
