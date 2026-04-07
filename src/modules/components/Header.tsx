import { LevelBadge } from './LevelBadge'
import type { AppConfig, AppView } from '../types'

type HeaderProps = {
  view: AppView
  setView: (view: AppView) => void
  totalCards: number
  config: AppConfig | null
  onEditLang: () => void
  onManage: () => void
}

export function Header({ view, setView, totalCards, config, onEditLang, onManage }: HeaderProps) {
  return (
    <header className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 px-5 py-3'>
      <button
        type='button'
        className='flex items-center gap-2'
        onClick={() => setView('home')}
      >
        <span className='text-xl'>✦</span>
        <span className='font-serif text-xl font-bold text-slate-100'>Mi Dashboard ICA</span>
      </button>

      {config && (
        <div className='flex flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={onEditLang}
            className='inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm'
          >
            <span className='text-slate-400'>{config.nativeLang}</span>
            <span className='font-bold text-blue-400'>→</span>
            <span className='font-semibold text-slate-100'>{config.targetLang}</span>
            <LevelBadge level={config.level || 'A2'} size='small' />
            <span className='text-xs'>✏️</span>
          </button>

          <button
            type='button'
            onClick={onManage}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              view === 'manage'
                ? 'border-violet-500 text-violet-400'
                : 'border-slate-800 text-slate-400'
            } bg-slate-900`}
          >
            📖 Mis Palabras ICA
            {totalCards > 0 && (
              <span className='rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-400'>
                {totalCards}
              </span>
            )}
          </button>
        </div>
      )}

      {view !== 'home' && (
        <button
          type='button'
          onClick={() => setView('home')}
          className='rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200'
        >
          ← Volver
        </button>
      )}
    </header>
  )
}
