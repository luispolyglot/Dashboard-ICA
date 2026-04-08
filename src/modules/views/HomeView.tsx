import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import { fetchWeeklyLeaderboard } from '../services/leaderboard'
import type { AppConfig, AppView, DailyProgressMap } from '../types'
import type { LeaderboardEntry } from '../types'

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
  accent: 'emerald' | 'blue' | 'amber' | 'violet'
  view: AppView
  stat: string
  progress?: string
  disabled?: boolean
  badge?: string
  badgeDone?: boolean
}

const ACCENT_CLASS: Record<HomeItem['accent'], string> = {
  emerald: 'text-emerald-400 bg-emerald-500/15',
  blue: 'text-blue-400 bg-blue-500/15',
  amber: 'text-amber-400 bg-amber-500/15',
  violet: 'text-violet-400 bg-violet-500/15',
}

const ORB_CLASS: Record<HomeItem['accent'], string> = {
  emerald: 'bg-emerald-500/10',
  blue: 'bg-blue-500/10',
  amber: 'bg-amber-500/10',
  violet: 'bg-violet-500/10',
}

export function HomeView({
  setView,
  cardCount,
  config,
  dailyProgress,
}: HomeViewProps) {
  const { user } = useAuth()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)

  useEffect(() => {
    fetchWeeklyLeaderboard(8)
      .then((rows) => {
        setLeaderboard(rows)
        setLeaderboardError(null)
      })
      .catch(() => {
        setLeaderboardError('No se pudo cargar el ranking semanal')
      })
  }, [])

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
      progress: `${tp.wordsAdded}/${CREATION_WORDS_GOAL} palabras hoy`,
      badge: wDone ? 'Hecho hoy' : 'Pendiente hoy',
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
      badge: pDone ? 'Hecho hoy' : 'Pendiente hoy',
      badgeDone: pDone,
    },
    {
      title: 'Mis Frases',
      desc: 'Revisa tu historial con metadata y palabras utilizadas.',
      icon: '🗂️',
      accent: 'violet',
      view: 'phrases',
      stat: 'Ver historial',
    },
  ]

  const rankBadge = (rank: number): string => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  return (
    <section className='flex flex-1 items-center justify-center px-5 py-10'>
      <div className='grid w-full max-w-[1400px] grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,760px)_360px]'>
        <div className='hidden lg:block' />

        <div className='grid w-full max-w-[760px] grid-cols-1 gap-5 justify-self-center sm:grid-cols-2'>
          {items.map((item) => (
            <button
              key={item.view}
              type='button'
              onClick={() => !item.disabled && setView(item.view)}
              className={`relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-left transition ${
                item.disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:-translate-y-0.5 hover:border-slate-700'
              }`}
            >
              <div
                className={`absolute -right-7 -top-7 h-20 w-20 rounded-full ${ORB_CLASS[item.accent]}`}
              />

              <div className='mb-3 text-4xl'>{item.icon}</div>
              <h2 className='mb-1.5 font-serif text-xl font-bold text-slate-100'>
                {item.title}
              </h2>
              <p className='mb-4 text-sm leading-relaxed text-slate-500'>
                {item.desc}
              </p>

              <div
                className={`inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${ACCENT_CLASS[item.accent]}`}
              >
                {item.stat}
              </div>
              {item.badge !== undefined && (
                <div
                  className={`ml-2 inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${
                    item.badgeDone
                      ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
                      : 'border-slate-700 bg-slate-800 text-slate-500'
                  }`}
                >
                  {item.badgeDone && <span className='mr-1'>✓</span>}
                  {item.badge}
                </div>
              )}
            </button>
          ))}
        </div>

        <article className='h-fit w-full lg:max-w-90 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5 lg:sticky lg:top-5 lg:justify-self-end  mb-14 lg:mb-0'>
          <div className='mb-3 flex items-center justify-between'>
            <h3 className='font-serif text-xl font-bold text-slate-100'>
              Leaderboard semanal
            </h3>
            <span className='rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400'>
              XP
            </span>
          </div>

          {leaderboardError && (
            <p className='text-sm text-red-400'>{leaderboardError}</p>
          )}

          {!leaderboardError && leaderboard.length === 0 && (
            <p className='text-sm text-slate-500'>
              Todavia no hay puntajes esta semana.
            </p>
          )}

          {!leaderboardError && leaderboard.length > 0 && (
            <div className='space-y-2'>
              {leaderboard.map((row) => (
                <div
                  key={row.user_id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    row.user_id === user?.id
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <div className='flex items-center gap-3'>
                    <span
                      className={`w-8 text-center text-sm font-bold ${row.rank <= 3 ? 'text-amber-300' : 'text-slate-400'}`}
                    >
                      {rankBadge(row.rank)}
                    </span>
                    <div>
                      <div className='text-sm font-semibold text-slate-100'>
                        {row.display_name || row.username}
                      </div>
                      <div className='text-xs text-slate-500'>
                        @{row.username}
                      </div>
                    </div>
                  </div>
                  <span className='text-sm font-bold text-blue-400'>
                    {row.score}
                    {row.user_id === user?.id && (
                      <span className='ml-1 text-[10px] text-blue-300'>TU</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
