import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDaysIcon, CrownIcon, PinIcon, PinOffIcon, UsersIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { DesktopNav } from './DesktopSidebar'
import {
  DASHBOARD_ROUTES,
  getManageCoachingUserRoute,
} from '../routes/paths'
import { pendingReviewOf, type CoachingManagedUser } from '../services/coaching'
import { PendingReviewDot } from './PendingReviewDot'
import type { DailyProgressMap } from '../types'
import { WelcomeBrand } from '../game/WelcomeBrand'
import { GameStatsBar } from '../game/GameStatsBar'
import { ChatQuickButton } from '../game/ChatQuickButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { langName, t } from '@/i18n'

type HeaderProps = {
  dailyProgress: DailyProgressMap
  voiceActivationsToday: number
  shouldHighlightProfileButton: boolean
  shouldHighlightCoachingProfileButton?: boolean
  /** Solo para coaches: alumnos con coaching activo (null = no es coach). */
  coachStudents?: CoachingManagedUser[] | null
  /** A nota desafiante or a PreguntICA waiting in Juegos (dot on the menu). */
  gamesWaiting?: boolean
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

/**
 * Acceso rápido del coach (solo ordenador). Al pasar el ratón por «Coaching» se despliegan los
 * alumnos (como la racha y las ICA Coins de al lado) y un clic lleva a su tablero. También se
 * abre con un clic o con el teclado, como cualquier menú.
 */
function useHoverOpen() {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const later = useCallback((next: boolean, delay: number) => {
    clear()
    timer.current = setTimeout(() => setOpen(next), delay)
  }, [])
  useEffect(() => () => clear(), [])
  return {
    open,
    setOpen: (next: boolean) => {
      clear()
      setOpen(next)
    },
    // Solo con ratón: en pantallas táctiles el menú se abre tocando, como siempre.
    hoverHandlers: {
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse') later(true, 90)
      },
      onPointerLeave: (event: React.PointerEvent) => {
        if (event.pointerType === 'mouse') later(false, 220)
      },
    },
  }
}

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
  const { open, setOpen, hoverHandlers } = useHoverOpen()

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
  const renderStudent = (student: CoachingManagedUser, isPinned: boolean) => {
    const pending = pendingReviewOf(student).total
    return (
      <div key={student.id} className='group flex items-center gap-1 pr-1'>
        <DropdownMenuItem
          className='flex min-w-0 flex-1 items-center gap-3'
          onSelect={() => navigate(getManageCoachingUserRoute(student.userId, student.id))}
        >
          <span
            className='flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white'
            style={{ background: 'linear-gradient(135deg, #1b2450, #3a1752)' }}
            aria-hidden='true'
          >
            {student.userDisplayName.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate leading-tight'>{student.userDisplayName}</span>
            <span className='block text-xs font-semibold text-muted-foreground'>
              {langName(student.targetLang)} · {student.level}
            </span>
          </span>
          {pending > 0 ? (
            <span
              className='shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black'
              style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
              aria-label={t('Tareas y notas maestras pendientes de revisar')}
            >
              {t('{n} por revisar', { n: pending })}
            </span>
          ) : null}
        </DropdownMenuItem>
        <button
          type='button'
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent',
            isPinned
              ? 'text-primary'
              : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
          aria-label={
            isPinned
              ? t('Desfijar a {name}', { name: student.userDisplayName })
              : t('Fijar a {name} arriba', { name: student.userDisplayName })
          }
          onClick={() => togglePinned(student.id)}
        >
          {isPinned ? <PinOffIcon className='size-4' aria-hidden='true' /> : <PinIcon className='size-4' aria-hidden='true' />}
        </button>
      </div>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild {...hoverHandlers}>
        <button
          type='button'
          // Si ya se abrió al pasar el ratón, el clic no lo cierra (se queda abierto para elegir).
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && open) event.preventDefault()
          }}
          className='coaching-hero relative hidden h-10 items-center gap-2 rounded-2xl px-3.5 text-sm font-black text-white transition-transform active:translate-y-[2px] md:inline-flex'
          aria-label={t('Acceso rápido a coaching')}
        >
          <CrownIcon className='size-4' strokeWidth={2.8} style={{ color: 'var(--ica-gold)' }} aria-hidden='true' />
          Coaching
          {students.length > 0 ? (
            <span className='rounded-full px-1.5 text-xs font-black' style={{ background: 'var(--ica-gold)', color: '#4a3200' }}>
              {students.length}
            </span>
          ) : null}
          {hasPending ? (
            // Blinks while there is something to review (Luis, 9 Oct).
            <span className='absolute -top-1.5 -right-1.5'>
              <PendingReviewDot title={t('Tienes tareas o notas maestras por revisar.')} />
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={6} className='w-[22rem] p-0' {...hoverHandlers}>
        <div className='coaching-hero m-1.5 rounded-xl px-3.5 py-3 text-white'>
          <p className='m-0 flex items-center gap-1.5 text-[11px] font-black tracking-[0.14em] uppercase' style={{ color: 'var(--ica-gold)' }}>
            <CrownIcon className='size-3.5' strokeWidth={2.8} aria-hidden='true' />
            Coaching ICA
          </p>
          <p className='m-0 mt-1 text-base font-black'>{t('Tus alumnos en coaching')}</p>
        </div>
        <div className='px-1.5 pb-1.5'>
          {students.length === 0 ? (
            <p className='px-3 py-2 text-sm font-semibold text-muted-foreground'>{t('No hay coachings activos.')}</p>
          ) : (
            <div className='max-h-80 overflow-y-auto'>
              {pinnedStudents.length > 0 && (
                <>
                  <DropdownMenuLabel>
                    <PinIcon className='mr-1 inline size-3' aria-hidden='true' />
                    {t('Fijados')}
                  </DropdownMenuLabel>
                  {pinnedStudents.map((student) => renderStudent(student, true))}
                  {otherStudents.length > 0 && <DropdownMenuSeparator />}
                </>
              )}
              {otherStudents.map((student) => renderStudent(student, false))}
            </div>
          )}
          <DropdownMenuSeparator />
          <div className='grid grid-cols-2 gap-1'>
            <DropdownMenuItem onSelect={() => navigate(DASHBOARD_ROUTES.manageCoaching)}>
              <UsersIcon className='size-4' aria-hidden='true' />
              {t('Todos')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(DASHBOARD_ROUTES.manageCoachingCalendar)}>
              <CalendarDaysIcon className='size-4' aria-hidden='true' />
              {t('Calendario')}
            </DropdownMenuItem>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}



// La racha ICA y las fichas salen del contexto (GameStatsBar);
// dailyProgress y voiceActivationsToday se siguen recibiendo por compatibilidad.
// En ordenador, la cabecera lleva el logo, las pestañas del menú y tus monedas;
// en el móvil, el logo y tus monedas (el menú va abajo). Al abrir la app en el móvil,
// WelcomeBrand saluda en el idioma objetivo antes de dejar el logo en su sitio.
export function Header({
  shouldHighlightProfileButton,
  shouldHighlightCoachingProfileButton = false,
  coachStudents = null,
  gamesWaiting = false,
  boltButtonRef,
}: HeaderProps) {
  return (
    <header className='bg-background md:sticky md:top-0 md:z-30 md:border-b-2 md:border-border md:bg-background/90 md:backdrop-blur'>
      <div className='relative mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-3 px-4 md:h-[72px] lg:px-8'>
        <div className='flex min-w-0 items-center gap-4 lg:flex-1'>
          <WelcomeBrand />
        </div>

        <DesktopNav
          shouldHighlightProfileButton={shouldHighlightProfileButton}
          shouldHighlightCoachingProfileButton={shouldHighlightCoachingProfileButton}
          gamesWaiting={gamesWaiting}
        />

        <div className='flex items-center justify-end gap-2 lg:flex-1'>
          {coachStudents ? (
            <CoachQuickAccess
              students={coachStudents}
              hasPending={shouldHighlightCoachingProfileButton}
            />
          ) : null}
          <ChatQuickButton className='hidden size-11 md:flex' />
          <GameStatsBar ref={boltButtonRef} />
        </div>
      </div>
    </header>
  )
}
