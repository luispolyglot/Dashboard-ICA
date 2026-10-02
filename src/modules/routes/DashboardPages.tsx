import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GamePage, PhaseLetter } from '../game/ui'
import { NotaDesafianteListView, NotaDesafiantePlayerView } from '../views/NotaDesafianteView'
import {
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import useBreakpoints from '../hooks/useBreakpoints'
import { MobileProfileScreen } from '../components/MobileProfileSheet'
import { t, tn } from '@/i18n'
import { LevelBadge } from '../components/LevelBadge'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { PageLayout } from '../layout/PageLayout'
import { AddView } from '../views/AddView'
import { AdminAnalyticsView } from '../views/AdminAnalyticsView'
import {
  CoachingPersonalizedSessionView,
  CoachingPersonalizedView,
} from '../views/CoachingPersonalizedView'
import { CoachingV2ExerciseView } from '../views/CoachingV2ExerciseView'
import { CalendarIcademyView } from '../views/CalendarIcademyView'
import { FlashcardsModeView } from '../views/FlashcardsModeView'
import { HistoricLeaderboardView } from '../views/HistoricLeaderboardView'
import { LeaderboardView } from '../views/LeaderboardView'
import { HomeView } from '../views/HomeView'
import { GamesIcaView } from '../views/GamesIcaView'
import { IcaChallengesView } from '../views/IcaChallengesView'
import { IcaChallengePlayView } from '../views/IcaChallengePlayView'
import { DailyGameView } from '../views/DailyGameView'
import {
  registerIcaChallengesLocalContext,
} from '../services/icaChallengesLocalBridge'
import { ICA_CHALLENGES_LOCAL } from '../services/icaChallengesLocalMode'
import { ManageCoachingView } from '../views/ManageCoachingView'
import { ManageCoachingCalendarView } from '../views/ManageCoachingCalendarView'
import { ManageCoachingUserView } from '../views/ManageCoachingUserView'
import { ManageCoacherSessionsView } from '../views/ManageCoacherSessionsView'
import { ManageCalendarIcademyView } from '../views/ManageCalendarIcademyView'
import { ManageIcademyTeachersView } from '../views/ManageIcademyTeachersView'
import { ManageNotificationsView } from '../views/ManageNotificationsView'
import { ManagePregunticaQuestionsView } from '../views/ManagePregunticaQuestionsView'
import { ManagePregunticaTokensView } from '../views/ManagePregunticaTokensView'
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
import { FichasView } from '../views/FichasView'
import { InsigniasView } from '../views/InsigniasView'
import { FlashcardsLocked } from '../game/FlashcardsLocked'
import { countNewPhraseToday, useDailyLimits } from '../game/limits'
import { useAuth } from '@/auth/AuthContext'
import { useActivatedWords } from '../game/useActivatedWords'
import { TrackerDetailView } from '../views/TrackerDetailView'
import { TrackersView } from '../views/TrackersView'
import { IcaTestsView } from '../views/IcaTestsView'
import { IcaTestMonthView } from '../views/IcaTestMonthView'
import { InstagramTrackPostsView } from '../views/InstagramTrackPostsView'
import { PregunticaView } from '../views/PregunticaView'
import { PregunticaHistoryView } from '../views/PregunticaHistoryView'
import {
  getReviewConfirmAnswerFromQuery,
  getReviewPendingOnlyFromQuery,
  loadSavedReviewConfirmAnswer,
  loadSavedReviewPendingOnly,
  loadSavedReviewPlayStyle,
  REVIEW_CONFIRM_ANSWER_QUERY_PARAM,
  REVIEW_PENDING_ONLY_QUERY_PARAM,
  REVIEW_PLAY_STYLE_QUERY_PARAM,
  saveReviewConfirmAnswer,
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
import { getEffectiveStudyLevel } from '../utils/studyLevel'
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
    <PageLayout flush>
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
  const { cards, setCards, config, dailyProgress, metaTrackerProfile } = useDashboardContext()
  if (!config) return null
  const todayProgress = getTodayProgress(dailyProgress)
  const studyLevel = getEffectiveStudyLevel(config.targetLang, metaTrackerProfile)

  return (
    <PageLayout flush>
      <ManageView
        cards={cards}
        setCards={setCards}
        config={config}
        studyLevel={studyLevel}
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
  const [confirmBeforeAnswer, setConfirmBeforeAnswer] =
    useState(loadSavedReviewConfirmAnswer())

  useEffect(() => {
    saveReviewPlayStyle(playStyle)
  }, [playStyle])

  useEffect(() => {
    saveReviewPendingOnly(pendingOnly)
  }, [pendingOnly])

  useEffect(() => {
    saveReviewConfirmAnswer(confirmBeforeAnswer)
  }, [confirmBeforeAnswer])

  // Las flashcards se abren con 20 palabras activadas.
  const { activatedWords, flashcardsUnlocked } = useActivatedWords()
  if (!flashcardsUnlocked) {
    return (
      <PageLayout flush backTo={DASHBOARD_ROUTES.gamesIca}>
        <FlashcardsLocked activatedWords={activatedWords} />
      </PageLayout>
    )
  }

  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.gamesIca}>
      <FlashcardsModeView
        cards={cards}
        reviewCorrectToday={todayProgress.reviewCorrect}
        playStyle={playStyle}
        pendingOnly={pendingOnly}
        confirmBeforeAnswer={confirmBeforeAnswer}
        onPlayStyleChange={setPlayStyle}
        onPendingOnlyChange={setPendingOnly}
        onConfirmBeforeAnswerChange={setConfirmBeforeAnswer}
        onStartMode={(mode) =>
          navigate(
            getFlashcardsPlayRoute(
              mode,
              playStyle,
              pendingOnly,
              confirmBeforeAnswer,
            ),
          )
        }
      />
    </PageLayout>
  )
}

export function GamesIcaPage() {
  const { cards, config } = useDashboardContext()
  const [pregunticaLabel, setPregunticaLabel] = useState(
    () => t('Cargando estado semanal...'),
  )
  const [pregunticaProgress, setPregunticaProgress] = useState('0/20')
  const [pregunticaUnlocked, setPregunticaUnlocked] = useState(false)

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
        const displayActivationCount = status.completedAt
          ? status.requiredActivationWords
          : status.activationWordsCount
        setPregunticaProgress(
          `${displayActivationCount}/${status.requiredActivationWords}`,
        )
        if (status.isUnlocked) {
          setPregunticaLabel(t('Lista para responder'))
          return
        }

        const missing = Math.max(
          0,
          status.requiredActivationWords - status.activationWordsCount,
        )
        setPregunticaLabel(
          tn(missing, 'Te falta {n} palabra para desbloquearla', 'Te faltan {n} palabras para desbloquearla'),
        )
      } catch {
        if (!active) return
        setPregunticaLabel(t('No se pudo cargar el estado'))
      }
    }

    void loadStatus()

    return () => {
      active = false
    }
  }, [config])

  return (
    <PageLayout flush withBackButton={false}>
      <GamesIcaView
        flashcardsReady={cards.length > 0}
        flashcardsCount={cards.length}
        pregunticaUnlocked={pregunticaUnlocked}
        pregunticaLabel={pregunticaLabel}
        pregunticaProgress={pregunticaProgress}
      />
    </PageLayout>
  )
}

export function IcaChallengesPage() {
  const { config, cards } = useDashboardContext()
  if (!config) return null
  // Modo local de prueba: el "servidor" del navegador necesita tus palabras e idiomas.
  if (ICA_CHALLENGES_LOCAL) {
    registerIcaChallengesLocalContext({ cards, targetLang: config.targetLang, nativeLang: config.nativeLang })
  }

  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.gamesIca}>
      <IcaChallengesView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
      />
    </PageLayout>
  )
}

export function DailyGamePage() {
  const { config, cards } = useDashboardContext()
  if (!config) return null
  return (
    <PageLayout flush withBackButton={false}>
      <DailyGameView config={config} cards={cards} />
    </PageLayout>
  )
}

export function NotaDesafianteListPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.gamesIca}>
      <NotaDesafianteListView />
    </PageLayout>
  )
}

export function NotaDesafiantePlayerPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.notaDesafiante}>
      <NotaDesafiantePlayerView />
    </PageLayout>
  )
}

/**
 * Activación (notas maestras) solo se abre cuando ya has creado tu frase de hoy (la C).
 * Si no, se ve un aviso y no se puede entrar.
 */
function ActivationGate({ children }: { children: ReactNode }) {
  const { dailyProgress } = useDashboardContext()
  const navigate = useNavigate()
  if (getTodayProgress(dailyProgress).phraseGenerated) return <>{children}</>
  return (
    <PageLayout flush>
      <GamePage className='items-center justify-center text-center'>
        <span className='relative mt-6'>
          <PhaseLetter letter='A' size={96} className='opacity-40 grayscale' />
          <span className='absolute -right-2 -bottom-2 flex size-10 items-center justify-center rounded-full border-4 border-background bg-muted-foreground text-white'>
            <LockIcon className='size-4' strokeWidth={3} aria-hidden='true' />
          </span>
        </span>
        <h1 className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight'>{t('Activación bloqueada')}</h1>
        <p className='m-0 max-w-sm text-sm font-semibold text-muted-foreground'>
          {t('Se abre cuando creas tu frase de hoy. Primero la C, después la A.')}
        </p>
        <Button type='button' size='xl' variant='c' className='w-full max-w-sm' onClick={() => navigate(DASHBOARD_ROUTES.activationPhrase)}>
          {t('Ir a Creación')}
        </Button>
        <Button type='button' variant='ghost' onClick={() => navigate(DASHBOARD_ROUTES.home)}>
          {t('Volver al inicio')}
        </Button>
      </GamePage>
    </PageLayout>
  )
}

export function IcaChallengePlayPage() {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  const { challengeId } = useParams<{ challengeId: string }>()
  if (!config || !challengeId) return null
  if (ICA_CHALLENGES_LOCAL) {
    registerIcaChallengesLocalContext({ cards, targetLang: config.targetLang, nativeLang: config.nativeLang })
  }

  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.challengesIca}>
      <IcaChallengePlayView
        challengeId={challengeId}
        config={config}
        cards={cards}
        setCards={setCards}
        onWordAdded={handleWordAdded}
      />
    </PageLayout>
  )
}

export function PregunticaPage() {
  const { config, cards, setCards, handleWordAdded, metaTrackerProfile } = useDashboardContext()
  if (!config) return null
  const studyLevel = getEffectiveStudyLevel(config.targetLang, metaTrackerProfile)

  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.gamesIca}>
      <PregunticaView
        config={config}
        studyLevel={studyLevel}
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.preguntica}>
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
  const confirmBeforeAnswer = searchParams.has(REVIEW_CONFIRM_ANSWER_QUERY_PARAM)
    ? getReviewConfirmAnswerFromQuery(
        searchParams.get(REVIEW_CONFIRM_ANSWER_QUERY_PARAM),
      )
    : loadSavedReviewConfirmAnswer()

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
  const { flashcardsUnlocked } = useActivatedWords()

  if (!config) return null
  if (!flashcardsUnlocked) {
    return <Navigate to={DASHBOARD_ROUTES.flashcards} replace />
  }
  if (mode !== safeMode) {
    return (
      <Navigate
        to={
          getFlashcardsPlayRoute(
            safeMode,
            playStyle,
            pendingOnly,
            confirmBeforeAnswer,
          )
        }
        replace
      />
    )
  }

  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.flashcards}>
      <ReviewView
        cards={cards}
        setCards={setCards}
        config={config}
        mode={safeMode}
        playStyle={playStyle}
        pendingOnly={pendingOnly}
        confirmBeforeAnswer={confirmBeforeAnswer}
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
    config,
    handlePhraseGenerated,
    metaTrackerProfile,
    setMetaTrackerActivationWordsTotal,
    dailyProgress,
  } = useDashboardContext()
  const { user } = useAuth()
  const dailyLimits = useDailyLimits()
  if (!config) return null

  return (
    <PageLayout flush>
      <PhraseView
        cards={cards}
        config={config}
        onPhraseGenerated={handlePhraseGenerated}
        metaTrackerProfile={metaTrackerProfile}
        onActivationWordsTotalChange={setMetaTrackerActivationWordsTotal}
        LevelBadge={LevelBadge}
        dailyLimits={dailyLimits}
        onNewPhraseCreated={() => countNewPhraseToday(user?.id)}
        creationDoneToday={getTodayProgress(dailyProgress).phraseGenerated}
      />
    </PageLayout>
  )
}

export function PhraseHistoryPage() {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout flush>
      <PhraseHistoryView
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
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
    <ActivationGate>
      <PageLayout flush>
        <MasterNotesView
          targetLang={config.targetLang}
          nativeLang={config.nativeLang}
          todayVoiceActivationsCount={todayProgress.voiceActivationsCount}
        />
      </PageLayout>
    </ActivationGate>
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
    <ActivationGate>
      <PageLayout flush backTo={DASHBOARD_ROUTES.masterNotes}>
        <MasterNoteDetailView
          noteId={noteId}
          targetLang={config.targetLang}
          todayVoiceActivationsCount={todayProgress.voiceActivationsCount}
        />
      </PageLayout>
    </ActivationGate>
  )
}

export function MasterNoteActivatePhrasePage() {
  const { config, cards, setCards, handleWordAdded } = useDashboardContext()
  const { noteId, phraseId } = useParams<{ noteId: string; phraseId: string }>()
  if (!config || !noteId || !phraseId) return null

  return (
    <ActivationGate>
      <PageLayout flush backTo={`${DASHBOARD_ROUTES.masterNotes}/note/${noteId}`}>
        <MasterNoteActivatePhraseView
          noteId={noteId}
          phraseId={phraseId}
          targetLang={config.targetLang}
          nativeLang={config.nativeLang}
          cards={cards}
          setCards={setCards}
          onWordAdded={handleWordAdded}
        />
      </PageLayout>
    </ActivationGate>
  )
}

export function LeaderboardPage() {
  return (
    <PageLayout flush withBackButton={false}>
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
    <PageLayout flush>
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

export function FichasPage() {
  return (
    <PageLayout flush>
      <FichasView />
    </PageLayout>
  )
}

export function InsigniasPage() {
  return (
    <PageLayout flush>
      <InsigniasView />
    </PageLayout>
  )
}

type ProfileOutletContext = { profileAlerts?: { icaTest: boolean; coaching: boolean } } | undefined

/** Perfil: en el móvil, la pantalla completa de la pestaña «Perfil»; en ordenador, el perfil con tu cuenta. */
export function ProfilePage() {
  const { config, cards, setShowLangModal } = useDashboardContext()
  const { isMd } = useBreakpoints()
  const outlet = useOutletContext<ProfileOutletContext>()

  if (!isMd) {
    return (
      <PageLayout flush withBackButton={false}>
        <MobileProfileScreen
          hasIcaTestAlert={Boolean(outlet?.profileAlerts?.icaTest)}
          hasCoachingAlert={Boolean(outlet?.profileAlerts?.coaching)}
        />
      </PageLayout>
    )
  }

  return (
    <PageLayout flush withBackButton={false}>
      <ProfileView
        config={config}
        cards={cards}
        onEditLanguages={() => setShowLangModal(true)}
      />
    </PageLayout>
  )
}

/** Ajustes de cuenta (nombre, idiomas, contraseña, preferencias…). En el móvil se abre desde el perfil. */
export function ProfileAccountPage() {
  const { config, cards, setShowLangModal } = useDashboardContext()
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <ManageNotificationsView />
    </PageLayout>
  )
}

export function MyAnalyticsPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <MyAnalyticsView />
    </PageLayout>
  )
}

export function CalendarIcademyPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <ManageIcademyTeachersView />
    </PageLayout>
  )
}

export function IcaTestsPage() {
  const { config, cards } = useDashboardContext()
  if (!config) return null

  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.testsIca}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.testsIca}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.trackers}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.trackers}>
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
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <AdminAnalyticsView />
    </PageLayout>
  )
}

export function ManageWhitelistPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <ManageWhitelistView />
    </PageLayout>
  )
}

export function ManagePregunticaQuestionsPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <ManagePregunticaQuestionsView />
    </PageLayout>
  )
}

export function ManagePregunticaTokensPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
      <ManagePregunticaTokensView />
    </PageLayout>
  )
}

export function HistoricLeaderboardPage() {
  return (
    <PageLayout flush backTo={DASHBOARD_ROUTES.profile}>
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

export function CoachingPersonalizedSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  if (!sessionId) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.coachingPersonalized}>
      <CoachingPersonalizedSessionView sessionId={sessionId} />
    </PageLayout>
  )
}

export function CoachingV2ExercisePage() {
  const { config } = useDashboardContext()
  const { sessionId, periodNumber, focusId } = useParams<{
    sessionId: string
    periodNumber: string
    focusId: string
  }>()

  if (!sessionId || !periodNumber || !focusId) return null

  const parsedPeriod = Number(periodNumber)
  if (!Number.isFinite(parsedPeriod) || parsedPeriod < 1) return null

  return (
    <PageLayout backTo={DASHBOARD_ROUTES.coachingPersonalized}>
      <CoachingV2ExerciseView
        sessionId={sessionId}
        periodNumber={Math.trunc(parsedPeriod)}
        focusId={focusId}
        targetLang={config?.targetLang}
      />
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

export function ManageCoachingCalendarPage() {
  return (
    <PageLayout withBackButton={false}>
      <ManageCoachingCalendarView />
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
