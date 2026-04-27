import { Badge } from '@/components/ui/badge'
import { GOAL } from '../constants'

type GlobalReviewGoalBadgeProps = {
  correctToday: number
}

export function GlobalReviewGoalBadge({ correctToday }: GlobalReviewGoalBadgeProps) {
  const safeCorrect = Math.max(0, correctToday)
  const done = safeCorrect >= GOAL

  return (
    <Badge
      variant='secondary'
      className={`gap-1.5 rounded-full px-3 py-1 text-[11px] ${
        done
          ? 'border border-amber-500/40 bg-amber-500/15 text-amber-200'
          : 'border border-blue-500/40 bg-blue-500/10 text-blue-200'
      }`}
    >
      <span aria-hidden='true'>{done ? '⚡' : '📈'}</span>
      <span>{done ? 'Racha diaria completada' : `Racha diaria ${safeCorrect}/${GOAL}`}</span>
    </Badge>
  )
}
