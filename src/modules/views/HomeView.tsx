import { ReactNode, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { AppConfig, DailyProgressMap } from '../types'
import { Badge } from '@/components/ui/badge'

type HomeViewProps = {
  cardCount: number
  config: AppConfig
  dailyProgress: DailyProgressMap
  reviewSession: number
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
  actions: HomeCardAction[]
  status?: ReactNode
}

export function HomeView({
  cardCount,
  config,
  dailyProgress,
  reviewSession,
}: HomeViewProps) {
  const todayProgress = getTodayProgress(dailyProgress)
  const wordsDone = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const phraseDone = todayProgress.phraseGenerated
  const level = config.level || 'A2'

  const cards: HomeCard[] = useMemo(
    () => [
      {
        initial: 'I',
        title: 'INMERSION',
        description: 'Escribe las palabras filtradas mediante la inmersion.',
        actions: [
          {
            label: 'Anadir palabras ICA',
            to: DASHBOARD_ROUTES.newIcaWords,
            helper: `${todayProgress.wordsAdded}/${CREATION_WORDS_GOAL} hoy`,
          },
        ],
        status: wordsDone ? (
          <Badge variant='secondary' className='absolute top-1 right-1'>
            Hecho hoy
          </Badge>
        ) : (
          <Badge variant='destructive' className='absolute top-1 right-1'>
            Pendiente hoy
          </Badge>
        ),
      },
      {
        initial: 'C',
        title: 'CREACION',
        description: 'Accede a la creacion de tu conocimiento escrito.',
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
        status:
          reviewSession > 0 ? (
            <Badge variant='secondary' className='absolute top-1 right-1'>
              Sesion iniciada
            </Badge>
          ) : (
            <Badge variant='destructive' className='absolute top-1 right-1'>
              Sesion no iniciada
            </Badge>
          ),
      },
      {
        initial: 'A',
        title: 'ACTIVACION',
        description: 'Activa tu conocimiento escrito mediante frases.',
        actions: [
          {
            label: 'Mi frase de activacion',
            to: DASHBOARD_ROUTES.activationPhrase,
            disabled: cardCount < 5,
            helper:
              cardCount < 5 ? 'Necesitas minimo 5 palabras' : `Nivel ${level}`,
          },
          {
            label: 'Mi historial de frases',
            to: DASHBOARD_ROUTES.phraseHistory,
          },
        ],
        status: phraseDone ? (
          <Badge variant='secondary' className='absolute top-1 right-1'>
            Frase hecha hoy
          </Badge>
        ) : (
          <Badge variant='destructive' className='absolute top-1 right-1'>
            Frase pendiente hoy
          </Badge>
        ),
      },
    ],
    [cardCount, level, phraseDone, todayProgress.wordsAdded, wordsDone],
  )

  return (
    <section className='flex flex-1 items-center justify-center'>
      <div className='mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-3'>
        {cards.map((card) => (
          <Card
            className='relative lg:gap-16 gap-6 border border-primary'
            key={card.initial}
          >
            {card.status && card.status}
            <CardHeader>
              <div className='lg:mt-8 mt-2 text-center text-8xl font-heading font-black text-muted-foreground/20'>
                {card.initial}
              </div>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>

            <CardContent className='flex flex-row justify-between gap-2'>
              {card.actions.map((action) => (
                <div key={action.label} className='w-full space-y-1.5'>
                  {action.disabled ? (
                    <Button
                      type='button'
                      variant='secondary'
                      className='w-full justify-center'
                      disabled
                    >
                      {action.label}
                    </Button>
                  ) : (
                    <Button asChild className='w-full justify-center'>
                      <Link to={action.to}>{action.label}</Link>
                    </Button>
                  )}

                  {action.helper && (
                    <p className='ml-2 text-xs text-muted-foreground'>
                      {action.helper}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
