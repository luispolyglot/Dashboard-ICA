import { cn } from '@/lib/utils'
import { REVIEW_MODE_OPTIONS, REVIEW_ROUND_SIZE } from '../constants'
import { GlobalReviewGoalBadge } from '../components/GlobalReviewGoalBadge'
import type { Lexicard, ReviewMode } from '../types'

type FlashcardsModeViewProps = {
  cards: Lexicard[]
  reviewCorrectToday: number
  onStartMode: (mode: ReviewMode) => void
}

export function FlashcardsModeView({
  cards,
  reviewCorrectToday,
  onStartMode,
}: FlashcardsModeViewProps) {
  const minWordsPerFrequencyMode = 10
  const roundSize: number = REVIEW_ROUND_SIZE
  const flashcardsLiteral = roundSize === 1 ? 'flashcard' : 'flashcards'

  const cardBaseClass =
    'relative flex min-h-[210px] w-full flex-col overflow-hidden rounded-[20px] border border-slate-800 px-[24px] py-7 text-left font-sans transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-[linear-gradient(160deg,#ffffff,#eef3f9)] hover:-translate-y-[3px] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'

  const countsByMode: Record<ReviewMode, number> = {
    mixed: cards.length,
    vital: cards.filter((card) => card.importance === 'vital').length,
    frequent: cards.filter((card) => card.importance === 'frequent').length,
    occasional: cards.filter((card) => card.importance === 'occasional').length,
    rare: cards.filter((card) => card.importance === 'rare').length,
    irrelevant: cards.filter((card) => card.importance === 'irrelevant').length,
  }

  return (
    <section className='flex flex-1 justify-center items-center px-4 py-6 md:py-10'>
      <div className='w-full max-w-5xl space-y-6'>
        <div className='space-y-3 text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground'>
            Flashcards
          </p>
          <h1 className='font-serif text-3xl font-bold tracking-tight md:text-4xl'>
            Elige tu modo de práctica
          </h1>
          <p className='mx-auto max-w-2xl text-sm text-muted-foreground md:text-base'>
            Juega con tus palabras ICA en una ronda de {REVIEW_ROUND_SIZE}{' '}
            {flashcardsLiteral}.
          </p>
          <div className='flex justify-center'>
            <GlobalReviewGoalBadge correctToday={reviewCorrectToday} />
          </div>
        </div>

        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 pb-20 md:pb-0'>
          {REVIEW_MODE_OPTIONS.map((mode) => {
            const count = countsByMode[mode.key]
            const requiresMinimum = mode.key !== 'mixed'
            const disabled = requiresMinimum
              ? count < minWordsPerFrequencyMode
              : count === 0
            const wordsLiteral = count === 1 ? 'palabra' : 'palabras'
            const missing = Math.max(minWordsPerFrequencyMode - count, 0)
            const missingLiteral = missing === 1 ? 'palabra' : 'palabras'

            return (
              <button
                type='button'
                key={mode.key}
                onClick={() => !disabled && onStartMode(mode.key)}
                disabled={disabled}
                className={cn(
                  cardBaseClass,
                  disabled &&
                    'cursor-not-allowed opacity-70 hover:translate-y-0 border-red-500/30 bg-[linear-gradient(160deg,#fff5f5,#fef2f2)] dark:bg-[linear-gradient(160deg,#2a1010,#1f0a0a)]',
                )}
              >
                <div className='mb-auto flex items-center justify-between gap-3'>
                  <h2 className='font-serif text-2xl font-bold tracking-wide text-slate-700 dark:text-slate-100'>
                    {mode.title}
                  </h2>
                  <span className='text-3xl' aria-hidden='true'>
                    {mode.emoji}
                  </span>
                </div>
                <p
                  className={cn(
                    'mt-5 text-sm leading-relaxed text-slate-500 dark:text-slate-300',
                    disabled && 'font-semibold text-red-600 dark:text-red-300',
                  )}
                >
                  {disabled && requiresMinimum ? (
                    <>
                      Necesitas <strong>{minWordsPerFrequencyMode}</strong>{' '}
                      palabras ICA de esta frecuencia. Tienes{' '}
                      <strong>{count}</strong> ({missing} {missingLiteral} mas).
                    </>
                  ) : disabled ? (
                    'No posees palabras ICA de esta frecuencia.'
                  ) : mode.key === 'mixed' ? (
                    <>
                      Juega con tus <strong>{count}</strong> {wordsLiteral} ICA
                      de forma aleatoria.
                    </>
                  ) : (
                    <>
                      Juega con tus <strong>{count}</strong> {wordsLiteral} ICA
                      de frecuencia {mode.title.toLowerCase()}.
                    </>
                  )}
                </p>
              </button>
            )
          })}
        </div>

        {cards.length === 0 && (
          <p className='text-center text-sm text-muted-foreground'>
            Aún no tienes palabras. Añade ICA words para desbloquear las rondas.
          </p>
        )}
      </div>
    </section>
  )
}
