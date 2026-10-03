import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { GOAL } from '../constants'
import { CardsIcon, FlameIcon } from '../game/icons'

type GlobalReviewGoalBadgeProps = {
  correctToday: number
  className?: string
}

/** Pastilla con la meta diaria de flashcards (10 acertadas suman un día de racha). */
export function GlobalReviewGoalBadge({
  correctToday,
  className,
}: GlobalReviewGoalBadgeProps) {
  const safeCorrect = Math.max(0, correctToday)
  const done = safeCorrect >= GOAL
  // La racha de flashcards va en azul (la llama azul), igual que en Rachas.
  const color = 'var(--ica-i)'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 py-1 pr-3 pl-1.5 text-xs font-extrabold whitespace-nowrap tabular-nums',
        className,
      )}
      style={{
        background: `color-mix(in oklab, ${color} 14%, var(--card))`,
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        color: 'var(--ica-i-ink)',
      }}
    >
      {done ? <FlameIcon size={18} tone='flash' /> : <CardsIcon size={18} />}
      <span>
        {done
          ? t('Racha diaria completada')
          : t('Racha diaria {done}/{goal}', { done: safeCorrect, goal: GOAL })}
      </span>
    </span>
  )
}
