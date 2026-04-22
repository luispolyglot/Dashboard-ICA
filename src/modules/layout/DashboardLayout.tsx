import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Outlet } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { CalendarModal } from '../components/CalendarModal'
import { Header } from '../components/Header'
import { LangEditModal } from '../components/LangEditModal'
import { MobileBottomNav } from '../components/MobileBottomNav'
import { CREATION_WORDS_GOAL, GOAL, getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
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
    <div className='pointer-events-none fixed inset-0 z-[90]'>
      <div key={anim.id} className='ica-bolt-fly' style={flyingStyle}>
        <span className='ica-bolt-fly-core' aria-hidden='true' />
      </div>
    </div>
  )
}

export function DashboardLayout() {
  const {
    config,
    loading,
    showLangModal,
    setShowLangModal,
    showCalendar,
    setShowCalendar,
    calendarTab,
    completedDays,
    creationDays,
    dailyProgress,
    handleSetup,
    handleConfigChange,
    openCalendar,
  } = useDashboardContext()

  const boltButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousMilestonesRef = useRef<DailyMilestones | null>(null)
  const milestonesReadyRef = useRef(false)
  const [flightQueue, setFlightQueue] = useState(0)
  const [activeFlight, setActiveFlight] = useState(0)

  useEffect(() => {
    if (loading) return

    const progress = getTodayProgress(dailyProgress)
    const hasFiveWords = progress.wordsAdded >= CREATION_WORDS_GOAL
    const currentMilestones: DailyMilestones = {
      flash: progress.reviewCorrect >= GOAL,
      ica: hasFiveWords && progress.phraseGenerated,
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
  }, [dailyProgress, loading])

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
          onOpenCalendar={openCalendar}
          dailyProgress={dailyProgress}
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

        {showCalendar && (
          <CalendarModal
            completedDays={completedDays}
            creationDays={creationDays}
            onClose={() => setShowCalendar(false)}
            activeTab={calendarTab}
          />
        )}

        <main className='flex flex-1 overflow-y-auto pb-20 md:pb-0'>
          <Outlet />
        </main>
        <MobileBottomNav onOpenCalendar={openCalendar} />

        <BoltFlightFx
          trigger={activeFlight}
          boltButtonRef={boltButtonRef}
          onDone={() => setActiveFlight(0)}
        />
      </div>
    </div>
  )
}
