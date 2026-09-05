import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { MetaTrackerSection } from '../components/MetaTracker/MetaTrackerSection'
import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import type { DailyProgressMap } from '../types'
import type { AppConfig } from '../types'

type HomeViewProps = {
  config: AppConfig
  cardCount: number
  dailyProgress: DailyProgressMap
}

type HomeCard = {
  initial: 'I' | 'C' | 'A'
  title: string
  description: string
  emoji: string
  tone: string
  statusLabel: string
  statusDone: boolean
  to: string
  disabled?: boolean
}

function pluralize(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

export function HomeView({ config, cardCount, dailyProgress }: HomeViewProps) {
  const navigate = useNavigate()
  const [showPregunticaPulse, setShowPregunticaPulse] = useState(false)
  const todayProgress = getTodayProgress(dailyProgress)
  const cardBaseClass =
    'relative flex min-h-[220px] w-full flex-col px-[25px] py-8 text-left font-sans transition-[transform,border-color,box-shadow,background] duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)]'
  const cardSurfaceClass =
    'overflow-hidden rounded-[20px] border border-sky-400/35 bg-[linear-gradient(180deg,rgba(59,130,246,0.1),rgba(59,130,246,0.03)),linear-gradient(160deg,#ffffff,#eef3f9)] dark:bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(59,130,246,0.04)),linear-gradient(160deg,#0f172a,#0a0f1a)]'
  const cardSurfaceHaloClass =
    'overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,rgba(59,130,246,0.1),rgba(59,130,246,0.03)),linear-gradient(160deg,#ffffff,#eef3f9)] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.35)] dark:bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(59,130,246,0.04)),linear-gradient(160deg,#0f172a,#0a0f1a)]'
  const cardHoverClass =
    'hover:-translate-y-[2px] hover:border-sky-300/75 hover:shadow-[0_0_0_1px_rgba(96,165,250,0.5),0_0_24px_rgba(59,130,246,0.33)]'
  const cardHoverWithHaloClass =
    'hover:-translate-y-[2px] hover:shadow-[inset_0_0_0_1px_rgba(96,165,250,0.5),0_0_0_1px_rgba(96,165,250,0.28),0_0_20px_rgba(59,130,246,0.22)]'
  const disabledCardClass =
    'cursor-not-allowed opacity-75 hover:translate-y-0 hover:shadow-none'

  const hasFiveWordsTotal = cardCount >= CREATION_WORDS_GOAL
  const hasFiveWordsToday = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const wordsLeftToday = Math.max(
    0,
    CREATION_WORDS_GOAL - todayProgress.wordsAdded,
  )
  const flashDone = todayProgress.reviewCorrect >= 10
  const phraseDone = todayProgress.phraseGenerated

  useEffect(() => {
    let active = true

    const loadPregunticaStatus = async () => {
      try {
        const { fetchPregunticaWeekStatus } = await import('../services/preguntica')
        const status = await fetchPregunticaWeekStatus({
          targetLang: config.targetLang,
          nativeLang: config.nativeLang,
        })
        if (!active || !status) return
        setShowPregunticaPulse(status.isUnlocked && !status.completedAt)
      } catch {
        if (!active) return
        setShowPregunticaPulse(false)
      }
    }

    void loadPregunticaStatus()

    return () => {
      active = false
    }
  }, [config.nativeLang, config.targetLang])

  const cards: HomeCard[] = useMemo(
    () => [
      {
        initial: 'I',
        title: 'INMERSIÓN',
        description: 'Añade palabras ICA filtradas con inmersión.',
        emoji: '✍️',
        tone: '#3B82F6',
        statusLabel: hasFiveWordsToday
          ? 'Objetivo diario de inmersión completado'
          : `Te faltan ${pluralize(wordsLeftToday, 'palabra', 'palabras')} hoy`,
        statusDone: hasFiveWordsToday,
        to: DASHBOARD_ROUTES.newIcaWords,
      },
      {
        initial: 'C',
        title: 'CREACIÓN',
        description: 'Crea frases contextualizadas con tu Baúl ICA.',
        emoji: '🧩',
        tone: '#3B82F6',
        statusLabel: phraseDone
          ? 'Frase diaria completada'
          : `Te queda ${pluralize(1, 'frase de creación', 'frases de creación')}`,
        statusDone: phraseDone,
        to: DASHBOARD_ROUTES.activationPhrase,
        disabled: !hasFiveWordsTotal,
      },
      {
        initial: 'A',
        title: 'ACTIVACIÓN',
        description: 'Activa el conocimiento mediante tu propia voz.',
        emoji: '🗣️',
        tone: '#3B82F6',
        statusLabel:
          todayProgress.voiceActivationsCount > 0
            ? `${pluralize(todayProgress.voiceActivationsCount, 'activación', 'activaciones')} hoy`
            : 'Activa cualquier frase creada',
        statusDone: todayProgress.voiceActivationsCount > 0,
        to: DASHBOARD_ROUTES.masterNotes,
        disabled: false,
      },
    ],
    [
      cardCount,
      hasFiveWordsToday,
      hasFiveWordsTotal,
      phraseDone,
      todayProgress.voiceActivationsCount,
      wordsLeftToday,
    ],
  )

  return (
    <section className='flex flex-1 items-center justify-center px-4 pt-0 pb-28 lg:px-6 lg:py-12'>
      <div className='w-full max-w-240'>
        <MetaTrackerSection config={config} />

        <div className='grid w-full max-w-240 grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5'>
          {cards.map((card) => {
            const cardBody = (
              <>
                <div
                  className='pointer-events-none absolute top-4.5 right-5.5 select-none'
                  style={{ color: card.tone }}
                >
                  <p className='font-serif text-[90px] leading-none font-extrabold shadow-inital-letter'>
                    {card.initial}
                  </p>
                </div>

                <div className='relative z-1 mb-auto text-[32px]'>
                  {card.emoji}
                </div>

                <div className='relative z-1 mt-9'>
                  <div className='mb-1.25 flex items-center gap-2'>
                    <h2 className='m-0 font-serif text-xl font-bold tracking-widest text-slate-700 dark:text-slate-100'>
                      {card.title}
                    </h2>
                  </div>
                  <p className='m-0 text-xs leading-normal text-slate-500'>
                    {card.description}
                  </p>
                  <div className='mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400'>
                    <span aria-hidden='true'>
                      {card.statusDone ? '✅' : '🕒'}
                    </span>
                    <span>{card.statusLabel}</span>
                  </div>
                </div>
              </>
            )

            return (
              <div key={card.initial} className='relative'>
                {card.statusDone ? (
                  <div className='relative overflow-hidden rounded-[22px] shadow-[0_0_12px_#eab30850,0_0_60px_#eab30828]'>
                    <div className='pointer-events-none absolute inset-[-120%] z-0 animate-[rotateCW_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_255deg,#eab30818_265deg,#eab30860_280deg,#eab308cc_305deg,#fde68a_322deg,#ffffffff_328deg,#fde68a_334deg,#eab308cc_350deg,#eab30860_368deg,#eab30818_378deg,transparent_390deg)]' />
                    <button
                      type='button'
                      onClick={() => !card.disabled && navigate(card.to)}
                      className={cn(
                        cardBaseClass,
                        cardSurfaceHaloClass,
                        cardHoverWithHaloClass,
                        'relative z-1 m-0.5',
                        card.disabled && disabledCardClass,
                      )}
                      disabled={card.disabled}
                    >
                      {cardBody}
                    </button>
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => !card.disabled && navigate(card.to)}
                    className={cn(
                      cardBaseClass,
                      cardSurfaceClass,
                      cardHoverClass,
                      card.disabled && disabledCardClass,
                    )}
                    disabled={card.disabled}
                  >
                    {cardBody}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className='mt-5 hidden grid-cols-2 gap-4 md:grid'>
          <button
            type='button'
            onClick={() => navigate(DASHBOARD_ROUTES.challengesIca)}
            className={cn(
              cardBaseClass,
              cardSurfaceClass,
              cardHoverClass,
              'min-h-40',
            )}
          >
            <div className='relative z-1 my-auto'>
              <div className='mb-1.25 flex items-center gap-2'>
                <div className='text-3xl'>⚔️</div>
                  <h2 className='m-0 font-serif text-lg font-bold tracking-widest text-slate-700 dark:text-slate-100'>
                    DESAFÍOS ICA
                  </h2>
              </div>
              <p className='m-0 text-xs leading-normal text-slate-500'>
                Retos 1 vs 1 con turnos offline y respuesta por notificaciones.
              </p>
              <div className='mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400'>
                <span aria-hidden='true'>🕒</span>
                <span>Nuevo: modalidad global y por idioma</span>
              </div>
            </div>
          </button>

          {flashDone ? (
            <div className='relative w-full overflow-hidden rounded-[22px] shadow-[0_0_12px_#eab30850,0_0_60px_#eab30828]'>
              <div className='pointer-events-none absolute inset-[-120%] z-0 animate-[rotateCW_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_255deg,#eab30818_265deg,#eab30860_280deg,#eab308cc_305deg,#fde68a_322deg,#ffffffff_328deg,#fde68a_334deg,#eab308cc_350deg,#eab30860_368deg,#eab30818_378deg,transparent_390deg)]' />
              <button
                type='button'
                onClick={() => navigate(DASHBOARD_ROUTES.gamesIca)}
                className={cn(
                  cardBaseClass,
                  cardSurfaceHaloClass,
                  cardHoverWithHaloClass,
                  'relative z-1 m-0.5 min-h-40',
                )}
              >
                {showPregunticaPulse && (
                  <span
                    aria-hidden='true'
                    className='absolute right-4 top-4 inline-block text-xl text-amber-500 animate-pulse'
                  >
                    🎙️
                  </span>
                )}
                <div className='relative z-1'>
                  <div className='mb-1.25 flex items-center gap-2'>
                    <div className='text-3xl'>🎮</div>
                    <h2 className='m-0 font-serif text-lg font-bold tracking-widest text-slate-700 dark:text-slate-100'>
                      JUEGOS ICA
                    </h2>
                  </div>
                  <p className='m-0 text-xs leading-normal text-slate-500'>
                    Entrena con Flashcards y desbloquea tu PreguntICA semanal.
                  </p>
                  <div className='mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400'>
                    <span aria-hidden='true'>✅</span>
                    <span>Flashcards completadas hoy</span>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <button
              type='button'
              onClick={() => navigate(DASHBOARD_ROUTES.gamesIca)}
              disabled={cardCount === 0}
              className={cn(
                cardBaseClass,
                cardSurfaceClass,
                cardHoverClass,
                'min-h-40',
                cardCount === 0 && disabledCardClass,
              )}
            >
              {showPregunticaPulse && (
                <span
                  aria-hidden='true'
                  className='absolute right-4 top-4 inline-block text-xl text-amber-500 animate-pulse'
                >
                  🎙️
                </span>
              )}
              <div className='relative z-1 my-auto'>
                <div className='mb-1.25 flex items-center gap-2'>
                  <div className='text-3xl'>🎮</div>
                  <h2 className='m-0 font-serif text-lg font-bold tracking-widest text-slate-700 dark:text-slate-100'>
                    JUEGOS ICA
                  </h2>
                </div>
                <p className='m-0 text-xs leading-normal text-slate-500'>
                  Flashcards + PreguntICA en una sola pantalla.
                </p>
                <div className='mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400'>
                  <span aria-hidden='true'>🕒</span>
                  <span>
                    {cardCount === 0
                      ? 'Añade palabras para iniciar'
                      : `Llevas ${pluralize(todayProgress.reviewCorrect, 'acierto', 'aciertos')} hoy`}
                  </span>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
