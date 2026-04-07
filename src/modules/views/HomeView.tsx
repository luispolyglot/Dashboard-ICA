import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import type { AppConfig, AppView, DailyProgressMap } from '../types'

type HomeViewProps = {
  setView: (view: AppView) => void
  cardCount: number
  config: AppConfig
  dailyProgress: DailyProgressMap
}

type HomeItem = {
  title: string
  desc: string
  icon: string
  accent: 'emerald' | 'blue' | 'amber'
  view: AppView
  stat: string
  disabled?: boolean
  badge?: string
  badgeDone?: boolean
}

const ACCENT_CLASS: Record<HomeItem['accent'], string> = {
  emerald: 'text-emerald-400 bg-emerald-500/15',
  blue: 'text-blue-400 bg-blue-500/15',
  amber: 'text-amber-400 bg-amber-500/15',
}

const ORB_CLASS: Record<HomeItem['accent'], string> = {
  emerald: 'bg-emerald-500/10',
  blue: 'bg-blue-500/10',
  amber: 'bg-amber-500/10',
}

export function HomeView({ setView, cardCount, config, dailyProgress }: HomeViewProps) {
  const level = config.level || 'A2'
  const tp = getTodayProgress(dailyProgress)
  const wDone = tp.wordsAdded >= CREATION_WORDS_GOAL
  const pDone = tp.phraseGenerated

  const items: HomeItem[] = [
    {
      title: 'Añadir Palabras',
      desc: 'Nuevas palabras con traduccion automatica por IA.',
      icon: '✍️',
      accent: 'emerald',
      view: 'add',
      stat: `${cardCount} palabra${cardCount !== 1 ? 's' : ''}`,
      badge: wDone ? '✓ Hecho hoy' : `${tp.wordsAdded}/${CREATION_WORDS_GOAL} hoy`,
      badgeDone: wDone,
    },
    {
      title: 'Flashcards',
      desc: 'Repasa con repeticion espaciada por prioridad.',
      icon: '🧠',
      accent: 'blue',
      view: 'review',
      stat: cardCount > 0 ? 'Empezar sesion' : 'Añade palabras primero',
      disabled: cardCount === 0,
    },
    {
      title: 'Frase de Activacion',
      desc: `Genera frases reales nivel ${level} con tus palabras ICA.`,
      icon: '⚡',
      accent: 'amber',
      view: 'phrase',
      stat: cardCount >= 5 ? 'Generar frase' : 'Necesitas min. 5 palabras',
      disabled: cardCount < 5,
      badge: pDone ? '✓ Hecho hoy' : 'Pendiente hoy',
      badgeDone: pDone,
    },
  ]

  return (
    <section className='flex flex-1 items-center justify-center px-5 py-10'>
      <div className='flex max-w-[760px] flex-wrap justify-center gap-5'>
        {items.map((item) => (
          <button
            key={item.view}
            type='button'
            onClick={() => !item.disabled && setView(item.view)}
            className={`relative w-[220px] overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-left transition ${
              item.disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-0.5 hover:border-slate-700'
            }`}
          >
            <div className={`absolute -right-7 -top-7 h-20 w-20 rounded-full ${ORB_CLASS[item.accent]}`} />

            <div className='mb-3 text-4xl'>{item.icon}</div>
            <h2 className='mb-1.5 font-serif text-xl font-bold text-slate-100'>{item.title}</h2>
            <p className='mb-4 text-sm leading-relaxed text-slate-500'>{item.desc}</p>

            <div className={`inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${ACCENT_CLASS[item.accent]}`}>
              {item.stat}
            </div>

            {item.badge !== undefined && (
              <div
                className={`mt-2 inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${
                  item.badgeDone
                    ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
                    : 'border-slate-700 bg-slate-800 text-slate-500'
                }`}
              >
                {item.badge}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
