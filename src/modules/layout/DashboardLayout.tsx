import { Outlet } from 'react-router-dom'
import { CalendarModal } from '../components/CalendarModal'
import { Header } from '../components/Header'
import { LangEditModal } from '../components/LangEditModal'
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
    dailyProgress,
    handleSetup,
    handleConfigChange,
    openCalendar,
  } = useDashboardContext()

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <div className='text-sm text-muted-foreground'>Cargando...</div>
      </div>
    )
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

        <main className='flex flex-1 overflow-y-auto'>
          <Outlet />
        </main>
        <StreakFab
          completedDays={completedDays}
          creationDays={creationDays}
          dailyProgress={dailyProgress}
          onClick={openCalendar}
        />
      </div>
    </div>
  )
}
