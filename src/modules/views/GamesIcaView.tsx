import { useNavigate } from 'react-router-dom'
import { DASHBOARD_ROUTES } from '../routes/paths'

type GamesIcaViewProps = {
  flashcardsReady: boolean
  flashcardsCount: number
  pregunticaUnlocked: boolean
  pregunticaLabel: string
  pregunticaProgress: string
  showPregunticaPulse: boolean
}

function parseProgress(value: string): { current: number; total: number } {
  const match = value.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (!match) return { current: 0, total: 20 }
  const current = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return { current: 0, total: 20 }
  }
  return { current, total }
}

export function GamesIcaView({
  flashcardsReady,
  flashcardsCount,
  pregunticaUnlocked,
  pregunticaProgress,
  showPregunticaPulse,
}: GamesIcaViewProps) {
  const navigate = useNavigate()
  const progress = parseProgress(pregunticaProgress)
  const progressPct = Math.max(0, Math.min(100, (progress.current / progress.total) * 100))

  return (
    <section className='mx-auto flex w-full max-w-6xl flex-1 items-center justify-center p-4 pb-24'>
      <div className='w-full max-w-5xl'>
        <div>
          <h2 className='mb-1 font-serif text-2xl font-bold lg:text-3xl'>🎮 Juegos ICA</h2>
          <p className='text-sm text-muted-foreground'>
            Elige tu forma de entrenar hoy: refuerza tu memoria con Flashcards o
            práctica expresión real con PreguntICA.
          </p>
        </div>

        <div className='mt-6 grid gap-4 md:grid-cols-2'>
        <button
          type='button'
          onClick={() => navigate(DASHBOARD_ROUTES.flashcards)}
          disabled={!flashcardsReady}
          className='group relative min-h-52 overflow-hidden rounded-[22px] border border-slate-800 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] p-6 text-left transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'
        >
          <p className='text-3xl' aria-hidden='true'>
            📚
          </p>
          <h2 className='mt-5 font-serif text-2xl font-bold text-slate-700 dark:text-slate-100'>
            Flashcards
          </h2>
          <p className='mt-1 text-sm text-slate-500'>
            Repetición espaciada para consolidar tu baúl ICA.
          </p>
          <p className='mt-3 text-xs font-medium text-slate-600 dark:text-slate-300'>
            {flashcardsReady
              ? `${flashcardsCount} palabras listas para practicar`
              : 'Añade palabras ICA para desbloquearlo'}
          </p>
        </button>

        <button
          type='button'
          onClick={() => navigate(DASHBOARD_ROUTES.preguntica)}
          disabled={!pregunticaUnlocked}
          className='group relative min-h-52 overflow-hidden rounded-[22px] border border-slate-800 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] p-6 text-left transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-75 dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'
        >
          {showPregunticaPulse && (
            <span
              aria-hidden='true'
              className='absolute right-4 top-4 inline-block text-xl text-amber-500 animate-pulse'
            >
              🎙️
            </span>
          )}
          <p className='text-3xl' aria-hidden='true'>🎙️</p>
          <h2 className='mt-5 font-serif text-2xl font-bold text-slate-700 dark:text-slate-100'>
            PreguntICA
          </h2>
          <p className='mt-1 text-sm text-slate-500'>
            Responde una pregunta semanal usando tus palabras ICA.
          </p>
          <p className='mt-2 text-xs text-slate-600 dark:text-slate-300'>
            <strong>{pregunticaProgress}</strong> <strong>palabras activadas</strong>
          </p>
          <div className='mt-2 flex items-center gap-2'>
            <div className='h-2 flex-1 overflow-hidden rounded-full border border-slate-300/70 bg-slate-200/70 dark:border-slate-600 dark:bg-slate-800'>
              <span
                className={`block h-full rounded-full transition-all duration-700 ${
                  progressPct >= 100
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-300 animate-pulse'
                    : 'bg-primary/75'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className='text-xs' aria-hidden='true'>
              {pregunticaUnlocked ? '🔓' : '🔒'}
            </span>
          </div>
          <p className='mt-3 text-xs font-medium text-slate-600 dark:text-slate-300'>
            {pregunticaUnlocked
              ? 'Desbloqueada esta semana'
              : 'Activa 20 palabras para desbloquearla'}
          </p>
        </button>
        </div>
      </div>
    </section>
  )
}
