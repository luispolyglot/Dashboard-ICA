import { useDashboardICA } from './hooks/useDashboardICA'
import { Header } from './components/Header'
import { LangEditModal } from './components/LangEditModal'
import { CalendarModal } from './components/CalendarModal'
import { StreakFab } from './components/StreakFab'
import { LevelBadge } from './components/LevelBadge'
import { HomeView } from './views/HomeView'
import { AddView } from './views/AddView'
import { ReviewView } from './views/ReviewView'
import { ManageView } from './views/ManageView'
import { PhraseView } from './views/PhraseView'
import { LanguageSetup } from './views/LanguageSetup'

export default function DashboardICA() {
  const {
    view,
    setView,
    cards,
    setCards,
    config,
    loading,
    showLangModal,
    setShowLangModal,
    completedDays,
    setCompletedDays,
    creationDays,
    dailyProgress,
    showCalendar,
    setShowCalendar,
    calendarTab,
    handleWordAdded,
    handlePhraseGenerated,
    handleSetup,
    handleConfigChange,
    openCalendar,
  } = useDashboardICA()

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-950'>
        <div className='text-sm text-slate-500'>Cargando...</div>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen flex-col bg-slate-950 text-slate-100'>
      <Header
        view={view}
        setView={setView}
        totalCards={cards.length}
        config={config}
        onEditLang={() => setShowLangModal(true)}
        onManage={() => setView('manage')}
      />

      {showLangModal && config && (
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

      {!config ? (
        <LanguageSetup onSave={handleSetup} />
      ) : (
        <>
          {view === 'home' && (
            <HomeView
              setView={setView}
              cardCount={cards.length}
              config={config}
              dailyProgress={dailyProgress}
            />
          )}

          {view === 'add' && (
            <AddView
              cards={cards}
              setCards={setCards}
              config={config}
              dailyProgress={dailyProgress}
              onWordAdded={handleWordAdded}
            />
          )}

          {view === 'review' && (
            <ReviewView
              cards={cards}
              setCards={setCards}
              config={config}
              completedDays={completedDays}
              setCompletedDays={setCompletedDays}
            />
          )}

          {view === 'manage' && (
            <ManageView cards={cards} setCards={setCards} />
          )}

          {view === 'phrase' && (
            <PhraseView
              cards={cards}
              config={config}
              onPhraseGenerated={handlePhraseGenerated}
              LevelBadge={LevelBadge}
            />
          )}

          <StreakFab
            completedDays={completedDays}
            creationDays={creationDays}
            dailyProgress={dailyProgress}
            onClick={openCalendar}
          />
        </>
      )}
    </div>
  )
}
