import { useMemo } from 'react'
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
  const todayProgress = getTodayProgress(dailyProgress)
  const cardBaseClass =
    'relative flex min-h-[220px] w-full flex-col border-none px-[26px] py-8 text-left font-sans transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'
  const plainCardClass =
    'overflow-hidden rounded-[20px] border border-slate-800'

  const hasFiveWordsTotal = cardCount >= CREATION_WORDS_GOAL
  const hasFiveWordsToday = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const wordsLeftToday = Math.max(
    0,
    CREATION_WORDS_GOAL - todayProgress.wordsAdded,
  )
  const flashDone = todayProgress.reviewCorrect >= 10
  const phraseDone = todayProgress.phraseGenerated

  const cards: HomeCard[] = useMemo(
    () => [
      {
        initial: 'I',
        title: 'INMERSIÓN',
        description: 'Escribe las palabras filtradas mediante la inmersión.',
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
        description: 'Accede a la creación de tu conocimiento escrito.',
        emoji: '🧩',
        tone: '#3B82F6',
        statusLabel: hasFiveWordsToday
          ? 'Objetivo diario de creación completado'
          : `Necesitas ${pluralize(wordsLeftToday, 'palabra', 'palabras')} más hoy`,
        statusDone: hasFiveWordsToday,
        to: DASHBOARD_ROUTES.myIcaWords,
      },
      {
        initial: 'A',
        title: 'ACTIVACIÓN',
        description: 'Activa tu conocimiento escrito mediante frases.',
        emoji: '🗣️',
        tone: '#3B82F6',
        statusLabel: phraseDone
          ? 'Frase diaria completada'
          : `Te queda ${pluralize(1, 'frase de activación', 'frases de activación')}`,
        statusDone: phraseDone,
        to: DASHBOARD_ROUTES.activationPhrase,
        disabled: !hasFiveWordsTotal,
      },
    ],
    [
      cardCount,
      hasFiveWordsToday,
      hasFiveWordsTotal,
      phraseDone,
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
                        'relative z-1 m-0.5 overflow-hidden rounded-[20px]',
                        card.disabled && 'cursor-not-allowed',
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
                      plainCardClass,
                      card.disabled && 'cursor-not-allowed',
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

        <div className='mt-5 hidden justify-center md:flex'>
          {flashDone ? (
            <div className='relative w-full max-w-80 overflow-hidden rounded-[22px] shadow-[0_0_12px_#eab30850,0_0_60px_#eab30828]'>
              <div className='pointer-events-none absolute inset-[-120%] z-0 animate-[rotateCW_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_255deg,#eab30818_265deg,#eab30860_280deg,#eab308cc_305deg,#fde68a_322deg,#ffffffff_328deg,#fde68a_334deg,#eab308cc_350deg,#eab30860_368deg,#eab30818_378deg,transparent_390deg)]' />
              <button
                type='button'
                onClick={() => navigate(DASHBOARD_ROUTES.flashcards)}
                className={cn(
                  cardBaseClass,
                  'relative z-1 m-0.5 min-h-40 overflow-hidden rounded-[20px]',
                )}
              >
                <div className='relative z-1'>
                  <div className='mb-1.25 flex items-center gap-2'>
                    <div className='text-3xl'>📚</div>
                    <h2 className='m-0 font-serif text-lg font-bold tracking-widest text-slate-700 dark:text-slate-100'>
                      FLASHCARDS
                    </h2>
                  </div>
                  <p className='m-0 text-xs leading-normal text-slate-500'>
                    Refuerza tu memoria activa con práctica diaria.
                  </p>
                  <div className='mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400'>
                    <span aria-hidden='true'>✅</span>
                    <span>Objetivo de flashcards completado</span>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <button
              type='button'
              onClick={() => navigate(DASHBOARD_ROUTES.flashcards)}
              disabled={cardCount === 0}
              className={cn(
                cardBaseClass,
                plainCardClass,
                'w-full max-w-80 min-h-40',
                cardCount === 0 && 'cursor-not-allowed',
              )}
            >
              <div className='relative z-1 my-auto'>
                <div className='mb-1.25 flex items-center gap-2'>
                  <div className='text-3xl'>📚</div>
                  <h2 className='m-0 font-serif text-lg font-bold tracking-widest text-slate-700 dark:text-slate-100'>
                    FLASHCARDS
                  </h2>
                </div>
                <p className='m-0 text-xs leading-normal text-slate-500'>
                  Refuerza tu memoria activa con práctica diaria.
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
