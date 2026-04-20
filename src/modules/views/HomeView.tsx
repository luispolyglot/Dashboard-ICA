import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { AppConfig, DailyProgressMap } from '../types'

type HomeViewProps = {
  cardCount: number
  config: AppConfig
  dailyProgress: DailyProgressMap
}

type HomeCardAction = {
  label: string
  to: string
  disabled?: boolean
  helper?: string
}

type HomeCard = {
  initial: 'I' | 'C' | 'A'
  title: string
  description: string
  emoji: string
  tone: string
  statusLabel: string
  statusDone: boolean
  progressLabel: string
  actions: HomeCardAction[]
}

export function HomeView({ cardCount, config, dailyProgress }: HomeViewProps) {
  const navigate = useNavigate()
  const [activeModal, setActiveModal] = useState<'C' | 'A' | null>(null)

  const todayProgress = getTodayProgress(dailyProgress)
  const wordsDone = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const phraseDone = todayProgress.phraseGenerated
  const level = config.level || 'A2'

  const cards: HomeCard[] = useMemo(
    () => [
      {
        initial: 'I',
        title: 'INMERSION',
        description: 'Escribe las palabras filtradas mediante la inmersión.',
        emoji: '🌊',
        tone: '#22C55E',
        statusLabel:
          wordsDone ? 'Objetivo de hoy completado' : 'Te faltan palabras para hoy',
        statusDone: wordsDone,
        progressLabel: `${todayProgress.wordsAdded}/${CREATION_WORDS_GOAL}`,
        actions: [
          {
            label: 'Anadir palabras ICA',
            to: DASHBOARD_ROUTES.newIcaWords,
            helper: `${todayProgress.wordsAdded}/${CREATION_WORDS_GOAL} hoy`,
          },
        ],
      },
      {
        initial: 'C',
        title: 'CREACION',
        description: 'Accede a la creación de tu conocimiento escrito.',
        emoji: '🧩',
        tone: '#3B82F6',
        statusLabel:
          todayProgress.reviewCorrect >= 10
            ? 'Objetivo de flashcards completado'
            : `Llevas ${todayProgress.reviewCorrect}/10 aciertos hoy`,
        statusDone: todayProgress.reviewCorrect >= 10,
        progressLabel: `${todayProgress.reviewCorrect}/10`,
        actions: [
          {
            label: 'Mi creación ICA',
            to: DASHBOARD_ROUTES.myIcaWords,
            helper: `${cardCount} palabra${cardCount !== 1 ? 's' : ''}`,
          },
          {
            label: 'Flashcards',
            to: DASHBOARD_ROUTES.flashcards,
            disabled: cardCount === 0,
            helper: cardCount === 0 ? 'Anade palabras para iniciar' : undefined,
          },
        ],
      },
      {
        initial: 'A',
        title: 'ACTIVACION',
        description: 'Activa tu conocimiento escrito mediante frases.',
        emoji: '🗣️',
        tone: '#F59E0B',
        statusLabel:
          phraseDone ? 'Frase diaria completada' : 'Te queda una frase de activacion',
        statusDone: phraseDone,
        progressLabel: phraseDone ? '1/1' : '0/1',
        actions: [
          {
            label: 'Mi frase de activacion',
            to: DASHBOARD_ROUTES.activationPhrase,
            disabled: cardCount < 5,
            helper: cardCount < 5 ? 'Necesitas minimo 5 palabras' : `Nivel ${level}`,
          },
          {
            label: 'Mi historial de frases',
            to: DASHBOARD_ROUTES.phraseHistory,
          },
        ],
      },
    ],
    [
      cardCount,
      level,
      phraseDone,
      todayProgress.reviewCorrect,
      todayProgress.wordsAdded,
      wordsDone,
    ],
  )

  const modalCard = cards.find((card) => card.initial === activeModal) ?? null

  const openCard = (card: HomeCard) => {
    if (card.initial === 'I') {
      navigate(card.actions[0].to)
      return
    }

    setActiveModal(card.initial)
  }

  return (
    <>
      <section className='flex flex-1 items-center justify-center px-4 py-10 md:px-6 md:py-12'>
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
                      className={cn('ica-card-letter-chip', card.statusDone && 'ica-card-letter-chip-done')}
                      style={{
                        color: card.statusDone ? '#EAB308' : card.tone,
                        background: card.statusDone ? '#EAB30815' : `${card.tone}15`,
                        borderColor: card.statusDone ? '#EAB30850' : `${card.tone}40`,
                      }}
                    >
                      {card.initial}
                    </span>
                    <h2 className='ica-card-title'>{card.title}</h2>
                    {card.statusDone && <span className='ica-card-done-spark'>✨</span>}
                  </div>

                  <p className='ica-card-description'>{card.description}</p>

                  <div className='ica-card-meta'>
                    <span aria-hidden='true'>{card.statusDone ? '✅' : '🕒'}</span>
                    <span>{card.statusLabel}</span>
                  </div>

                  <div className='ica-card-progress'>{card.progressLabel}</div>
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
                      onClick={() => openCard(card)}
                      className='aura-inner-card card-hover ica-card-base'
                    >
                      {cardBody}
                    </button>
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => openCard(card)}
                    className='ica-card-base ica-card-plain card-hover'
                  >
                    {cardBody}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <Dialog open={!!modalCard} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modalCard ? `${modalCard.title}: elige una opcion` : 'Elige una opcion'}
            </DialogTitle>
            <DialogDescription>
              Selecciona la accion que quieres abrir ahora.
            </DialogDescription>
          </DialogHeader>

          <div className='flex flex-col gap-2'>
            {modalCard?.actions.map((action) => (
              <div key={action.label} className='flex flex-col gap-1'>
                {action.disabled ? (
                  <Button type='button' variant='secondary' disabled className='justify-between'>
                    <span>{action.label}</span>
                    <span aria-hidden='true'>→</span>
                  </Button>
                ) : (
                  <Button
                    asChild
                    className='justify-between'
                    onClick={() => setActiveModal(null)}
                  >
                    <Link to={action.to}>
                      <span>{action.label}</span>
                      <span aria-hidden='true'>→</span>
                    </Link>
                  </Button>
                )}

                {action.helper && (
                  <span className='pl-2 text-xs text-muted-foreground'>{action.helper}</span>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
