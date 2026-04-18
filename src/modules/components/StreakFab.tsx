import { Button } from '@/components/ui/button'
import { getStreak } from '../utils'
import type { CalendarTab } from '../types'

type StreakFabProps = {
  completedDays: string[]
  creationDays: string[]
  onClick: (tab: CalendarTab) => void
}

export function StreakFab({ completedDays, creationDays, onClick }: StreakFabProps) {
  const reviewStreak = getStreak(completedDays)
  const creationStreak = getStreak(creationDays)

  return (
    <Button
      type='button'
      onClick={() => onClick('review')}
      variant='outline'
      className='fixed bottom-6 right-6 z-50 hidden h-auto items-center gap-3 rounded-2xl border-primary/30 bg-background/90 px-4 py-3 shadow-2xl backdrop-blur-sm transition-all hover:scale-[1.02] md:inline-flex'
    >
      <span className='text-lg'>⚡</span>
      <span className='text-sm font-semibold'>Mis rachas</span>
      <span className='text-sm font-semibold text-amber-500'>🔥 {reviewStreak}</span>
      <span className='h-4 w-px bg-border' aria-hidden='true' />
      <span className='text-sm font-semibold text-yellow-500'>⭐ {creationStreak}</span>
    </Button>
  )
}
