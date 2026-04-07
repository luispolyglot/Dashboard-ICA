import { CREATION_WORDS_GOAL, getTodayProgress, isCreationDone } from '../constants'
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
      <button
        type='button'
        onClick={() => onClick('review')}
        className={`fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-2xl border px-5 py-3 shadow-2xl transition-all ${
          reviewDone
            ? 'border-blue-500/40 bg-gradient-to-br from-blue-950 to-slate-900'
            : 'border-red-500/30 bg-gradient-to-br from-red-950 to-slate-900'
        }`}
      >
        <span className={`text-xl ${reviewDone ? 'opacity-100' : 'opacity-35'}`}>🔥</span>
        <div className='text-left'>
          <div className={`text-lg font-bold leading-none ${reviewDone ? 'text-blue-400' : 'text-red-400'}`}>
            {reviewStreak}
          </div>
          <div className='text-[10px] leading-tight text-slate-400'>Racha Flashcards</div>
        </div>
      </button>

      <button
        type='button'
        onClick={() => onClick('creation')}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border px-5 py-3 shadow-2xl transition-all ${
          creationDone
            ? 'border-amber-500/40 bg-gradient-to-br from-amber-950 to-slate-900'
            : 'border-red-500/30 bg-gradient-to-br from-red-950 to-slate-900'
        }`}
      >
        <span className={`text-xl ${creationDone ? 'opacity-100' : 'opacity-35'}`}>⭐</span>
        <div className='text-left'>
          <div
            className={`text-lg font-bold leading-none ${creationDone ? 'text-amber-400' : 'text-red-400'}`}
          >
            {creationStreak}
          </div>
          <div className='text-[10px] leading-tight text-slate-400'>Racha ICA</div>
        </div>

        {!creationDone && (
          <div className='ml-1 flex gap-1'>
            <div
              title={`${tp.wordsAdded}/${CREATION_WORDS_GOAL} palabras`}
              className={`h-2 w-2 rounded-full ${
                tp.wordsAdded >= CREATION_WORDS_GOAL ? 'bg-amber-400' : 'bg-slate-600'
              }`}
            />
            <div
              title='Frase generada'
              className={`h-2 w-2 rounded-full ${tp.phraseGenerated ? 'bg-amber-400' : 'bg-slate-600'}`}
            />
          </div>
        )}
      </button>
    </>
  )
}
