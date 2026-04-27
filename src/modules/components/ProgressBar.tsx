import { REVIEW_ROUND_SIZE } from '../constants'

type ProgressBarProps = {
  correct: number
  total?: number
}

export function ProgressBar({ correct, total = REVIEW_ROUND_SIZE }: ProgressBarProps) {
  const pct = Math.min((correct / total) * 100, 100)
  const pending = Math.max(total - correct, 0)
  const correctLiteral = correct === 1 ? 'correcta' : 'correctas'
  const pendingLiteral = pending === 1 ? 'Falta' : 'Faltan'
  const tone = pct < 40 ? 'blue' : pct < 80 ? 'emerald' : 'amber'
  const activeDotClass =
    tone === 'blue'
      ? 'bg-blue-400'
      : tone === 'emerald'
        ? 'bg-emerald-400'
        : 'bg-amber-400'

  return (
    <div className='mb-5 w-full max-w-[420px]'>
      <div className='mb-2 flex items-center justify-between'>
        <span className='text-sm font-semibold text-muted-foreground'>
          {correct < total
            ? `${correct} / ${total} ${correctLiteral}`
            : '¡Objetivo cumplido!'}
        </span>
        <span className='text-xs text-muted-foreground'>{correct < total ? `${pendingLiteral} ${pending}` : '🎉'}</span>
      </div>
      <div className='grid grid-cols-10 gap-1 rounded-lg bg-muted p-1'>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              i < correct ? activeDotClass : 'border border-border bg-background'
            } ${i === correct - 1 && correct > 0 ? 'scale-110' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
