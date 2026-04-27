import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { LevelBadge } from '../components/LevelBadge'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { PageLayout } from '../layout/PageLayout'
import { AddView } from '../views/AddView'
import { AdminAnalyticsView } from '../views/AdminAnalyticsView'
import { FlashcardsModeView } from '../views/FlashcardsModeView'
import { HomeView } from '../views/HomeView'
import { ManageWhitelistView } from '../views/ManageWhitelistView'
import { ManageView } from '../views/ManageView'
import { ProfileView } from '../views/ProfileView'
import { PhraseHistoryView } from '../views/PhraseHistoryView'
import { PhraseView } from '../views/PhraseView'
import { ReviewView } from '../views/ReviewView'
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

  return (
    <PageLayout>
      <FlashcardsModeView
        cards={cards}
        reviewCorrectToday={todayProgress.reviewCorrect}
        onStartMode={(mode) => navigate(getFlashcardsPlayRoute(mode))}
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
  const navigate = useNavigate()

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
    return <Navigate to={getFlashcardsPlayRoute(safeMode)} replace />
  }

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.flashcards}>
      <ReviewView
        cards={cards}
        setCards={setCards}
        config={config}
        mode={safeMode}
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
