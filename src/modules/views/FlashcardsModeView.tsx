import { cn } from '@/lib/utils'
import { REVIEW_MODE_OPTIONS, REVIEW_ROUND_SIZE } from '../constants'
import { GlobalReviewGoalBadge } from '../components/GlobalReviewGoalBadge'
import { ReviewPlayStyleControl } from '../components/ReviewPlayStyleControl'
import { getReviewModeMinimumWords } from '../review/playStyle'
import type { ReviewPlayStyle } from '../review/playStyle'
import type { Lexicard, ReviewMode } from '../types'

type FlashcardsModeViewProps = {
  cards: Lexicard[]
  reviewCorrectToday: number
  playStyle: ReviewPlayStyle
  pendingOnly: boolean
  onPlayStyleChange: (style: ReviewPlayStyle) => void
  onPendingOnlyChange: (pendingOnly: boolean) => void
  onStartMode: (mode: ReviewMode) => void
}

export function FlashcardsModeView({
  cards,
  reviewCorrectToday,
  playStyle,
  pendingOnly,
  onPlayStyleChange,
  onPendingOnlyChange,
  onStartMode,
}: FlashcardsModeViewProps) {
  const isGoalStyle = playStyle === 'goal'
  const pendingCards = cards.filter((card) => (card.streak || 0) === 0)
  const availableCards = pendingOnly ? pendingCards : cards
  const minWordsByMode = getReviewModeMinimumWords(playStyle)
  const roundSize: number = isGoalStyle
    ? availableCards.length
    : REVIEW_ROUND_SIZE
  const flashcardsLiteral = roundSize === 1 ? 'flashcard' : 'flashcards'

  const cardBaseClass =
    'relative flex min-h-40 w-full flex-col overflow-hidden rounded-[20px] border border-slate-800 px-[24px] py-7 text-left font-sans transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-[linear-gradient(160deg,#ffffff,#eef3f9)] hover:-translate-y-[3px] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'

  const countsByMode: Record<ReviewMode, number> = {
    mixed: availableCards.length,
    vital: availableCards.filter((card) => card.importance === 'vital').length,
    frequent: availableCards.filter((card) => card.importance === 'frequent')
      .length,
    occasional: availableCards.filter(
      (card) => card.importance === 'occasional',
    ).length,
    rare: availableCards.filter((card) => card.importance === 'rare').length,
    irrelevant: availableCards.filter(
      (card) => card.importance === 'irrelevant',
    ).length,
  }

  return (
    <section className='flex flex-1 justify-center items-center p-4 lg:pb-24'>
      <div className='w-full max-w-5xl space-y-6'>
        <div className='flex flex-col lg:flex-row justify-between'>
          <div className='flex flex-col gap-2'>
            <h1 className='font-serif text-2xl lg:text-3xl font-bold tracking-tight'>
              📚 Flashcards
            </h1>
            <p className='mx-auto max-w-2xl text-sm text-muted-foreground md:text-base'>
              {isGoalStyle
                ? pendingOnly
                  ? 'Usa solo tus tarjetas no aprendidas o falladas y termina al llegar a 10 correctas.'
                  : 'Usa todas tus tarjetas disponibles y termina al llegar a 10 correctas.'
                : pendingOnly
                  ? `Juega con tus tarjetas no aprendidas o falladas en una ronda de ${REVIEW_ROUND_SIZE} ${flashcardsLiteral}.`
                  : `Juega con tus palabras ICA en una ronda de ${REVIEW_ROUND_SIZE} ${flashcardsLiteral}.`}
            </p>
          </div>
          <div className='flex flex-col items-end justify-center gap-2'>
            <GlobalReviewGoalBadge correctToday={reviewCorrectToday} />
            <ReviewPlayStyleControl
              playStyle={playStyle}
              pendingOnly={pendingOnly}
              pendingCount={pendingCards.length}
              onPlayStyleChange={onPlayStyleChange}
              onPendingOnlyChange={onPendingOnlyChange}
            />
          </div>
        </div>

        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 pb-20 md:pb-0'>
          {REVIEW_MODE_OPTIONS.map((mode) => {
            const count = countsByMode[mode.key]
            const minimumRequired = isGoalStyle
              ? minWordsByMode
              : mode.key === 'mixed' && !pendingOnly
                ? 1
                : minWordsByMode
            const disabled = count < minimumRequired
            const wordsLiteral = count === 1 ? 'palabra' : 'palabras'
            const missing = Math.max(minimumRequired - count, 0)
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
                    'mt-2 lg:mt-5 text-sm leading-relaxed text-slate-500 dark:text-slate-300',
                    disabled && 'font-semibold text-red-600 dark:text-red-300',
                  )}
                >
                  {disabled ? (
                    <>
                      Necesitas <strong>{minimumRequired}</strong>{' '}
                      {mode.key === 'mixed'
                        ? pendingOnly
                          ? 'tarjetas no aprendidas o falladas totales'
                          : 'palabras ICA totales'
                        : pendingOnly
                          ? 'tarjetas no aprendidas o falladas de esta frecuencia'
                          : 'palabras ICA de esta frecuencia'}
                      . Tienes <strong>{count}</strong> ({missing}{' '}
                      {missingLiteral} más).
                    </>
                  ) : mode.key === 'mixed' ? (
                    <>
                      Juega con tus <strong>{count}</strong>{' '}
                      {pendingOnly
                        ? `${wordsLiteral} no aprendidas o falladas`
                        : `${wordsLiteral} ICA`}{' '}
                      de forma aleatoria.
                    </>
                  ) : (
                    <>
                      Juega con tus <strong>{count}</strong>{' '}
                      {pendingOnly
                        ? `${wordsLiteral} no aprendidas o falladas`
                        : `${wordsLiteral} ICA`}{' '}
                      de frecuencia {mode.title.toLowerCase()}.
                    </>
                  )}
                </p>
              </button>
            )
          })}
        </div>

        {availableCards.length === 0 && (
          <p className='text-center text-sm text-muted-foreground'>
            {pendingOnly
              ? 'No tienes tarjetas no aprendidas o falladas en este momento.'
              : 'Aún no tienes palabras. Añade ICA words para desbloquear las rondas.'}
          </p>
        )}
      </div>
    </section>
  )
}
