import { useEffect, useRef, useState } from 'react'
import { setUiLang, t, uiLangForNative } from '@/i18n'
import type { CSSProperties, RefObject } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { toast } from 'sonner'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { Header } from '../components/Header'
import { IcaTestsAvailableModal } from '../components/IcaTestsAvailableModal'
import { PregunticaMonthlyTokensModal } from '../components/PregunticaMonthlyTokensModal'
import { getCalendarIcademyCatalogEntry } from '../constants/calendarIcademyCatalog'
import { useIcaTestsOverview } from '../hooks/useIcaTestsOverview'
import { LangEditModal } from '../components/LangEditModal'
import { MobileBottomNav } from '../components/MobileBottomNav'
import { MonthlyRecapHost } from '../game/monthlyRecap'
import { MonthlyReviewAvailableModal } from '../components/MonthlyReviewAvailableModal'
import { IcaWrappedHost } from '../game/wrapped/IcaWrapped'
import { CREATION_WORDS_GOAL, GOAL, getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { useGamesWaiting } from '../hooks/useGamesWaiting'

import {
  fetchCoachingNavSummary,
  type CoachingManagedUser,
} from '../services/coaching'
import { fetchCalendarIcademyEntries } from '../services/calendarIcademy'
import {
  fetchCalendarIcademyPreferences,
  markCalendarIcademyNotificationShown,
} from '../services/calendarIcademyPreferences'
import { buildCalendarIcademyReminders } from '../services/calendarIcademyReminders'
import { fetchCalendarIcademySessionBlacklist } from '../services/calendarIcademySessionBlacklist'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  OFFLINE_SAFE_LAST_PATH_STORAGE_KEY,
  OFFLINE_SAFE_ROUTE_TRIGGER_EVENT,
} from '../offline/events'
import { LanguageSetup } from '../views/LanguageSetup'
import { CycleCelebration } from '../game/CycleCelebration'
import { NewBadgeCelebration } from '../game/NewBadgeCelebration'
import { ProfileGuide, WelcomeTour } from '../game/WelcomeTour'
import { TapHaptics } from '../game/TapHaptics'
import { ChallengesUnlockWatcher } from '../game/ChallengesUnlocked'
import { prefetchAchievementStats } from '../game/achievements'
import { fetchMonthlyStreakLeaderboard } from '../services/leaderboard'
import { StreakDayCelebrationHost } from '../game/StreakDayCelebration'
import { MasterNoteMiniPlayer, MasterNotePlaybackProvider } from '../components/MasterNotePlaybackProvider'
import { StreakRewardsWatcher } from '../game/StreakExtras'

/* Último resumen de coaching de la barra superior, guardado en este navegador:
   al recargar, el botón «Coaching» sale al momento en vez de tardar ~2 s. */
type StoredCoachingNav = {
  hasPendingReviews: boolean
  coachStudents: CoachingManagedUser[] | null
}

const COACHING_NAV_KEY = (userId: string) => `ica.coachingNav.${userId}`

function readStoredCoachingNav(userId: string | undefined): StoredCoachingNav | null {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(COACHING_NAV_KEY(userId))
    return raw ? (JSON.parse(raw) as StoredCoachingNav) : null
  } catch {
    return null
  }
}

function storeCoachingNav(userId: string | undefined, value: StoredCoachingNav): void {
  if (!userId) return
  try {
    window.localStorage.setItem(COACHING_NAV_KEY(userId), JSON.stringify(value))
  } catch {
    /* sin almacenamiento: se cargará como antes */
  }
}

type DailyMilestones = {
  flash: boolean
  ica: boolean
}

type BoltFlightFxProps = {
  trigger: number
  boltButtonRef: RefObject<HTMLButtonElement | null>
  onDone: () => void
}

function BoltFlightFx({ trigger, boltButtonRef, onDone }: BoltFlightFxProps) {
  const [anim, setAnim] = useState<null | {
    sx: number
    sy: number
    tx: number
    ty: number
    id: number
  }>(null)

  useEffect(() => {
    if (!trigger || !boltButtonRef.current) return

    const rect = boltButtonRef.current.getBoundingClientRect()
    const targetX = rect.left + rect.width / 2
    const targetY = rect.top + rect.height / 2
    const startX = window.innerWidth / 2
    const startY = window.innerHeight * 0.72

    setAnim({
      sx: startX,
      sy: startY,
      tx: targetX - startX,
      ty: targetY - startY,
      id: trigger,
    })

    const timeout = window.setTimeout(() => {
      setAnim(null)
      onDone()
    }, 930)

    return () => window.clearTimeout(timeout)
  }, [trigger, boltButtonRef, onDone])

  if (!anim) return null

  const flyingStyle = {
    left: anim.sx,
    top: anim.sy,
    ['--tx' as string]: `${anim.tx}px`,
    ['--ty' as string]: `${anim.ty}px`,
  } as CSSProperties

  return (
    <div className='pointer-events-none fixed inset-0 z-90'>
      <div key={anim.id} className='ica-bolt-fly' style={flyingStyle}>
        <span className='ica-bolt-fly-core' aria-hidden='true' />
      </div>
    </div>
  )
}

export function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    config,
    cards,
    loading,
    showLangModal,
    setShowLangModal,
    dailyProgress,
    handleSetup,
    handleConfigChange,
  } = useDashboardContext()

  const boltButtonRef = useRef<HTMLButtonElement | null>(null)
  const gamesWaiting = useGamesWaiting(config?.targetLang, config?.nativeLang)
  const hasCheckedCalendarNotificationsRef = useRef(false)
  const previousMilestonesRef = useRef<DailyMilestones | null>(null)
  const milestonesReadyRef = useRef(false)
  const [flightQueue, setFlightQueue] = useState(0)
  const [activeFlight, setActiveFlight] = useState(0)
  const { user } = useAuth()

  // Se piden por detrás, al abrir la app, los datos de pantallas muy visitadas
  // (ranking, insignias): así, al entrar en ellas, salen al momento.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchMonthlyStreakLeaderboard(250).catch(() => undefined)
      prefetchAchievementStats(user?.id)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  // La interfaz va en el idioma nativo del alumno (español → español; el resto → inglés).
  useEffect(() => {
    if (config?.nativeLang) setUiLang(uiLangForNative(config.nativeLang))
  }, [config?.nativeLang])
  const [hasPendingCoachingReview, setHasPendingCoachingReview] = useState(
    () => readStoredCoachingNav(user?.id)?.hasPendingReviews ?? false,
  )
  const [coachStudents, setCoachStudents] = useState<
    CoachingManagedUser[] | null
  >(() => readStoredCoachingNav(user?.id)?.coachStudents ?? null)
  const { canHighlightCurrentMonth } = useIcaTestsOverview({
    targetLang: config?.targetLang,
    nativeLang: config?.nativeLang,
    cards,
  })

  useEffect(() => {
    const navigateToOfflineSafe = () => {
      if (location.pathname === DASHBOARD_ROUTES.offlineSafe) return

      const currentPath = `${location.pathname}${location.search}${location.hash}`
      window.sessionStorage.setItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY, currentPath)
      navigate(DASHBOARD_ROUTES.offlineSafe, {
        replace: true,
      })
    }

    const onNetworkUnreachable = () => {
      navigateToOfflineSafe()
    }

    const onOffline = () => {
      navigateToOfflineSafe()
    }

    window.addEventListener(OFFLINE_SAFE_ROUTE_TRIGGER_EVENT, onNetworkUnreachable)
    window.addEventListener('offline', onOffline)

    if (!navigator.onLine) {
      navigateToOfflineSafe()
    }

    return () => {
      window.removeEventListener(OFFLINE_SAFE_ROUTE_TRIGGER_EVENT, onNetworkUnreachable)
      window.removeEventListener('offline', onOffline)
    }
  }, [location.hash, location.pathname, location.search, navigate])

  useEffect(() => {
    if (loading) return
    let active = true

    const refreshPendingCoachingReview = async (): Promise<void> => {
      try {
        const summary = await fetchCoachingNavSummary()
        if (!active) return
        const nextCoachStudents = summary.isCoachingAdmin ? summary.activeStudents : null
        setHasPendingCoachingReview(summary.hasPendingReviews)
        setCoachStudents(nextCoachStudents)
        storeCoachingNav(user?.id, {
          hasPendingReviews: summary.hasPendingReviews,
          coachStudents: nextCoachStudents,
        })
      } catch {
        if (!active) return
        setHasPendingCoachingReview(false)
      }
    }

    void refreshPendingCoachingReview()

    const onFocus = () => {
      void refreshPendingCoachingReview()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshPendingCoachingReview()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loading, location.pathname, user?.id])

  useEffect(() => {
    if (loading) return

    const progress = getTodayProgress(dailyProgress)
    const hasFiveWords = progress.wordsAdded >= CREATION_WORDS_GOAL
    const currentMilestones: DailyMilestones = {
      flash: progress.reviewCorrect >= GOAL,
      ica:
        hasFiveWords && progress.phraseGenerated && progress.voiceActivationsCount > 0,
    }

    if (!milestonesReadyRef.current) {
      previousMilestonesRef.current = currentMilestones
      milestonesReadyRef.current = true
      return
    }

    const previous = previousMilestonesRef.current

    if (previous) {
      const newCompletions =
        Number(!previous.flash && currentMilestones.flash) +
        Number(!previous.ica && currentMilestones.ica)

      if (newCompletions > 0) {
        setFlightQueue((value) => value + newCompletions)
      }

      // Modo juego: al cerrar el ciclo ICA, avisar de que el cofre está listo.
      if (!previous.ica && currentMilestones.ica) {
        toast.success(t('¡Ciclo ICA completado!'), {
          description: t('Tu cofre del ciclo te espera en Inicio.'),
          action: {
            label: t('Abrir'),
            onClick: () => navigate(DASHBOARD_ROUTES.home),
          },
          duration: 8000,
        })
      }
    }

    previousMilestonesRef.current = currentMilestones
  }, [dailyProgress, loading, navigate])

  useEffect(() => {
    if (loading || hasCheckedCalendarNotificationsRef.current) return

    hasCheckedCalendarNotificationsRef.current = true
    let active = true

    const run = async () => {
      try {
        const [entries, preferences, blacklist] = await Promise.all([
          fetchCalendarIcademyEntries(),
          fetchCalendarIcademyPreferences().catch(() => []),
          fetchCalendarIcademySessionBlacklist().catch(() => []),
        ])

        if (!active || preferences.length === 0) return

        const mutedSessionIds = blacklist.map((item) => item.calendarEntryId)

        const reminders = buildCalendarIcademyReminders({
          entries,
          preferences,
          blacklistedSessionIds: mutedSessionIds,
        }).slice(0, 2)

        for (const reminder of reminders) {
          const sessionKey = `calendar-icademy-reminder:${reminder.entry.id}`
          const sessionFingerprint = `${reminder.entry.sessionDate}:${reminder.entry.sessionTime}`

          if (window.localStorage.getItem(sessionKey) === sessionFingerprint) {
            continue
          }

          const whenLabel =
            reminder.minutesUntilStart <= 0
              ? t('Comienza en breve')
              : t('Empieza en {n} min', { n: reminder.minutesUntilStart })
          const catalogEntry = getCalendarIcademyCatalogEntry(
            reminder.entry.classKey,
          )
          const classLabel = catalogEntry
            ? `${catalogEntry.flag} ${catalogEntry.className}`
            : reminder.entry.className

          toast.info(t('Clase ICADEMY: {label}', { label: classLabel }), {
            description: t('{when} · {time} · con {teacher}', {
              when: whenLabel,
              time: reminder.entry.sessionTime,
              teacher: reminder.entry.teacher,
            }),
            action: {
              label: t('Abrir'),
              onClick: () => navigate(DASHBOARD_ROUTES.calendarIcademy),
            },
            duration: 12000,
          })

          window.localStorage.setItem(sessionKey, sessionFingerprint)
          void markCalendarIcademyNotificationShown({
            classKey: reminder.entry.classKey,
            sessionId: reminder.entry.id,
          }).catch(() => {})
        }
      } catch {}
    }

    void run()

    return () => {
      active = false
    }
  }, [loading, navigate])

  useEffect(() => {
    if (activeFlight !== 0 || flightQueue <= 0) return
    setActiveFlight(Date.now())
    setFlightQueue((value) => value - 1)
  }, [activeFlight, flightQueue])

  if (loading) {
    return <FullscreenLoading label={t('Cargando...')} />
  }

  if (!config) {
    return (
      <div className='min-h-screen bg-background text-foreground'>
        <LanguageSetup onSave={handleSetup} />
      </div>
    )
  }

  const todayProgress = getTodayProgress(dailyProgress)

  return (
    <MasterNotePlaybackProvider>
    <div className='flex h-[calc(100dvh-0rem)] grow'>
      <div className='bg-background flex h-[calc(100dvh-0rem)] min-w-0 flex-1 flex-col'>
        <Header
          dailyProgress={dailyProgress}
          voiceActivationsToday={todayProgress.voiceActivationsCount}
          shouldHighlightProfileButton={canHighlightCurrentMonth}
          shouldHighlightCoachingProfileButton={hasPendingCoachingReview}
          coachStudents={coachStudents}
          gamesWaiting={gamesWaiting}
          boltButtonRef={(node) => {
            boltButtonRef.current = node
          }}
        />

        {showLangModal && (
          <LangEditModal
            config={config}
            setConfig={handleConfigChange}
            onClose={() => setShowLangModal(false)}
          />
        )}

        <IcaTestsAvailableModal config={config} cards={cards} />
        <MonthlyReviewAvailableModal targetLang={config?.targetLang} nativeLang={config?.nativeLang} />
        <PregunticaMonthlyTokensModal />

        {/* En columna: así cada pantalla crece con su contenido y el scroll llega hasta el final.
            Abajo deja sitio a la barra del móvil (y a la zona segura del iPhone). */}
        {/* A master note that is playing keeps playing on every screen, with this player on top. */}
        <MasterNoteMiniPlayer />
        <main className='flex flex-1 flex-col overflow-y-auto pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0'>
          <Outlet context={{ profileAlerts: { icaTest: canHighlightCurrentMonth, coaching: hasPendingCoachingReview } }} />
        </main>
        <MobileBottomNav
          shouldHighlightProfileButton={canHighlightCurrentMonth}
          shouldHighlightCoachingProfileButton={hasPendingCoachingReview}
          gamesWaiting={gamesWaiting}
        />

        <CycleCelebration />
        <NewBadgeCelebration />
        <WelcomeTour />
        <ProfileGuide />
        <TapHaptics />
        <ChallengesUnlockWatcher />
        <StreakDayCelebrationHost />
        <MonthlyRecapHost />
        <IcaWrappedHost />
        <StreakRewardsWatcher />

        <BoltFlightFx
          trigger={activeFlight}
          boltButtonRef={boltButtonRef}
          onDone={() => setActiveFlight(0)}
        />
      </div>
    </div>
    </MasterNotePlaybackProvider>
  )
}
