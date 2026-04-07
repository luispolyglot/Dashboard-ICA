import { GOAL } from '../constants'

type ProgressBarProps = {
  correct: number
}

export function ProgressBar({ correct }: ProgressBarProps) {
  const pct = Math.min((correct / GOAL) * 100, 100)
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
        <span className='text-sm font-semibold text-slate-400'>
          {correct < GOAL
            ? `${correct} / ${GOAL} correctas`
            : '¡Objetivo cumplido!'}
        </span>
        <span className='text-xs text-slate-500'>{correct < GOAL ? `Faltan ${GOAL - correct}` : '🎉'}</span>
      </div>
      <div className='grid grid-cols-10 gap-1 rounded-lg bg-slate-800 p-1'>
        {Array.from({ length: GOAL }, (_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              i < correct ? activeDotClass : 'border border-slate-700 bg-slate-900'
            } ${i === correct - 1 && correct > 0 ? 'scale-110' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
