import { useId } from 'react'
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
  segments: 0 | 1 | 2
  size?: number
}

function HeaderBoltIcon({ segments, size = 28 }: HeaderBoltIconProps) {
  const id = useId().replace(/:/g, '')
  const clipTopId = `bolt-half-top-${id}`
  const clipBottomId = `bolt-half-bottom-${id}`
  const topColor = segments >= 2 ? '#EAB308' : '#1e293b'
  const bottomColor = segments >= 1 ? '#EAB308' : '#1e293b'

  const glow =
    segments === 2
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
        scale: 1.5,
      }}
    >
      <svg viewBox='0 0 24 24' width={size} height={size} aria-hidden='true'>
        <defs>
          <clipPath id={clipTopId}>
            <rect x='0' y='0' width='24' height='12' />
          </clipPath>
          <clipPath id={clipBottomId}>
            <rect x='0' y='12' width='24' height='12' />
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
  const flashDone = todayProgress.reviewCorrect >= GOAL
  const phraseDone = todayProgress.phraseGenerated
  const hasFiveWords = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const icaTopDone = hasFiveWords && phraseDone
  const completedSegments = (Number(flashDone) + Number(icaTopDone)) as
    | 0
    | 1
    | 2

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

        <div className='flex items-center gap-2'>
          <LeaderboardMenu />
          <div className='hidden md:block'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size='icon' variant='outline'>
                  <Link
                    to={DASHBOARD_ROUTES.profile}
                    aria-label='Ir al perfil'
                    title='Perfil'
                  >
                    <span aria-hidden='true' className='text-base'>
                      👤
                    </span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mi Perfil</TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={boltButtonRef}
                type='button'
                size='icon'
                variant='outline'
                onClick={() => onOpenCalendar('review')}
                aria-label={`Abrir mis rachas (${completedSegments}/2)`}
                title={`Mis rachas (${completedSegments}/2)`}
                className='transition-all duration-300 hover:scale-[1.04]'
              >
                <HeaderBoltIcon segments={completedSegments} size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mis rachas</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
