import { useEffect, useMemo, useState } from 'react'
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { LevelBadge } from '../components/LevelBadge'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { PageLayout } from '../layout/PageLayout'
import { AddView } from '../views/AddView'
import { AdminAnalyticsView } from '../views/AdminAnalyticsView'
import { CoachingPersonalizedView } from '../views/CoachingPersonalizedView'
import { CalendarIcademyView } from '../views/CalendarIcademyView'
import { FlashcardsModeView } from '../views/FlashcardsModeView'
import { HistoricLeaderboardView } from '../views/HistoricLeaderboardView'
import { LeaderboardView } from '../views/LeaderboardView'
import { HomeView } from '../views/HomeView'
import { GamesIcaView } from '../views/GamesIcaView'
import { ManageCoachingView } from '../views/ManageCoachingView'
import { ManageCoachingUserView } from '../views/ManageCoachingUserView'
import { ManageCoacherSessionsView } from '../views/ManageCoacherSessionsView'
import { ManageCalendarIcademyView } from '../views/ManageCalendarIcademyView'
import { ManageIcademyTeachersView } from '../views/ManageIcademyTeachersView'
import { ManageNotificationsView } from '../views/ManageNotificationsView'
import { ManagePregunticaQuestionsView } from '../views/ManagePregunticaQuestionsView'
import { ManageWhitelistView } from '../views/ManageWhitelistView'
import { ManageView } from '../views/ManageView'
import { MasterNoteActivatePhraseView } from '../views/MasterNoteActivatePhraseView'
import { MasterNoteDetailView } from '../views/MasterNoteDetailView'
import { MasterNotesView } from '../views/MasterNotesView'
import { MyAnalyticsView } from '../views/MyAnalyticsView'
import { NewTrackerView } from '../views/NewTrackerView'
import { OfflineSafeView } from '../views/OfflineSafeView'
import { ProfileView } from '../views/ProfileView'
import { PhraseHistoryView } from '../views/PhraseHistoryView'
import { PhraseView } from '../views/PhraseView'
import { ReviewView } from '../views/ReviewView'
import { StreaksView } from '../views/StreaksView'
import { TrackerDetailView } from '../views/TrackerDetailView'
import { TrackersView } from '../views/TrackersView'
import { IcaTestsView } from '../views/IcaTestsView'
import { IcaTestMonthView } from '../views/IcaTestMonthView'
import { InstagramTrackPostsView } from '../views/InstagramTrackPostsView'
import { PregunticaView } from '../views/PregunticaView'
import { PregunticaHistoryView } from '../views/PregunticaHistoryView'
import {
  getReviewPendingOnlyFromQuery,
  loadSavedReviewPendingOnly,
  loadSavedReviewPlayStyle,
  REVIEW_PENDING_ONLY_QUERY_PARAM,
  REVIEW_PLAY_STYLE_QUERY_PARAM,
  saveReviewPendingOnly,
  saveReviewPlayStyle,
  getReviewPlayStyleFromQuery,
  type ReviewPlayStyle,
} from '../review/playStyle'
import {
  getSharedTargetFromParams,
  SHARE_TARGET_INPUT_QUERY_PARAM,
  SHARE_TARGET_SOURCE,
  SHARE_TARGET_SOURCE_QUERY_PARAM,
} from '../shareTarget'
import type { ReviewMode } from '../types'
import { DASHBOARD_ROUTES, getFlashcardsPlayRoute } from './paths'

export function HomePage() {
  const { cards, config, dailyProgress } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout withBackButton={false}>
      <HomeView
        config={config}
        cardCount={cards.length}
        dailyProgress={dailyProgress}
      />
    </PageLayout>
  )
}

export function NewIcaWordsPage() {
  const { cards, setCards, config, dailyProgress, handleWordAdded } =
    useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <AddView
        cards={cards}
        setCards={setCards}
        config={config}
        dailyProgress={dailyProgress}
        onWordAdded={handleWordAdded}
      />
    </PageLayout>
  )
}

export function ShareTargetPage() {
  const [searchParams] = useSearchParams()
  const sharedTarget = getSharedTargetFromParams(searchParams)
  const params = new URLSearchParams()

  if (sharedTarget) {
    params.set(SHARE_TARGET_INPUT_QUERY_PARAM, sharedTarget)
  }
  params.set(SHARE_TARGET_SOURCE_QUERY_PARAM, SHARE_TARGET_SOURCE)

  const query = params.toString()
  const destination = query
    ? `${DASHBOARD_ROUTES.newIcaWords}?${query}`
    : DASHBOARD_ROUTES.newIcaWords

  return <Navigate to={destination} replace />
}

export function MyIcaWordsPage() {
  const { cards, setCards, config, dailyProgress } = useDashboardContext()
  if (!config) return null
  const todayProgress = getTodayProgress(dailyProgress)

  return (
    <PageLayout>
      <ManageView
        cards={cards}
        setCards={setCards}
        config={config}
        todayWordsAdded={todayProgress.wordsAdded}
      />
    </PageLayout>
  )
}

export function FlashcardsPage() {
  const { cards, dailyProgress } = useDashboardContext()
  const navigate = useNavigate()
  const todayProgress = getTodayProgress(dailyProgress)
  const [playStyle, setPlayStyle] = useState<ReviewPlayStyle>(
    loadSavedReviewPlayStyle(),
  )
  const [pendingOnly, setPendingOnly] = useState(loadSavedReviewPendingOnly())

  useEffect(() => {
    saveReviewPlayStyle(playStyle)
  }, [playStyle])

  useEffect(() => {
    saveReviewPendingOnly(pendingOnly)
  }, [pendingOnly])

  return (
    <PageLayout>
      <FlashcardsModeView
        cards={cards}
        reviewCorrectToday={todayProgress.reviewCorrect}
        playStyle={playStyle}
        pendingOnly={pendingOnly}
        onPlayStyleChange={setPlayStyle}
        onPendingOnlyChange={setPendingOnly}
        onStartMode={(mode) =>
          navigate(getFlashcardsPlayRoute(mode, playStyle, pendingOnly))
        }
      />
    </PageLayout>
  )
}

export function GamesIcaPage() {
  const { cards, config } = useDashboardContext()
  const [pregunticaLabel, setPregunticaLabel] = useState(
    'Cargando estado semanal...',
  )
  const [pregunticaProgress, setPregunticaProgress] = useState('0/20')
  const [pregunticaUnlocked, setPregunticaUnlocked] = useState(false)
  const [showPregunticaPulse, setShowPregunticaPulse] = useState(false)

  useEffect(() => {
    let active = true

    const loadStatus = async () => {
      try {
        const { fetchPregunticaWeekStatus } =
          await import('../services/preguntica')
        if (!config) return
        const status = await fetchPregunticaWeekStatus({
          targetLang: config.targetLang,
          nativeLang: config.nativeLang,
        })
        if (!active || !status) return

        setPregunticaUnlocked(status.isUnlocked)
        setShowPregunticaPulse(status.isUnlocked && !status.completedAt)
        setPregunticaProgress(
          `${status.activationWordsCount}/${status.requiredActivationWords}`,
        )
        if (status.isUnlocked) {
          setPregunticaLabel('Lista para responder')
          return
        }

        const missing = Math.max(
          0,
          status.requiredActivationWords - status.activationWordsCount,
        )
        setPregunticaLabel(`Te faltan ${missing} palabras para desbloquearla`)
      } catch {
        if (!active) return
        setPregunticaLabel('No se pudo cargar el estado')
        setShowPregunticaPulse(false)
      }
    }

    void loadStatus()

    return () => {
      active = false
    }
  }, [config])

  return (
    <PageLayout>
      <GamesIcaView
        flashcardsReady={cards.length > 0}
        flashcardsCount={cards.length}
        pregunticaUnlocked={pregunticaUnlocked}
        pregunticaLabel={pregunticaLabel}
        pregunticaProgress={pregunticaProgress}
        showPregunticaPulse={showPregunticaPulse}
      />
    </PageLayout>
  )
}

export function PregunticaPage() {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.gamesIca}>
      <PregunticaView
        config={config}
        cards={cards}
        setCards={setCards}
        onWordAdded={handleWordAdded}
      />
    </PageLayout>
  )
}

export function PregunticaHistoryPage() {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.preguntica}>
      <PregunticaHistoryView
        config={config}
        cards={cards}
        setCards={setCards}
        onWordAdded={handleWordAdded}
      />
    </PageLayout>
  )
}

export function FlashcardsPlayPage() {
  const {
    cards,
    setCards,
    config,
    dailyProgress,
    completedDays,
    setCompletedDays,
    reviewSession,
    startReviewSession,
    handleWordAdded,
    handleReviewAnswer,
  } = useDashboardContext()
  const { mode } = useParams<{ mode: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const playStyle = getReviewPlayStyleFromQuery(
    searchParams.get(REVIEW_PLAY_STYLE_QUERY_PARAM),
  )
  const pendingOnly = getReviewPendingOnlyFromQuery(
    searchParams.get(REVIEW_PENDING_ONLY_QUERY_PARAM),
  )

  const safeMode = useMemo<ReviewMode>(() => {
    const validModes: ReviewMode[] = [
      'mixed',
      'vital',
      'frequent',
      'occasional',
      'rare',
      'irrelevant',
    ]
    return validModes.includes((mode || '') as ReviewMode)
      ? (mode as ReviewMode)
      : 'mixed'
  }, [mode])

  const todayProgress = getTodayProgress(dailyProgress)

  if (!config) return null
  if (mode !== safeMode) {
    return (
      <Navigate
        to={getFlashcardsPlayRoute(safeMode, playStyle, pendingOnly)}
        replace
      />
    )
  }

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.flashcards}>
      <ReviewView
        cards={cards}
        setCards={setCards}
        config={config}
        mode={safeMode}
        playStyle={playStyle}
        pendingOnly={pendingOnly}
        globalCorrectToday={todayProgress.reviewCorrect}
        completedDays={completedDays}
        setCompletedDays={setCompletedDays}
        reviewSession={reviewSession}
        startReviewSession={startReviewSession}
        onWordAdded={handleWordAdded}
        onReviewAnswered={handleReviewAnswer}
        onChooseMode={() => navigate(DASHBOARD_ROUTES.flashcards)}
        onFinishPractice={() => navigate(DASHBOARD_ROUTES.home)}
      />
    </PageLayout>
  )
}

export function ActivationPhrasePage() {
  const {
    cards,
    setCards,
    config,
    handleWordAdded,
    handlePhraseGenerated,
    metaTrackerProfile,
    setMetaTrackerActivationWordsTotal,
  } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <PhraseView
        cards={cards}
        setCards={setCards}
        config={config}
        onWordAdded={handleWordAdded}
        onPhraseGenerated={handlePhraseGenerated}
        metaTrackerProfile={metaTrackerProfile}
        onActivationWordsTotalChange={setMetaTrackerActivationWordsTotal}
        LevelBadge={LevelBadge}
      />
    </PageLayout>
  )
}

export function PhraseHistoryPage() {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <PhraseHistoryView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        level={config.level || 'A1'}
        cards={cards}
        setCards={setCards}
        onWordAdded={handleWordAdded}
      />
    </PageLayout>
  )
}

export function MasterNotesPage() {
  const { config, dailyProgress } = useDashboardContext()
  if (!config) return null
  const todayProgress = getTodayProgress(dailyProgress)

  return (
    <PageLayout>
      <MasterNotesView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        todayVoiceActivationsCount={todayProgress.voiceActivationsCount}
      />
    </PageLayout>
  )
}

export function OfflineSafePage() {
  return (
    <PageLayout withBackButton={false}>
      <OfflineSafeView />
    </PageLayout>
  )
}

export function MasterNoteDetailPage() {
  const { config, dailyProgress } = useDashboardContext()
  const { noteId } = useParams<{ noteId: string }>()
  if (!config || !noteId) return null
  const todayProgress = getTodayProgress(dailyProgress)

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.masterNotes}>
      <MasterNoteDetailView
        noteId={noteId}
        targetLang={config.targetLang}
        todayVoiceActivationsCount={todayProgress.voiceActivationsCount}
      />
    </PageLayout>
  )
}

export function MasterNoteActivatePhrasePage() {
  const { config } = useDashboardContext()
  const { noteId, phraseId } = useParams<{ noteId: string; phraseId: string }>()
  if (!config || !noteId || !phraseId) return null

  return (
    <PageLayout backTo={`${DASHBOARD_ROUTES.masterNotes}/note/${noteId}`}>
      <MasterNoteActivatePhraseView
        noteId={noteId}
        phraseId={phraseId}
        targetLang={config.targetLang}
      />
    </PageLayout>
  )
}

export function LeaderboardPage() {
  return (
    <PageLayout>
      <LeaderboardView />
    </PageLayout>
  )
}

export function StreaksPage() {
  const {
    completedDays,
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
  } = useDashboardContext()

  return (
    <PageLayout>
      <StreaksView
        completedDays={completedDays}
        creationDays={creationDays}
        savedCreationDays={savedCreationDays}
        creationSavesUsedThisMonth={creationSavesUsedThisMonth}
        creationSavesLimit={creationSavesLimit}
      />
    </PageLayout>
  )
}

export function ProfilePage() {
  const { config, cards, setShowLangModal } = useDashboardContext()

  return (
    <PageLayout>
      <ProfileView
        config={config}
        cards={cards}
        onEditLanguages={() => setShowLangModal(true)}
      />
    </PageLayout>
  )
}

export function ManageNotificationsPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <ManageNotificationsView />
    </PageLayout>
  )
}

export function MyAnalyticsPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <MyAnalyticsView />
    </PageLayout>
  )
}

export function CalendarIcademyPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <CalendarIcademyView />
    </PageLayout>
  )
}

export function CalendarIcademyManagePage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <ManageCalendarIcademyView />
    </PageLayout>
  )
}

export function CalendarIcademyTeachersPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <ManageIcademyTeachersView />
    </PageLayout>
  )
}

export function IcaTestsPage() {
  const { config, cards } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <IcaTestsView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        cards={cards}
      />
    </PageLayout>
  )
}

export function InstagramTrackPostsPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <InstagramTrackPostsView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
      />
    </PageLayout>
  )
}

export function IcaTestMonthPage() {
  const { config, cards } = useDashboardContext()
  const { monthCode } = useParams<{ monthCode: string }>()
  if (!config || !monthCode) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.testsIca}>
      <IcaTestMonthView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        cards={cards}
        monthCode={monthCode}
        mode='official'
      />
    </PageLayout>
  )
}

export function IcaTestMonthRedoPage() {
  const { config, cards } = useDashboardContext()
  const { monthCode } = useParams<{ monthCode: string }>()
  if (!config || !monthCode) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.testsIca}>
      <IcaTestMonthView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        cards={cards}
        monthCode={monthCode}
        mode='redo'
      />
    </PageLayout>
  )
}

export function TrackersPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <TrackersView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
      />
    </PageLayout>
  )
}

export function NewTrackerPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.trackers}>
      <NewTrackerView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
      />
    </PageLayout>
  )
}

export function TrackerDetailPage() {
  const { config } = useDashboardContext()
  const { trackerId } = useParams<{ trackerId: string }>()
  if (!config || !trackerId) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.trackers}>
      <TrackerDetailView
        trackerId={trackerId}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
      />
    </PageLayout>
  )
}

export function AnalyticsPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <AdminAnalyticsView />
    </PageLayout>
  )
}

export function ManageWhitelistPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <ManageWhitelistView />
    </PageLayout>
  )
}

export function ManagePregunticaQuestionsPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <ManagePregunticaQuestionsView />
    </PageLayout>
  )
}

export function HistoricLeaderboardPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <HistoricLeaderboardView />
    </PageLayout>
  )
}

export function CoachingPersonalizedPage() {
  const { config } = useDashboardContext()

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <CoachingPersonalizedView targetLang={config?.targetLang} />
    </PageLayout>
  )
}

export function ManageCoachingPage() {
  return (
    <PageLayout backTo={DASHBOARD_ROUTES.profile}>
      <ManageCoachingView />
    </PageLayout>
  )
}

export function ManageCoachingUserPage() {
  const { userId } = useParams<{ userId: string }>()
  const [searchParams] = useSearchParams()

  if (!userId) return null

  return (
    <PageLayout withBackButton={false}>
      <ManageCoachingUserView
        userId={userId}
        initialSessionId={searchParams.get('sessionId')}
      />
    </PageLayout>
  )
}

export function ManageCoacherSessionsPage() {
  const { coachUserId } = useParams<{ coachUserId: string }>()
  if (!coachUserId) return null

  return (
    <PageLayout withBackButton={false}>
      <ManageCoacherSessionsView coachUserId={coachUserId} />
    </PageLayout>
  )
}
