import { REVIEW_ROUND_SIZE } from '../constants'

type ProgressBarProps = {
  correct: number
  total?: number
  answers?: Array<'correct' | 'wrong'>
}

export function ProgressBar({
  correct,
  total = REVIEW_ROUND_SIZE,
  answers,
}: ProgressBarProps) {
  const answerList = answers ?? []
  const pct = Math.min((correct / total) * 100, 100)
  const pending = Math.max(total - correct, 0)
  const answered = Math.min(answerList.length, total)
  const wrong = answerList.filter((answer) => answer === 'wrong').length
  const correctLiteral = correct === 1 ? 'correcta' : 'correctas'
  const pendingLiteral = pending === 1 ? 'Falta' : 'Faltan'
  const tone = pct < 40 ? 'blue' : pct < 80 ? 'emerald' : 'amber'
  const activeDotClass =
    tone === 'blue'
      ? 'bg-blue-400'
      : tone === 'emerald'
        ? 'bg-emerald-400'
        : 'bg-amber-400'
  const wrongDotClass = 'bg-red-500'
  const useClassicResultDots = answers !== undefined

  return (
    <div className='mb-5 w-full max-w-105'>
      <div className='mb-2 flex items-center justify-between'>
        <span className='text-sm font-semibold text-muted-foreground'>
          {correct < total
            ? useClassicResultDots
              ? `${correct} aciertos · ${wrong} fallos`
              : `${correct} / ${total} ${correctLiteral}`
            : '¡Objetivo cumplido!'}
        </span>
        <span className='text-xs text-muted-foreground'>
          {correct < total
            ? useClassicResultDots
              ? `${pendingLiteral} ${Math.max(total - answered, 0)}`
              : `${pendingLiteral} ${pending}`
            : '🎉'}
        </span>
      </div>
      <div className='grid grid-cols-10 gap-1 rounded-lg bg-muted p-1'>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              useClassicResultDots
                ? i < answered
                  ? answerList[i] === 'wrong'
                    ? wrongDotClass
                    : activeDotClass
                  : 'border border-border bg-background'
                : i < correct
                  ? activeDotClass
                  : 'border border-border bg-background'
            } ${
              useClassicResultDots
                ? i === answered - 1 && answered > 0
                  ? 'scale-110'
                  : ''
                : i === correct - 1 && correct > 0
                  ? 'scale-110'
                  : ''
            }`}
          />
        ))}
      </div>
    </div>
  )
}
