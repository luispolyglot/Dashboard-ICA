import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import type { DailyProgressMap } from '../types'

type HomeViewProps = {
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

export function HomeView({ cardCount, dailyProgress }: HomeViewProps) {
  const navigate = useNavigate()
  const todayProgress = getTodayProgress(dailyProgress)

  const hasFiveWords = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const wordsLeftToUnlock = Math.max(0, CREATION_WORDS_GOAL - todayProgress.wordsAdded)
  const flashDone = todayProgress.reviewCorrect >= 10
  const phraseDone = todayProgress.phraseGenerated

  const cards: HomeCard[] = useMemo(
    () => [
      {
        initial: 'I',
        title: 'INMERSION',
        description: 'Escribe las palabras filtradas mediante la inmersión.',
        emoji: '🌊',
        tone: '#22C55E',
        statusLabel: hasFiveWords
          ? 'Base ICA activada'
          : `Te faltan ${pluralize(wordsLeftToUnlock, 'palabra', 'palabras')} para activar I y C`,
        statusDone: hasFiveWords,
        to: DASHBOARD_ROUTES.newIcaWords,
      },
      {
        initial: 'C',
        title: 'CREACION',
        description: 'Accede a la creación de tu conocimiento escrito.',
        emoji: '🧩',
        tone: '#3B82F6',
        statusLabel: hasFiveWords
          ? `Tu creación está lista (${pluralize(todayProgress.wordsAdded, 'palabra', 'palabras')} hoy)`
          : `Necesitas ${pluralize(wordsLeftToUnlock, 'palabra', 'palabras')} más para desbloquearla`,
        statusDone: hasFiveWords,
        to: DASHBOARD_ROUTES.myIcaWords,
      },
      {
        initial: 'A',
        title: 'ACTIVACION',
        description: 'Activa tu conocimiento escrito mediante frases.',
        emoji: '🗣️',
        tone: '#F59E0B',
        statusLabel: phraseDone
          ? 'Frase diaria completada'
          : `Te queda ${pluralize(1, 'frase de activacion', 'frases de activacion')}`,
        statusDone: phraseDone,
        to: DASHBOARD_ROUTES.activationPhrase,
        disabled: !hasFiveWords,
      },
    ],
    [hasFiveWords, phraseDone, todayProgress.wordsAdded, wordsLeftToUnlock],
  )

  return (
    <section className='flex flex-1 items-center justify-center px-4 pt-0 pb-20 lg:px-6 lg:py-12'>
      <div className='w-full max-w-[960px]'>
        <div className='ica-home-grid'>
          {cards.map((card) => {
            const cardBody = (
              <>
                <div className='ica-card-ghost-letter' style={{ color: card.tone }}>
                  {card.initial}
                </div>

                <div className='ica-card-emoji'>{card.emoji}</div>

                <div className='ica-card-content'>
                  <div className='ica-card-title-row'>
                    <span
                      className={cn(
                        'ica-card-letter-chip',
                        card.statusDone && 'ica-card-letter-chip-done',
                      )}
                      style={{
                        color: card.statusDone ? '#EAB308' : card.tone,
                        background: card.statusDone ? '#EAB30815' : `${card.tone}15`,
                        borderColor: card.statusDone
                          ? '#EAB30850'
                          : `${card.tone}40`,
                      }}
                    >
                      {card.initial}
                    </span>
                    <h2 className='ica-card-title'>{card.title}</h2>
                  </div>

                  <p className='ica-card-description'>{card.description}</p>

                  <div className='ica-card-meta'>
                    <span aria-hidden='true'>{card.statusDone ? '✅' : '🕒'}</span>
                    <span>{card.statusLabel}</span>
                  </div>
                </div>
              </>
            )

            return (
              <div key={card.initial} className='relative'>
                {card.statusDone ? (
                  <div className='aura-outer'>
                    <div className='aura-spinner' />
                    <button
                      type='button'
                      onClick={() => !card.disabled && navigate(card.to)}
                      className={cn(
                        'aura-inner-card card-hover ica-card-base',
                        card.disabled && 'cursor-not-allowed opacity-70',
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
                      'ica-card-base ica-card-plain card-hover',
                      card.disabled && 'cursor-not-allowed opacity-70',
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
            <div className='aura-outer w-full max-w-80'>
              <div className='aura-spinner' />
              <button
                type='button'
                onClick={() => navigate(DASHBOARD_ROUTES.flashcards)}
                className='aura-inner-card card-hover ica-card-base min-h-[160px]'
              >
                <div className='ica-card-emoji'>📚</div>
                <div className='ica-card-content'>
                  <div className='ica-card-title-row'>
                    <h2 className='ica-card-title'>FLASHCARDS</h2>
                  </div>
                  <p className='ica-card-description'>
                    Refuerza tu memoria activa con práctica diaria.
                  </p>
                  <div className='ica-card-meta'>
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
                'ica-card-base ica-card-plain card-hover w-full max-w-80 min-h-[160px]',
                cardCount === 0 && 'cursor-not-allowed opacity-70',
              )}
            >
              <div className='ica-card-emoji'>📚</div>
              <div className='ica-card-content'>
                <div className='ica-card-title-row'>
                  <h2 className='ica-card-title'>FLASHCARDS</h2>
                </div>
                <p className='ica-card-description'>
                  Refuerza tu memoria activa con práctica diaria.
                </p>
                <div className='ica-card-meta'>
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
