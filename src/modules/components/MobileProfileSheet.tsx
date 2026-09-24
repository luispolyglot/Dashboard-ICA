import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  GraduationCapIcon,
  LanguagesIcon,
  LineChartIcon,
  ListChecksIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { useTheme } from '@/theme/ThemeContext'
import { useDashboardContext } from '../context/DashboardContext'
import { useProfileAccess } from '../hooks/useProfileAccess'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { PendingReviewDot } from './PendingReviewDot'

type MobileProfileSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasIcaTestAlert: boolean
  hasCoachingAlert: boolean
}

// Distancia (px) que hay que arrastrar hacia abajo para cerrar el panel
const DRAG_CLOSE_THRESHOLD_PX = 90

function QuickTile({
  to,
  icon: Icon,
  label,
  alert,
  onNavigate,
}: {
  to: string
  icon: LucideIcon
  label: string
  alert?: ReactNode
  onNavigate: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className='relative flex flex-col items-center gap-1.5 rounded-2xl border border-border/70 bg-card px-1 py-3 text-center transition-colors active:bg-accent'
    >
      {alert && <span className='absolute top-1.5 right-1.5'>{alert}</span>}
      <span className='flex size-9 items-center justify-center rounded-xl bg-muted'>
        <Icon className='size-[18px]' aria-hidden='true' />
      </span>
      <span className='text-[11px] leading-tight font-medium'>{label}</span>
    </Link>
  )
}

function SheetRow({
  to,
  icon: Icon,
  label,
  hint,
  alert,
  tone = 'default',
  onNavigate,
}: {
  to: string
  icon: LucideIcon
  label: string
  hint?: string
  alert?: ReactNode
  tone?: 'default' | 'coaching' | 'admin'
  onNavigate: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className='flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors active:bg-accent'
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          tone === 'coaching' && 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
          tone === 'admin' && 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
          tone === 'default' && 'bg-muted',
        )}
      >
        <Icon className='size-[18px]' aria-hidden='true' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-medium'>{label}</span>
        {hint && (
          <span className='block truncate text-xs text-muted-foreground'>
            {hint}
          </span>
        )}
      </span>
      {alert}
      <ChevronRightIcon
        className='size-4 shrink-0 text-muted-foreground'
        aria-hidden='true'
      />
    </Link>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className='mb-1 px-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase'>
      {children}
    </p>
  )
}

/**
 * Perfil en móvil: panel que sube desde la tab bar.
 * Versión compacta del perfil para que no crezca sin control al añadir cosas.
 * Lo menos usado (nombre, contraseña) sigue en la página completa de Perfil.
 */
export function MobileProfileSheet({
  open,
  onOpenChange,
  hasIcaTestAlert,
  hasCoachingAlert,
}: MobileProfileSheetProps) {
  const { user, signOut } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const { config, setShowLangModal } = useDashboardContext()
  const [hasOpened, setHasOpened] = useState(false)
  if (open && !hasOpened) setHasOpened(true)
  // Solo pedimos permisos (coaching/admin) cuando el panel se abre por primera vez
  const access = useProfileAccess(config?.targetLang, hasOpened)
  const [adminExpanded, setAdminExpanded] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStartYRef = useRef<number | null>(null)

  const metadata = user?.user_metadata ?? {}
  const displayName: string =
    metadata.display_name || user?.email?.split('@')[0] || 'Usuario'
  const initial = displayName.trim().charAt(0).toUpperCase() || '👤'

  const close = () => onOpenChange(false)

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    dragStartYRef.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return
    setDragY(Math.max(0, event.clientY - dragStartYRef.current))
  }

  const handleDragEnd = () => {
    if (dragStartYRef.current === null) return
    dragStartYRef.current = null
    if (dragY > DRAG_CLOSE_THRESHOLD_PX) close()
    setDragY(0)
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await signOut()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const hasCoaching = access.canSeeCoachingPersonalized || access.canManageCoaching
  const hasAdmin = access.canSeeAdminAnalytics || access.isSuperAdmin
  const pendingCoachingNotes = access.pendingCoachingNotes
  const showCoachingAlert =
    hasCoachingAlert || access.pendingCoachingSessions > 0

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/40 duration-200 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden' />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl border-t border-border/70 bg-background text-foreground shadow-[0_-18px_40px_-20px_rgba(0,0,0,0.45)] outline-none md:hidden',
            'duration-300 data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom',
            dragY === 0 && 'transition-transform',
          )}
          style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        >
          {/* Cabecera: se puede arrastrar hacia abajo para cerrar */}
          <div
            className='shrink-0 touch-none px-4 pt-2.5 pb-3 select-none'
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <div className='mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30' />
            <div className='flex items-center gap-3'>
              <span className='flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground'>
                {initial}
              </span>
              <div className='min-w-0 flex-1'>
                <DialogPrimitive.Title className='truncate font-serif text-lg leading-tight font-bold'>
                  {displayName}
                </DialogPrimitive.Title>
                <p className='truncate text-xs text-muted-foreground'>
                  {user?.email || ''}
                </p>
              </div>
              <DialogPrimitive.Close
                className='flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground active:bg-accent'
                aria-label='Cerrar perfil'
              >
                <XIcon className='size-4' />
              </DialogPrimitive.Close>
            </div>

            <div className='mt-3 flex gap-2'>
              <button
                type='button'
                onClick={() => {
                  close()
                  setShowLangModal(true)
                }}
                className='flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium active:bg-accent'
              >
                <LanguagesIcon className='size-3.5 shrink-0' aria-hidden='true' />
                <span className='truncate'>
                  {config
                    ? `${config.nativeLang} → ${config.targetLang}`
                    : 'Idiomas'}
                </span>
              </button>
              <button
                type='button'
                onClick={() =>
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                }
                className='flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium active:bg-accent'
                aria-label='Cambiar tema'
              >
                {resolvedTheme === 'dark' ? (
                  <MoonIcon className='size-3.5' aria-hidden='true' />
                ) : (
                  <SunIcon className='size-3.5' aria-hidden='true' />
                )}
                {resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'}
              </button>
            </div>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]'>
            <div className='grid grid-cols-4 gap-2 px-1'>
              <QuickTile
                to={DASHBOARD_ROUTES.myAnalytics}
                icon={BarChart3Icon}
                label='Estadísticas'
                onNavigate={close}
              />
              <QuickTile
                to={DASHBOARD_ROUTES.testsIca}
                icon={ClipboardCheckIcon}
                label='Tests ICA'
                alert={
                  hasIcaTestAlert ? (
                    <PendingReviewDot title='Tienes un test ICA disponible este mes.' />
                  ) : null
                }
                onNavigate={close}
              />
              <QuickTile
                to={DASHBOARD_ROUTES.calendarIcademy}
                icon={CalendarDaysIcon}
                label='Calendario'
                onNavigate={close}
              />
              <QuickTile
                to={DASHBOARD_ROUTES.trackers}
                icon={LineChartIcon}
                label='Trackers'
                onNavigate={close}
              />
            </div>

            {hasCoaching && (
              <div className='mt-4'>
                <SectionTitle>Coaching</SectionTitle>
                {access.canSeeCoachingPersonalized && (
                  <SheetRow
                    to={DASHBOARD_ROUTES.coachingPersonalized}
                    icon={GraduationCapIcon}
                    label='Coaching personalizado'
                    hint='Clases, feedback y objetivos ICA'
                    tone='coaching'
                    onNavigate={close}
                  />
                )}
                {access.canManageCoaching && (
                  <SheetRow
                    to={DASHBOARD_ROUTES.manageCoaching}
                    icon={UsersIcon}
                    label='Administrar coaching'
                    hint={
                      access.pendingCoachingSessions > 0
                        ? `${pendingCoachingNotes} nota${pendingCoachingNotes === 1 ? '' : 's'} pendiente${pendingCoachingNotes === 1 ? '' : 's'} de revisión`
                        : 'Alumnos, feedback y objetivos'
                    }
                    tone='coaching'
                    alert={
                      showCoachingAlert ? (
                        <PendingReviewDot
                          title='Tienes notas maestras pendientes de revisión.'
                          useIconSpeaker
                        />
                      ) : null
                    }
                    onNavigate={close}
                  />
                )}
              </div>
            )}

            <div className='mt-4'>
              <SectionTitle>Más</SectionTitle>
              <SheetRow
                to={DASHBOARD_ROUTES.instagramTrackPosts}
                icon={CameraIcon}
                label='Track Instagram'
                onNavigate={close}
              />
              <SheetRow
                to={DASHBOARD_ROUTES.manageNotifications}
                icon={BellIcon}
                label='Notificaciones'
                onNavigate={close}
              />
              <SheetRow
                to={DASHBOARD_ROUTES.profile}
                icon={SettingsIcon}
                label='Ajustes de cuenta'
                hint='Nombre y contraseña'
                onNavigate={close}
              />
            </div>

            {hasAdmin && (
              <div className='mt-4'>
                <button
                  type='button'
                  onClick={() => setAdminExpanded((value) => !value)}
                  className='flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase'
                  aria-expanded={adminExpanded}
                >
                  Administración
                  <ChevronDownIcon
                    className={cn(
                      'size-4 transition-transform',
                      adminExpanded && 'rotate-180',
                    )}
                    aria-hidden='true'
                  />
                </button>
                {adminExpanded && (
                  <div>
                    {access.canSeeAdminAnalytics && (
                      <SheetRow
                        to={DASHBOARD_ROUTES.analytics}
                        icon={BarChart3Icon}
                        label='Analíticas admin'
                        tone='admin'
                        onNavigate={close}
                      />
                    )}
                    {access.isSuperAdmin && (
                      <>
                        <SheetRow
                          to={DASHBOARD_ROUTES.manageWhitelist}
                          icon={ListChecksIcon}
                          label='Whitelist'
                          tone='admin'
                          onNavigate={close}
                        />
                        <SheetRow
                          to={DASHBOARD_ROUTES.managePregunticaQuestions}
                          icon={ClipboardCheckIcon}
                          label='PreguntICA'
                          tone='admin'
                          onNavigate={close}
                        />
                        <SheetRow
                          to={DASHBOARD_ROUTES.managePregunticaTokens}
                          icon={CoinsIcon}
                          label='Fichas PreguntICA'
                          tone='admin'
                          onNavigate={close}
                        />
                        <SheetRow
                          to={DASHBOARD_ROUTES.calendarIcademyManage}
                          icon={CalendarDaysIcon}
                          label='Calendario ICADEMY'
                          tone='admin'
                          onNavigate={close}
                        />
                        <SheetRow
                          to={DASHBOARD_ROUTES.calendarIcademyTeachers}
                          icon={UsersIcon}
                          label='Profesores ICADEMY'
                          tone='admin'
                          onNavigate={close}
                        />
                        <SheetRow
                          to={DASHBOARD_ROUTES.historicLeaderboard}
                          icon={TrophyIcon}
                          label='Histórico leaderboard'
                          tone='admin'
                          onNavigate={close}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type='button'
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className='mt-4 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-destructive active:bg-destructive/10 dark:text-rose-300'
            >
              <span className='flex size-9 items-center justify-center rounded-xl bg-destructive/10'>
                <LogOutIcon className='size-[18px]' aria-hidden='true' />
              </span>
              <span className='text-sm font-medium'>
                {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
              </span>
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
