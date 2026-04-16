import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { GOAL, IMPORTANCE_ORDER, getImportance } from '../constants'
import { ProgressBar } from '../components/ProgressBar'
import { SpeakButton } from '../components/SpeakButton'
import { saveData } from '../services/storage'
import { recordReviewEvent } from '../services/reviewTracking'
import { stopTTS } from '../services/tts'
import {
  getStreak,
  sortByPriority,
  todayKey,
  updateCardAfterReview,
} from '../utils'
import type { AppConfig, Lexicard } from '../types'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

type ReviewViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
  completedDays: string[]
  setCompletedDays: Dispatch<SetStateAction<string[]>>
  reviewSession: number
  startReviewSession: () => Promise<void>
  onFinishPractice: () => void
}

const IMPORTANCE_DOT = {
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
  irrelevant: 'bg-red-400',
} as const

export function ReviewView({
  cards,
  setCards,
  config,
  completedDays,
  setCompletedDays,
  reviewSession,
  startReviewSession,
  onFinishPractice,
}: ReviewViewProps) {
  const [sorted, setSorted] = useState<Lexicard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const [showExampleTranslation, setShowExampleTranslation] = useState(false)

  useEffect(() => {
    setSorted(sortByPriority(cards, reviewSession))
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
    }
  }, [cards, reviewSession])

  useEffect(() => {
    setShowExample(false)
  }, [currentIndex, flipped])

  useEffect(() => {
    startReviewSession().catch(() => undefined)
  }, [startReviewSession])

  const currentCard = sorted[currentIndex]
  const importance = currentCard ? getImportance(currentCard.importance) : null
  const isFailed = currentCard ? (currentCard.streak || 0) === 0 : false

  const handleAnswer = async (knew: boolean): Promise<void> => {
    if (busy || !currentCard) return

    setBusy(true)
    stopTTS()
    setFlipped(false)
    setShowExample(false)

    const updated = updateCardAfterReview(currentCard, knew, reviewSession)
    const nextCards = cards.map((card) =>
      card.id === updated.id ? updated : card,
    )

    const nextCorrect = knew ? correct + 1 : correct
    setCorrect(nextCorrect)

    setCards(nextCards)

    if (nextCorrect < GOAL) {
      const reordered = sortByPriority(nextCards, reviewSession)
      setSorted(reordered)
      setCurrentIndex(
        reordered.length > 0 ? (currentIndex + 1) % reordered.length : 0,
      )
    }

    try {
      await saveData('dashboard-ICA-words', nextCards)
      await recordReviewEvent({
        previousCard: currentCard,
        nextCard: updated,
        knew,
      })

      if (nextCorrect >= GOAL) {
        const dayKey = todayKey()
        if (!completedDays.includes(dayKey)) {
          const nextCompletedDays = [...completedDays, dayKey]
          setCompletedDays(nextCompletedDays)
          await saveData('dashboard-ICA-completed', nextCompletedDays)
        }

        window.setTimeout(() => setCompleted(true), 250)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!currentCard && !completed) {
    return (
      <section className='flex flex-1 items-center justify-center px-5 py-10 text-center'>
        <div>
          <div className='mb-3 text-5xl'>📝</div>
          <p className='text-sm text-muted-foreground'>
            No hay tarjetas pendientes por ahora.
          </p>
        </div>
      </section>
    )
  }

  if (completed) {
    const streak = getStreak(completedDays)
    return (
      <section className='flex flex-1 flex-col items-center justify-center px-5 py-10 text-center'>
        <div className='mb-4 text-7xl'>🏆</div>
        <h2 className='mb-2 font-serif text-4xl font-bold'>
          ¡Objetivo cumplido!
        </h2>
        <p className='mb-3 max-w-sm text-sm leading-relaxed text-muted-foreground'>
          Has acertado {GOAL} flashcards. ¡Racha de {streak} día
          {streak !== 1 ? 's' : ''}! 🔥
        </p>
        <ProgressBar correct={GOAL} />
        <div className='mt-4 flex flex-wrap justify-center gap-2'>
          <Button
            type='button'
            onClick={() => {
              setCorrect(0)
              setCompleted(false)
              setCurrentIndex(0)
              setSorted(sortByPriority(cards, reviewSession))
              startReviewSession().catch(() => undefined)
            }}
            size='lg'
          >
            Otra ronda
          </Button>
          <Button
            type='button'
            onClick={onFinishPractice}
            variant='outline'
            size='lg'
          >
            Finalizar practica
          </Button>
        </div>
      </section>
    )
  }

  if (!currentCard || !importance) return null

  const priorityNumber =
    (isFailed ? 0 : 5) + (IMPORTANCE_ORDER[currentCard.importance] ?? 4) + 1

  return (
    <section className='flex flex-1 flex-col items-center justify-center px-5 py-8'>
      <ProgressBar correct={correct} />

      <Card
        className='w-full max-w-105 cursor-pointer rounded-3xl border p-6 text-center'
        onClick={() => !flipped && !busy && setFlipped(true)}
      >
        <CardContent className='p-0'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1'>
              <span
                className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[currentCard.importance]}`}
              />
              <span className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
                {importance.label}
              </span>
            </div>

            <div className='flex items-center gap-1.5'>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  isFailed
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}
              >
                {isFailed ? 'POR APRENDER' : `RACHA ${currentCard.streak}`}
              </span>
              <span className='rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground'>
                P{priorityNumber}
              </span>
            </div>
          </div>

          <span className='mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground'>
            {flipped ? 'Idioma objetivo' : 'Tu idioma materno'}
          </span>

          <p className='font-serif text-4xl font-bold leading-tight'>
            {flipped ? currentCard.target : currentCard.native}
          </p>

          <p className='mt-2 text-sm text-muted-foreground'>
            {flipped ? currentCard.native : 'Toca para girar ↻'}
          </p>

          {flipped && (
            <div className='flex flex-col gap-2'>
              <SpeakButton
                text={currentCard.target}
                langName={config.targetLang || 'Inglés'}
                color={importance.color}
              />

              <Button
                type='button'
                onClick={(event) => {
                  event.stopPropagation()
                  setShowExample((prev) => !prev)
                }}
                variant='outline'
                className='mt-2'
              >
                {showExample ? 'Ocultar ejemplo' : 'Ejemplo'}
              </Button>

              {showExample && (
                <div className='mt-3 rounded-xl border border-border bg-muted/30 p-3 text-left'>
                  {currentCard.examplePhrase &&
                  currentCard.exampleTranslation ? (
                    <div className='flex flex-col gap-1'>
                      <p className='text-sm font-semibold'>
                        {currentCard.examplePhrase}
                      </p>
                      <div className='flex flex-row gap-2 items-center'>
                        <p
                          className={`text-xs text-muted-foreground ${showExampleTranslation ? '' : 'blur-xs'}`}
                        >
                          {currentCard.exampleTranslation}
                        </p>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={() =>
                            setShowExampleTranslation((prev) => !prev)
                          }
                        >
                          {showExampleTranslation ? (
                            <EyeIcon className='size-4' />
                          ) : (
                            <EyeOffIcon className='size-4' />
                          )}
                        </Button>
                      </div>
                      <SpeakButton
                        text={currentCard.examplePhrase}
                        langName={config.targetLang || 'Inglés'}
                        color={importance.color}
                      />
                    </div>
                  ) : (
                    <p className='text-xs text-muted-foreground'>
                      Esta palabra no tiene ejemplo guardado todavia.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {flipped && (
        <div className='mt-5 grid w-full max-w-105 grid-cols-2 gap-3'>
          <Button
            type='button'
            onClick={() => handleAnswer(false)}
            variant='destructive'
            className='h-11'
          >
            ✗ No la sabía
          </Button>
          <Button
            type='button'
            onClick={() => handleAnswer(true)}
            variant='default'
            className='h-11'
          >
            ✓ ¡La sabía!
          </Button>
        </div>
      )}

      <div className='mt-6 w-full max-w-105'>
        <div className='mb-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground'>
          Cola de prioridad
        </div>
        <div className='flex flex-wrap justify-center gap-1'>
          {sorted.slice(0, 14).map((card, index) => {
            const active = index === currentIndex
            return (
              <span
                key={`${card.id}-${index}`}
                className={`rounded-full ${
                  active
                    ? 'h-3.5 w-3.5 border-2 border-foreground'
                    : 'h-2.5 w-2.5'
                } ${IMPORTANCE_DOT[card.importance]} ${(card.streak || 0) === 0 ? 'opacity-100' : 'opacity-40'}`}
              />
            )
          })}
          {sorted.length > 14 && (
            <span className='self-center text-[10px] text-muted-foreground'>
              +{sorted.length - 14}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
