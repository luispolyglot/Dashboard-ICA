import { useEffect, useId, useMemo, useState } from 'react'
import { PinIcon, PinOffIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AppBreadcrumbs } from './AppBreadcrumbs'
import { LeaderboardMenu } from './LeaderboardMenu'
import { CREATION_WORDS_GOAL, GOAL, getTodayProgress } from '../constants'
import {
  DASHBOARD_ROUTES,
  getManageCoachingUserRoute,
} from '../routes/paths'
import type { CoachingManagedUser } from '../services/coaching'
import type { DailyProgressMap } from '../types'
import { PendingReviewDot } from './PendingReviewDot'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  shouldHighlightCoachingProfileButton?: boolean
  /** Solo para coaches: alumnos con coaching activo (null = no es coach). */
  coachStudents?: CoachingManagedUser[] | null
  boltButtonRef: (node: HTMLButtonElement | null) => void
}

// Alumnos fijados arriba en el acceso rápido. Se guardan en este navegador, por coach.
const PINNED_STUDENTS_STORAGE_PREFIX = 'coach-pinned-students:'

function readPinnedStudents(key: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function usePinnedStudents(coachUserId: string | undefined) {
  const storageKey = `${PINNED_STUDENTS_STORAGE_PREFIX}${coachUserId || 'anon'}`
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPinnedStudents(storageKey))

  useEffect(() => {
    setPinnedIds(readPinnedStudents(storageKey))
  }, [storageKey])

  const togglePinned = (studentId: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Sin almacenamiento: el fijado dura hasta recargar.
      }
      return next
    })
  }

  return { pinnedIds, togglePinned }
}

/* Acceso rápido del coach (solo ordenador): un clic y estás en el tablero del alumno. */
function CoachQuickAccess({
  students,
  hasPending,
}: {
  students: CoachingManagedUser[]
  hasPending: boolean
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { pinnedIds, togglePinned } = usePinnedStudents(user?.id)

  // Fijados primero (en el orden en que se fijaron), luego el resto como venían.
  const { pinnedStudents, otherStudents } = useMemo(() => {
    const byId = new Map(students.map((student) => [student.id, student]))
    const pinned = pinnedIds
      .map((id) => byId.get(id))
      .filter((student): student is CoachingManagedUser => Boolean(student))
    const pinnedSet = new Set(pinned.map((student) => student.id))
    return {
      pinnedStudents: pinned,
      otherStudents: students.filter((student) => !pinnedSet.has(student.id)),
    }
  }, [pinnedIds, students])

  // El botón de fijar va fuera de la opción del menú: así fijar no abre al alumno.
  const renderStudent = (student: CoachingManagedUser, isPinned: boolean) => (
    <div key={student.id} className='group flex items-center gap-1 pr-1'>
      <DropdownMenuItem
        className='flex min-w-0 flex-1 items-center justify-between gap-3'
        onSelect={() =>
          navigate(getManageCoachingUserRoute(student.userId, student.id))
        }
      >
        <span className='min-w-0 flex-1'>
          <span className='block truncate font-medium'>
            {student.userDisplayName}
          </span>
          <span className='block text-xs text-muted-foreground'>
            {student.targetLang} · {student.level}
          </span>
        </span>
        {student.hasPendingMasterNotesReview ||
        (student.pendingMasterNotesReviewCount || 0) > 0 ? (
          <span
            className='shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'
            title='Notas maestras pendientes de revisar'
          >
            {student.pendingMasterNotesReviewCount || 1} por revisar
          </span>
        ) : null}
      </DropdownMenuItem>
      <button
        type='button'
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent',
          isPinned
            ? 'text-primary'
            : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        aria-label={
          isPinned
            ? `Desfijar a ${student.userDisplayName}`
            : `Fijar a ${student.userDisplayName} arriba`
        }
        title={isPinned ? 'Desfijar' : 'Fijar arriba'}
        onClick={() => togglePinned(student.id)}
      >
        {isPinned ? (
          <PinOffIcon className='size-3.5' aria-hidden='true' />
        ) : (
          <PinIcon className='size-3.5' aria-hidden='true' />
        )}
      </button>
    </div>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          className='relative hidden h-9 gap-2 px-3 md:inline-flex'
          aria-label='Acceso rápido a coaching'
        >
          <span aria-hidden='true'>🎯</span>
          <span className='text-sm font-semibold'>Coaching</span>
          {students.length > 0 && (
            <span className='rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary'>
              {students.length}
            </span>
          )}
          {hasPending && (
            <span className='absolute -right-1 -top-1 size-2.5 rounded-full bg-amber-400 ring-2 ring-background' />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-80'>
        <DropdownMenuLabel>Tus alumnos en coaching</DropdownMenuLabel>
        {students.length === 0 ? (
          <p className='px-2 py-1.5 text-sm text-muted-foreground'>
            No hay coachings activos.
          </p>
        ) : (
          <div className='max-h-80 overflow-y-auto'>
            {pinnedStudents.length > 0 && (
              <>
                <p className='px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'>
                  📌 Fijados
                </p>
                {pinnedStudents.map((student) => renderStudent(student, true))}
                {otherStudents.length > 0 && <DropdownMenuSeparator />}
              </>
            )}
            {otherStudents.map((student) => renderStudent(student, false))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(DASHBOARD_ROUTES.manageCoaching)}>
          <span aria-hidden='true'>👥</span>
          Ver todos los alumnos
        </DropdownMenuItem>
        <DropdownMenuItem
          className='mt-1 bg-sky-500/10 font-semibold text-sky-700 focus:bg-sky-500/20 focus:text-sky-800 dark:text-sky-300 dark:focus:text-sky-200'
          onSelect={() => navigate(DASHBOARD_ROUTES.manageCoachingCalendar)}
        >
          <span aria-hidden='true'>📅</span>
          Calendario de coaching
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
  shouldHighlightCoachingProfileButton = false,
  coachStudents = null,
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
  const isOnManageCoachingRoute = location.pathname.startsWith(
    DASHBOARD_ROUTES.manageCoaching,
  )
  const hasIcaProfileAlert = shouldHighlightProfileButton && !isOnIcaTestsRoute
  const hasCoachingProfileAlert =
    shouldHighlightCoachingProfileButton && !isOnManageCoachingRoute
  const shouldPulseProfileButton =
    (hasIcaProfileAlert || hasCoachingProfileAlert) && !isOnProfileRoute
  const profileAlertTitle = hasCoachingProfileAlert
    ? hasIcaProfileAlert
      ? 'Tienes novedades: test ICA y coaching pendiente de revisión.'
      : 'Tienes notas maestras pendientes de revisión en coaching.'
    : 'Tienes un test ICA disponible este mes.'

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
          {coachStudents ? (
            <CoachQuickAccess
              students={coachStudents}
              hasPending={shouldHighlightCoachingProfileButton}
            />
          ) : null}
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
                    <span className='pointer-events-none absolute -right-1 -top-1'>
                      <PendingReviewDot
                        title={profileAlertTitle}
                        useIconSpeaker={hasCoachingProfileAlert}
                      />
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
            <TooltipContent>{`Objetivos de hoy: ${completedSegments}/2 · Ver mis rachas`}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
