import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Puzzle,
  Speech,
  Waves,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MagicCard } from '@/components/ui/magic-card'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  icon: LucideIcon
  haloTone: string
  glowFrom: string
  glowTo: string
  statusLabel: string
  statusDone: boolean
  progressValue: number
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
        title: 'Inmersion',
        description: 'Escribe las palabras filtradas mediante la inmersion.',
        icon: Waves,
        haloTone: 'from-chart-1/30 via-chart-2/15 to-transparent',
        glowFrom: '#6fe1ff',
        glowTo: '#6b8dff',
        statusLabel:
          wordsDone ? 'Objetivo de hoy completado' : 'Te faltan palabras para hoy',
        statusDone: wordsDone,
        progressValue: Math.min(
          100,
          Math.round((todayProgress.wordsAdded / CREATION_WORDS_GOAL) * 100),
        ),
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
        title: 'Creacion',
        description: 'Accede a la creacion de tu conocimiento escrito.',
        icon: Puzzle,
        haloTone: 'from-chart-2/35 via-chart-3/20 to-transparent',
        glowFrom: '#7dd3fc',
        glowTo: '#818cf8',
        statusLabel:
          todayProgress.reviewCorrect >= 10
            ? 'Objetivo de flashcards completado'
            : `Llevas ${todayProgress.reviewCorrect}/10 aciertos hoy`,
        statusDone: todayProgress.reviewCorrect >= 10,
        progressValue: Math.min(
          100,
          Math.round((todayProgress.reviewCorrect / 10) * 100),
        ),
        progressLabel: `${todayProgress.reviewCorrect}/10 hoy`,
        actions: [
          {
            label: 'Mi Creacion ICA',
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
        title: 'Activacion',
        description: 'Activa tu conocimiento escrito mediante frases.',
        icon: Speech,
        haloTone: 'from-chart-3/35 via-chart-4/20 to-transparent',
        glowFrom: '#6fe1ff',
        glowTo: '#a78bfa',
        statusLabel:
          phraseDone ? 'Frase diaria completada' : 'Te queda una frase de activacion',
        statusDone: phraseDone,
        progressValue: phraseDone ? 100 : 0,
        progressLabel: phraseDone ? '1/1 frase' : '0/1 frase',
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
      <section className='flex flex-1 items-center justify-center'>
        <div className='mx-auto grid w-full max-w-6xl grid-cols-1 items-stretch gap-5 lg:grid-cols-3'>
          {cards.map((card, index) => (
            <div key={card.initial} className='w-full min-w-0'>
              <MagicCard
                mode='orb'
                glowFrom={card.glowFrom}
                glowTo={card.glowTo}
              glowOpacity={0.32}
              glowBlur={70}
              glowSize={320}
              className='card-enter h-full w-full min-w-0 rounded-3xl transition-transform duration-300 hover:scale-[1.05]'
              style={{ animationDelay: `${index * 90}ms` }}
            >
                <Card
                  data-home-card
                  role='button'
                  tabIndex={0}
                  onClick={() => openCard(card)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openCard(card)
                    }
                  }}
                  className='group relative flex h-full w-full min-w-0 cursor-pointer flex-1 flex-col overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-[0_20px_45px_-26px_var(--color-primary)] lg:gap-6 gap-6 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/45'
                >
                  <div className='pointer-events-none absolute inset-0'>
                    <div
                      className={`halo-drift absolute -top-10 -right-8 h-40 w-40 rounded-full bg-gradient-to-br blur-2xl ${card.haloTone}`}
                    />
                    <div className='halo-drift-reverse absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-gradient-to-br from-primary/18 via-chart-3/10 to-transparent blur-2xl' />
                    <div className='absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,var(--color-background)_55%,transparent_100%)] opacity-35' />
                  </div>

                  <CardHeader>
                    <div className='mb-3 flex items-center justify-between gap-3'>
                      <div className='flex items-center gap-2'>
                        <div className='rounded-2xl border border-border/60 bg-background/75 p-2 text-primary'>
                          <card.icon className='h-5 w-5' aria-hidden='true' />
                        </div>
                        <span className='text-xs font-semibold tracking-wide text-muted-foreground'>
                          {card.progressLabel}
                        </span>
                      </div>
                      <div className='rounded-full border border-border/70 bg-background/80 p-1'>
                        <AnimatedCircularProgressBar
                          min={0}
                          max={100}
                          value={card.progressValue}
                          gaugePrimaryColor='var(--color-primary)'
                          gaugeSecondaryColor='var(--color-muted)'
                          className='size-16 text-xs font-bold'
                        />
                      </div>
                    </div>

                    <CardTitle className='text-2xl tracking-tight'>
                      <span className='font-heading text-3xl leading-none text-primary'>
                        {card.title.slice(0, 1)}
                      </span>
                      <span>{card.title.slice(1)}</span>
                    </CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                    <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
                      {card.statusDone ? (
                        <CheckCircle2 className='h-4 w-4 text-emerald-500' aria-hidden='true' />
                      ) : (
                        <CircleDashed className='h-4 w-4 text-chart-3' aria-hidden='true' />
                      )}
                      <span>{card.statusLabel}</span>
                    </div>
                  </CardHeader>

                </Card>
              </MagicCard>
            </div>
          ))}
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
                    <ChevronRight className='h-4 w-4' aria-hidden='true' />
                  </Button>
                ) : (
                  <Button
                    asChild
                    className='justify-between'
                    onClick={() => setActiveModal(null)}
                  >
                    <Link to={action.to}>
                      <span>{action.label}</span>
                      <ChevronRight className='h-4 w-4' aria-hidden='true' />
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
