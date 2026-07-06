import { useNavigate } from 'react-router-dom'
import { DASHBOARD_ROUTES } from '../routes/paths'

type GamesIcaViewProps = {
  flashcardsReady: boolean
  flashcardsCount: number
  pregunticaUnlocked: boolean
  pregunticaLabel: string
  pregunticaProgress: string
}

export function GamesIcaView({
  flashcardsReady,
  flashcardsCount,
  pregunticaUnlocked,
  pregunticaLabel,
  pregunticaProgress,
}: GamesIcaViewProps) {
  const navigate = useNavigate()

  return (
    <section className='mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-24 pt-6 md:pb-8'>
      <div className='relative overflow-hidden rounded-[24px] border border-slate-800 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] p-6 shadow-[0_14px_36px_-18px_rgba(15,23,42,0.35)] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'>
        <p className='text-xs font-semibold tracking-[0.22em] text-slate-500'>MODO JUEGO</p>
        <h1 className='mt-2 font-serif text-3xl font-bold text-slate-700 md:text-4xl dark:text-slate-100'>
          🎮 Juegos ICA
        </h1>
        <p className='mt-2 max-w-2xl text-sm text-slate-500 md:text-base'>
          Elige tu forma de entrenar hoy. Refuerza tu memoria con Flashcards o
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
          <h2 className='mt-5 font-serif text-2xl font-bold text-slate-700 dark:text-slate-100'>Flashcards</h2>
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
          <p className='text-3xl' aria-hidden='true'>
            {pregunticaUnlocked ? '🎙️' : '🔒'}
          </p>
          <h2 className='mt-5 font-serif text-2xl font-bold text-slate-700 dark:text-slate-100'>PreguntICA</h2>
          <p className='mt-1 text-sm text-slate-500'>
            Responde una pregunta semanal usando tus palabras ICA.
          </p>
          <p className='mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300'>
            Progreso de desbloqueo: {pregunticaProgress}
          </p>
          <p className='mt-3 text-xs font-medium text-slate-600 dark:text-slate-300'>
            {pregunticaUnlocked ? 'Desbloqueada esta semana' : pregunticaLabel}
          </p>
        </button>
      </div>
    </section>
  )
}
