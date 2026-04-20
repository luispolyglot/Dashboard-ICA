import { useId } from 'react'
import { UserIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppBreadcrumbs } from './AppBreadcrumbs'
import { LeaderboardMenu } from './LeaderboardMenu'
import { CREATION_WORDS_GOAL, GOAL, getTodayProgress } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { CalendarTab, DailyProgressMap } from '../types'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type HeaderProps = {
  onOpenCalendar: (tab: CalendarTab) => void
  dailyProgress: DailyProgressMap
  boltButtonRef: (node: HTMLButtonElement | null) => void
}

type HeaderBoltIconProps = {
  segments: 0 | 1 | 2 | 3
  size?: number
}

function HeaderBoltIcon({ segments, size = 28 }: HeaderBoltIconProps) {
  const id = useId().replace(/:/g, '')
  const clipTopId = `bolt-third-top-${id}`
  const clipMidId = `bolt-third-mid-${id}`
  const clipBottomId = `bolt-third-bottom-${id}`
  const topColor = segments >= 3 ? '#EAB308' : '#1e293b'
  const midColor = segments >= 2 ? '#EAB308' : '#1e293b'
  const bottomColor = segments >= 1 ? '#EAB308' : '#1e293b'

  const glow =
    segments === 3
      ? 'drop-shadow(0 0 8px #EAB308) drop-shadow(0 0 18px #EAB30890)'
      : segments > 0
        ? 'drop-shadow(0 0 6px #EAB30870)'
        : 'none'

  return (
    <div
      style={{
        width: size,
        height: size,
        filter: glow,
        transition: 'filter .4s',
      }}
    >
      <svg viewBox='0 0 24 24' width={size} height={size} aria-hidden='true'>
        <defs>
          <clipPath id={clipTopId}>
            <rect x='0' y='0' width='24' height='8' />
          </clipPath>
          <clipPath id={clipMidId}>
            <rect x='0' y='8' width='24' height='8' />
          </clipPath>
          <clipPath id={clipBottomId}>
            <rect x='0' y='16' width='24' height='8' />
          </clipPath>
        </defs>

        <path
          d='M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z'
          fill={topColor}
          clipPath={`url(#${clipTopId})`}
          style={{ transition: 'fill .4s' }}
        />
        <path
          d='M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z'
          fill={midColor}
          clipPath={`url(#${clipMidId})`}
          style={{ transition: 'fill .4s' }}
        />
        <path
          d='M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z'
          fill={bottomColor}
          clipPath={`url(#${clipBottomId})`}
          style={{ transition: 'fill .4s' }}
        />
        <path
          d='M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z'
          fill='none'
          stroke={segments > 0 ? '#EAB308' : '#334155'}
          strokeWidth='1.2'
          style={{ transition: 'stroke .4s' }}
        />
      </svg>
    </div>
  )
}

export function Header({
  onOpenCalendar,
  dailyProgress,
  boltButtonRef,
}: HeaderProps) {
  const todayProgress = getTodayProgress(dailyProgress)
  const wordsDone = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const flashDone = todayProgress.reviewCorrect >= GOAL
  const phraseDone = todayProgress.phraseGenerated
  const completedSegments = (Number(wordsDone) +
    Number(flashDone) +
    Number(phraseDone)) as 0 | 1 | 2 | 3

  return (
    <header className='bg-background'>
      <div className='container mx-auto flex h-16 items-center justify-between px-4'>
        <div className='min-w-0 flex-1'>
          <div className='hidden flex-row items-center gap-2 md:flex'>
            <AppBreadcrumbs />
          </div>
          <div className='md:hidden'>
            <AppBreadcrumbs />
          </div>
        </div>

        <div className='hidden items-center gap-2 md:flex'>
          <LeaderboardMenu />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size='icon' variant='outline'>
                <Link
                  to={DASHBOARD_ROUTES.profile}
                  aria-label='Ir al perfil'
                  title='Perfil'
                >
                  <UserIcon className='h-4 w-4' />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mi Perfil</TooltipContent>
          </Tooltip>
          <button
            ref={boltButtonRef}
            type='button'
            onClick={() => onOpenCalendar('review')}
            className='inline-flex size-8 items-center justify-center transition-all duration-300 hover:scale-[1.04]'
            aria-label={`Abrir mis rachas (${completedSegments}/3)`}
            title={`Mis rachas (${completedSegments}/3)`}
          >
            <HeaderBoltIcon segments={completedSegments} />
          </button>
        </div>
      </div>
    </header>
  )
}
