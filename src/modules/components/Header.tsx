import { useId } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AppBreadcrumbs } from './AppBreadcrumbs'
import { LeaderboardMenu } from './LeaderboardMenu'
import { CREATION_WORDS_GOAL, GOAL, getTodayProgress } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { DailyProgressMap } from '../types'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme } from '@/theme/ThemeContext'

type HeaderProps = {
  dailyProgress: DailyProgressMap
  voiceActivationsToday: number
  shouldHighlightProfileButton: boolean
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
  dailyProgress,
  voiceActivationsToday,
  shouldHighlightProfileButton,
  boltButtonRef,
}: HeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const todayProgress = getTodayProgress(dailyProgress)
  const flashDone = todayProgress.reviewCorrect >= GOAL
  const phraseDone = todayProgress.phraseGenerated
  const hasFiveWords = todayProgress.wordsAdded >= CREATION_WORDS_GOAL
  const icaTopDone = hasFiveWords && phraseDone && voiceActivationsToday > 0
  const completedSegments = (Number(flashDone) + Number(icaTopDone)) as
    | 0
    | 1
    | 2

  const { theme } = useTheme()
  const isOnProfileRoute = location.pathname === DASHBOARD_ROUTES.profile
  const isOnIcaTestsRoute = location.pathname.startsWith(DASHBOARD_ROUTES.testsIca)
  const shouldPulseProfileButton =
    shouldHighlightProfileButton && !isOnProfileRoute && !isOnIcaTestsRoute

  return (
    <header className='bg-background'>
      <div className='container mx-auto flex h-16 items-center justify-between px-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-row items-center gap-0 w-full lg:w-auto lg:justify-start justify-between'>
            {theme === 'light' ? (
              <img
                src='/logo-light.png'
                alt='Logo de ICADEMY'
                className='h-16 lg:h-20 w-auto'
              />
            ) : (
              <img
                src='/logo-dark.png'
                alt='Logo de ICADEMY'
                className='h-16 lg:h-20 w-auto'
              />
            )}
            <AppBreadcrumbs />
            <div className='w-1 block lg:hidden'></div>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <LeaderboardMenu />
          <div className='hidden md:block'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size='icon'
                  variant='outline'
                  className={
                    shouldPulseProfileButton
                      ? 'relative overflow-visible border-amber-300 shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_0_18px_rgba(251,191,36,0.25)]'
                      : undefined
                  }
                >
                  {shouldPulseProfileButton && (
                    <span className='pointer-events-none absolute -right-0.5 -top-0.5 size-3'>
                      <span className='absolute inset-0 rounded-full bg-amber-300/80 animate-pulse' />
                      <span className='absolute inset-0 rounded-full bg-primary animate-ping' />
                    </span>
                  )}
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
                onClick={() => navigate(DASHBOARD_ROUTES.streaks)}
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
