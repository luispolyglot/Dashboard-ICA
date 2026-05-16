import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { Header } from '../components/Header'
import { LangEditModal } from '../components/LangEditModal'
import { MobileBottomNav } from '../components/MobileBottomNav'
import { CREATION_WORDS_GOAL, GOAL, getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { fetchTodayVoiceActivationCount } from '../services/phraseVoiceActivations'
import { LanguageSetup } from '../views/LanguageSetup'

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
  const {
    config,
    loading,
    showLangModal,
    setShowLangModal,
    dailyProgress,
    handleSetup,
    handleConfigChange,
  } = useDashboardContext()

  const boltButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousMilestonesRef = useRef<DailyMilestones | null>(null)
  const milestonesReadyRef = useRef(false)
  const [flightQueue, setFlightQueue] = useState(0)
  const [activeFlight, setActiveFlight] = useState(0)
  const [voiceActivationsToday, setVoiceActivationsToday] = useState(0)

  useEffect(() => {
    if (loading) return
    let active = true

    const refreshVoiceActivations = async (): Promise<void> => {
      try {
        const count = await fetchTodayVoiceActivationCount()
        if (!active) return
        setVoiceActivationsToday(count)
      } catch {
        if (!active) return
        setVoiceActivationsToday(0)
      }
    }

    void refreshVoiceActivations()

    const onFocus = () => {
      void refreshVoiceActivations()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshVoiceActivations()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [dailyProgress, loading, location.pathname])

  useEffect(() => {
    if (loading) return

    const progress = getTodayProgress(dailyProgress)
    const hasFiveWords = progress.wordsAdded >= CREATION_WORDS_GOAL
    const currentMilestones: DailyMilestones = {
      flash: progress.reviewCorrect >= GOAL,
      ica: hasFiveWords && progress.phraseGenerated && voiceActivationsToday > 0,
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
    }

    previousMilestonesRef.current = currentMilestones
  }, [dailyProgress, loading, voiceActivationsToday])

  useEffect(() => {
    if (activeFlight !== 0 || flightQueue <= 0) return
    setActiveFlight(Date.now())
    setFlightQueue((value) => value - 1)
  }, [activeFlight, flightQueue])

  if (loading) {
    return <FullscreenLoading label='Cargando...' />
  }

  if (!config) {
    return (
      <div className='min-h-screen bg-background text-foreground'>
        <LanguageSetup onSave={handleSetup} />
      </div>
    )
  }

  return (
    <div className='flex h-[calc(100dvh-0rem)] grow'>
      <div className='bg-background flex h-[calc(100dvh-0rem)] min-w-0 flex-1 flex-col'>
        <Header
          dailyProgress={dailyProgress}
          voiceActivationsToday={voiceActivationsToday}
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

        <main className='flex flex-1 overflow-y-auto pb-20 md:pb-0'>
          <Outlet />
        </main>
        <MobileBottomNav />

        <BoltFlightFx
          trigger={activeFlight}
          boltButtonRef={boltButtonRef}
          onDone={() => setActiveFlight(0)}
        />
      </div>
    </div>
  )
}
