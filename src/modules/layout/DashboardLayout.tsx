import { Outlet } from 'react-router-dom'
import { FullscreenLoading } from '@/components/ui/fullscreen-loading'
import { CalendarModal } from '../components/CalendarModal'
import { Header } from '../components/Header'
import { LangEditModal } from '../components/LangEditModal'
import { MobileBottomNav } from '../components/MobileBottomNav'
import { StreakFab } from '../components/StreakFab'
import { useDashboardContext } from '../context/DashboardContext'
import { LanguageSetup } from '../views/LanguageSetup'

type DashboardLayoutProps = {
  onLogout: () => Promise<void>
}

export function DashboardLayout({ onLogout }: DashboardLayoutProps) {
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
    handleSetup,
    handleConfigChange,
    openCalendar,
  } = useDashboardContext()

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
          onLogout={onLogout}
          config={config}
          onEditLanguages={() => setShowLangModal(true)}
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

        <main className='flex flex-1 overflow-y-auto pb-24 md:pb-0'>
          <Outlet />
        </main>
        <MobileBottomNav
          onOpenCalendar={openCalendar}
          onLogout={onLogout}
          config={config}
          onEditLanguages={() => setShowLangModal(true)}
        />
        <StreakFab
          completedDays={completedDays}
          creationDays={creationDays}
          onClick={openCalendar}
        />
      </div>
    </div>
  )
}
