import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LevelBadge } from '../components/LevelBadge'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { PageLayout } from '../layout/PageLayout'
import { AddView } from '../views/AddView'
import { AdminAnalyticsView } from '../views/AdminAnalyticsView'
import { FlashcardsModeView } from '../views/FlashcardsModeView'
import { HistoricLeaderboardView } from '../views/HistoricLeaderboardView'
import { LeaderboardView } from '../views/LeaderboardView'
import { HomeView } from '../views/HomeView'
import { ManageWhitelistView } from '../views/ManageWhitelistView'
import { ManageView } from '../views/ManageView'
import { MasterNoteActivatePhraseView } from '../views/MasterNoteActivatePhraseView'
import { MasterNoteDetailView } from '../views/MasterNoteDetailView'
import { MasterNotesView } from '../views/MasterNotesView'
import { NewTrackerView } from '../views/NewTrackerView'
import { ProfileView } from '../views/ProfileView'
import { PhraseHistoryView } from '../views/PhraseHistoryView'
import { PhraseView } from '../views/PhraseView'
import { ReviewView } from '../views/ReviewView'
import { StreaksView } from '../views/StreaksView'
import { TrackerDetailView } from '../views/TrackerDetailView'
import { TrackersView } from '../views/TrackersView'
import {
  getReviewPendingOnlyFromQuery,
  loadSavedReviewPlayStyle,
  REVIEW_PENDING_ONLY_QUERY_PARAM,
  REVIEW_PLAY_STYLE_QUERY_PARAM,
  saveReviewPlayStyle,
  getReviewPlayStyleFromQuery,
  type ReviewPlayStyle,
} from '../review/playStyle'
import type { ReviewMode } from '../types'
import { DASHBOARD_ROUTES, getFlashcardsPlayRoute } from './paths'

export function HomePage() {
  const { cards, config, dailyProgress } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout withBackButton={false}>
      <HomeView config={config} cardCount={cards.length} dailyProgress={dailyProgress} />
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

export function MyIcaWordsPage() {
  const { cards, setCards, config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <ManageView cards={cards} setCards={setCards} config={config} />
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
  const [pendingOnly, setPendingOnly] = useState(false)

  useEffect(() => {
    saveReviewPlayStyle(playStyle)
  }, [playStyle])

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
    config,
    handlePhraseGenerated,
    setMetaTrackerActivationWordsTotal,
  } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <PhraseView
        cards={cards}
        config={config}
        onPhraseGenerated={handlePhraseGenerated}
        onActivationWordsTotalChange={setMetaTrackerActivationWordsTotal}
        LevelBadge={LevelBadge}
      />
    </PageLayout>
  )
}

export function PhraseHistoryPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <PhraseHistoryView targetLang={config.targetLang} />
    </PageLayout>
  )
}

export function MasterNotesPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <MasterNotesView targetLang={config.targetLang} />
    </PageLayout>
  )
}

export function MasterNoteDetailPage() {
  const { config } = useDashboardContext()
  const { noteId } = useParams<{ noteId: string }>()
  if (!config || !noteId) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.masterNotes}>
      <MasterNoteDetailView noteId={noteId} targetLang={config.targetLang} />
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
  const { completedDays, creationDays } = useDashboardContext()

  return (
    <PageLayout>
      <StreaksView completedDays={completedDays} creationDays={creationDays} />
    </PageLayout>
  )
}

export function ProfilePage() {
  const { config, setShowLangModal } = useDashboardContext()

  return (
    <PageLayout>
      <ProfileView
        config={config}
        onEditLanguages={() => setShowLangModal(true)}
      />
    </PageLayout>
  )
}

export function TrackersPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout>
      <TrackersView targetLang={config.targetLang} nativeLang={config.nativeLang} />
    </PageLayout>
  )
}

export function NewTrackerPage() {
  const { config } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.trackers}>
      <NewTrackerView targetLang={config.targetLang} nativeLang={config.nativeLang} />
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
    <PageLayout>
      <AdminAnalyticsView />
    </PageLayout>
  )
}

export function ManageWhitelistPage() {
  return (
    <PageLayout>
      <ManageWhitelistView />
    </PageLayout>
  )
}

export function HistoricLeaderboardPage() {
  return (
    <PageLayout>
      <HistoricLeaderboardView />
    </PageLayout>
  )
}
