import { cn } from '@/lib/utils'
import { t, tn } from '@/i18n'
import { REVIEW_ROUND_SIZE } from '../constants'
import { GameProgress } from '../game/ui'

type ProgressBarProps = {
  correct: number
  total?: number
  answers?: Array<'correct' | 'wrong'>
  className?: string
  /** Solo la barra, sin el texto de encima (para la barra de arriba de la partida). */
  hideLabel?: boolean
}

/**
 * Progreso de la ronda de flashcards.
 * - Con `answers` (modo clásico): una casilla gruesa por tarjeta, verde si la sabías y roja si no.
 * - Sin `answers` (modo objetivo): barra continua hacia las correctas que faltan.
 */
export function ProgressBar({
  correct,
  total = REVIEW_ROUND_SIZE,
  answers,
  className,
  hideLabel = false,
}: ProgressBarProps) {
  const answerList = answers ?? []
  const safeTotal = Math.max(total, 1)
  const pct = Math.min((correct / safeTotal) * 100, 100)
  const pending = Math.max(total - correct, 0)
  const answered = Math.min(answerList.length, total)
  const wrong = answerList.filter((answer) => answer === 'wrong').length
  const useClassicResultDots = answers !== undefined
  const done = correct >= total

  const leftText = !done
    ? useClassicResultDots
      ? t('{correct} aciertos · {wrong} fallos', { correct, wrong })
      : tn(correct, '{n} / {total} correcta', '{n} / {total} correctas', { total })
    : t('¡Objetivo cumplido!')
  const leftToAnswer = Math.max(total - answered, 0)
  const rightText = !done
    ? useClassicResultDots
      ? leftToAnswer > 0
        ? tn(leftToAnswer, 'Falta {n}', 'Faltan {n}')
        : t('Ronda terminada')
      : tn(pending, 'Falta {n}', 'Faltan {n}')
    : null

  return (
    <div className={cn('w-full', className)}>
      {!hideLabel ? (
        <div className='mb-2 flex items-center justify-between gap-2'>
          <span className='text-sm font-extrabold tabular-nums'>{leftText}</span>
          {rightText ? (
            <span className='text-xs font-bold text-muted-foreground tabular-nums'>{rightText}</span>
          ) : null}
        </div>
      ) : null}

      {useClassicResultDots ? (
        <div
          className='flex w-full gap-1.5'
          role='progressbar'
          aria-label={t('Progreso de la ronda')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
        >
          {Array.from({ length: total }, (_, i) => {
            const state = i < answered ? answerList[i] : i === answered ? 'current' : 'pending'
            const color =
              state === 'correct'
                ? 'var(--ica-ok)'
                : state === 'wrong'
                  ? 'var(--ica-bad-strong)'
                  : state === 'current'
                    ? 'color-mix(in oklab, var(--primary) 30%, var(--muted))'
                    : 'var(--muted)'
            return (
              <span
                key={i}
                className={cn(
                  'relative h-4 min-w-0 flex-1 overflow-hidden rounded-full transition-colors duration-300',
                  i === answered - 1 && answered > 0 && 'ica-pop',
                )}
                style={{ background: color }}
              >
                {state === 'correct' || state === 'wrong' ? (
                  <span className='absolute top-[3px] right-1.5 left-1.5 h-1 rounded-full bg-white/35' aria-hidden='true' />
                ) : null}
              </span>
            )
          })}
        </div>
      ) : (
        <GameProgress
          value={pct / 100}
          color='var(--ica-ok)'
          height={16}
          label={t('{correct} de {total} correctas', { correct, total })}
        />
      )}
    </div>
  )
}
