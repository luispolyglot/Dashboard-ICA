import { CREATION_WORDS_GOAL, getTodayProgress, isCreationDone } from '../constants'
import { Button } from '@/components/ui/button'
import { getStreak, todayKey } from '../utils'
import type { CalendarTab, DailyProgressMap } from '../types'

type StreakFabProps = {
  completedDays: string[]
  creationDays: string[]
  dailyProgress: DailyProgressMap
  onClick: (tab: CalendarTab) => void
}

export function StreakFab({ completedDays, creationDays, dailyProgress, onClick }: StreakFabProps) {
  const reviewStreak = getStreak(completedDays)
  const creationStreak = getStreak(creationDays)
  const reviewDone = completedDays.includes(todayKey())
  const tp = getTodayProgress(dailyProgress)
  const creationDone = isCreationDone(tp)

  return (
    <>
      <Button
        type='button'
        onClick={() => onClick('review')}
        variant='outline'
        className={`fixed bottom-6 left-6 z-50 h-auto items-center gap-2 rounded-2xl px-5 py-3 shadow-2xl transition-all ${
          reviewDone
            ? 'border-blue-500/40 bg-blue-500/15'
            : 'border-red-500/30 bg-red-500/10'
        }`}
      >
        <span className={`text-xl ${reviewDone ? 'opacity-100' : 'opacity-35'}`}>🔥</span>
        <div className='text-left'>
          <div className={`text-lg font-bold leading-none ${reviewDone ? 'text-blue-400' : 'text-red-400'}`}>
            {reviewStreak}
          </div>
          <div className='text-[10px] leading-tight text-muted-foreground'>Racha Flashcards</div>
        </div>
      </Button>

      <Button
        type='button'
        onClick={() => onClick('creation')}
        variant='outline'
        className={`fixed bottom-6 right-6 z-50 h-auto items-center gap-2 rounded-2xl px-5 py-3 shadow-2xl transition-all ${
          creationDone
            ? 'border-amber-500/40 bg-amber-500/15'
            : 'border-red-500/30 bg-red-500/10'
        }`}
      >
        <span className={`text-xl ${creationDone ? 'opacity-100' : 'opacity-35'}`}>⭐</span>
        <div className='text-left'>
          <div
            className={`text-lg font-bold leading-none ${creationDone ? 'text-amber-400' : 'text-red-400'}`}
          >
            {creationStreak}
          </div>
          <div className='text-[10px] leading-tight text-muted-foreground'>Racha ICA</div>
        </div>

        {!creationDone && (
          <div className='ml-1 flex gap-1'>
            <div
              title={`${tp.wordsAdded}/${CREATION_WORDS_GOAL} palabras`}
              className={`h-2 w-2 rounded-full ${
                tp.wordsAdded >= CREATION_WORDS_GOAL ? 'bg-amber-400' : 'bg-muted-foreground'
              }`}
            />
            <div
              title='Frase generada'
              className={`h-2 w-2 rounded-full ${tp.phraseGenerated ? 'bg-amber-400' : 'bg-muted-foreground'}`}
            />
          </div>
        )}
      </Button>
    </>
  )
}
