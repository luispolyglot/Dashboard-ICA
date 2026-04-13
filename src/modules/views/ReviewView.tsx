import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
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

type ReviewViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
  completedDays: string[]
  setCompletedDays: Dispatch<SetStateAction<string[]>>
  reviewSession: number
  startReviewSession: () => Promise<void>
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
}: ReviewViewProps) {
  const [sorted, setSorted] = useState<Lexicard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    setSorted(sortByPriority(cards, reviewSession))
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
    }
  }, [cards, reviewSession])

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
      await recordReviewEvent({ previousCard: currentCard, nextCard: updated, knew })

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
          <p className='text-sm text-slate-500'>No hay tarjetas pendientes por ahora.</p>
        </div>
      </section>
    )
  }

  if (completed) {
    const streak = getStreak(completedDays)
    return (
      <section className='flex flex-1 flex-col items-center justify-center px-5 py-10 text-center'>
        <div className='mb-4 text-7xl'>🏆</div>
        <h2 className='mb-2 font-serif text-4xl font-bold text-slate-100'>
          ¡Objetivo cumplido!
        </h2>
        <p className='mb-3 max-w-sm text-sm leading-relaxed text-slate-500'>
          Has acertado {GOAL} flashcards. ¡Racha de {streak} día
          {streak !== 1 ? 's' : ''}! 🔥
        </p>
        <ProgressBar correct={GOAL} />
        <button
          type='button'
          onClick={() => {
            setCorrect(0)
            setCompleted(false)
            setCurrentIndex(0)
            setSorted(sortByPriority(cards, reviewSession))
            startReviewSession().catch(() => undefined)
          }}
          className='mt-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 px-6 py-3 text-sm font-semibold text-white'
        >
          Otra ronda
        </button>
      </section>
    )
  }

  if (!currentCard || !importance) return null

  const priorityNumber =
    (isFailed ? 0 : 5) + (IMPORTANCE_ORDER[currentCard.importance] ?? 4) + 1

  return (
    <section className='flex flex-1 flex-col items-center justify-center px-5 py-8'>
      <ProgressBar correct={correct} />

      <div
        className='w-full max-w-[420px] cursor-pointer rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-center'
        onClick={() => !flipped && !busy && setFlipped(true)}
      >
        <div className='mb-4 flex items-center justify-between'>
          <div className='inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1'>
            <span
              className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[currentCard.importance]}`}
            />
            <span className='text-[10px] font-semibold uppercase tracking-wide text-slate-300'>
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
            <span className='rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500'>
              P{priorityNumber}
            </span>
          </div>
        </div>

        <span className='mb-2 block text-[11px] uppercase tracking-wider text-slate-500'>
          {flipped ? 'Idioma objetivo' : 'Tu idioma materno'}
        </span>

        <p
          className={`font-serif text-4xl font-bold leading-tight ${flipped ? 'text-slate-100' : 'text-slate-100'}`}
        >
          {flipped ? currentCard.target : currentCard.native}
        </p>

        <p className='mt-2 text-sm text-slate-500'>
          {flipped ? currentCard.native : 'Toca para girar ↻'}
        </p>

        {flipped && (
          <SpeakButton
            text={currentCard.target}
            langName={config.targetLang || 'Inglés'}
            color={importance.color}
          />
        )}
      </div>

      {flipped && (
        <div className='mt-5 grid w-full max-w-[420px] grid-cols-2 gap-3'>
          <button
            type='button'
            onClick={() => handleAnswer(false)}
            className='rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400'
          >
            ✗ No la sabía
          </button>
          <button
            type='button'
            onClick={() => handleAnswer(true)}
            className='rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400'
          >
            ✓ ¡La sabía!
          </button>
        </div>
      )}

      <div className='mt-6 w-full max-w-[420px]'>
        <div className='mb-2 text-center text-[10px] uppercase tracking-wider text-slate-600'>
          Cola de prioridad
        </div>
        <div className='flex flex-wrap justify-center gap-1'>
          {sorted.slice(0, 14).map((card, index) => {
            const active = index === currentIndex
            return (
              <span
                key={`${card.id}-${index}`}
                className={`rounded-full ${
                  active ? 'h-3.5 w-3.5 border-2 border-white' : 'h-2.5 w-2.5'
                } ${IMPORTANCE_DOT[card.importance]} ${(card.streak || 0) === 0 ? 'opacity-100' : 'opacity-40'}`}
              />
            )
          })}
          {sorted.length > 14 && (
            <span className='self-center text-[10px] text-slate-600'>
              +{sorted.length - 14}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
