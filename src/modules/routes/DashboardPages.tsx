import { useNavigate } from 'react-router-dom'
import { LevelBadge } from '../components/LevelBadge'
import { useDashboardContext } from '../context/DashboardContext'
import { PageLayout } from '../layout/PageLayout'
import { AddView } from '../views/AddView'
import { AdminAnalyticsView } from '../views/AdminAnalyticsView'
import { HomeView } from '../views/HomeView'
import { ManageView } from '../views/ManageView'
import { ProfileView } from '../views/ProfileView'
import { PhraseHistoryView } from '../views/PhraseHistoryView'
import { PhraseView } from '../views/PhraseView'
import { ReviewView } from '../views/ReviewView'

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
  const {
    cards,
    setCards,
    config,
    completedDays,
    setCompletedDays,
    reviewSession,
    startReviewSession,
    handleReviewAnswer,
  } = useDashboardContext()
  const navigate = useNavigate()
  if (!config) return null

  return (
    <PageLayout>
      <ReviewView
        cards={cards}
        setCards={setCards}
        config={config}
        completedDays={completedDays}
        setCompletedDays={setCompletedDays}
        reviewSession={reviewSession}
        startReviewSession={startReviewSession}
        onReviewAnswered={handleReviewAnswer}
        onFinishPractice={() => navigate('/')}
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
