import { useEffect, useRef, useState } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MobileProfileSheet } from './MobileProfileSheet'
import { PendingReviewDot } from './PendingReviewDot'
import { DASHBOARD_ROUTES } from '../routes/paths'

// Deslizar hacia arriba sobre la tab bar (al menos estos px) abre el perfil
const SWIPE_UP_OPEN_THRESHOLD_PX = 40

type MobileBottomNavProps = {
  shouldHighlightProfileButton: boolean
  shouldHighlightCoachingProfileButton?: boolean
}

export function MobileBottomNav({
  shouldHighlightProfileButton,
  shouldHighlightCoachingProfileButton = false,
}: MobileBottomNavProps) {
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const touchStartYRef = useRef<number | null>(null)

  // Si se navega a otra pantalla, el panel de perfil se cierra
  useEffect(() => {
    setProfileOpen(false)
  }, [location.pathname])

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null
  }

  const handleTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const startY = touchStartYRef.current
    touchStartYRef.current = null
    const endY = event.changedTouches[0]?.clientY
    if (startY === null || endY === undefined) return
    if (startY - endY >= SWIPE_UP_OPEN_THRESHOLD_PX) {
      setProfileOpen(true)
    }
  }
  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 ${
      isActive ? 'text-primary' : 'text-muted-foreground'
    }`
  const isOnProfileRoute = location.pathname === DASHBOARD_ROUTES.profile
  const isOnIcaTestsRoute = location.pathname.startsWith(DASHBOARD_ROUTES.testsIca)
  const isOnManageCoachingRoute = location.pathname.startsWith(
    DASHBOARD_ROUTES.manageCoaching,
  )
  const hasIcaProfileAlert = shouldHighlightProfileButton && !isOnIcaTestsRoute
  const hasCoachingProfileAlert =
    shouldHighlightCoachingProfileButton && !isOnManageCoachingRoute
  const shouldPulseProfileButton =
    (hasIcaProfileAlert || hasCoachingProfileAlert) &&
    !isOnProfileRoute &&
    !profileOpen
  const isProfileActive = isOnProfileRoute || profileOpen
  const profileAlertTitle = hasCoachingProfileAlert
    ? hasIcaProfileAlert
      ? 'Tienes novedades: test ICA y coaching pendiente de revisión.'
      : 'Tienes notas maestras pendientes de revisión en coaching.'
    : 'Tienes un test ICA disponible este mes.'

  return (
    <>
      <nav
        className='fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-1.5 backdrop-blur md:hidden min-h-20'
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className='mx-auto grid max-w-md grid-cols-5 items-end px-3 pt-2'>
          <NavLink to={DASHBOARD_ROUTES.home} className={linkClassName}>
            <span className='text-lg leading-none' aria-hidden='true'>
              🏠
            </span>
            <span className='text-[11px] font-medium'>Inicio</span>
          </NavLink>

          <NavLink to={DASHBOARD_ROUTES.streaks} className={linkClassName}>
            <span className='text-lg leading-none' aria-hidden='true'>
              📆
            </span>
            <span className='text-[11px] font-medium'>Rachas</span>
          </NavLink>

          <NavLink
            to={DASHBOARD_ROUTES.newIcaWords}
            aria-label='Añadir palabras ICA'
            className='mx-auto -mt-7 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-[0_12px_28px_-10px_var(--color-primary)]'
          >
            <span className='text-3xl leading-none' aria-hidden='true'>
              ➕
            </span>
          </NavLink>

          <NavLink to={DASHBOARD_ROUTES.gamesIca} className={linkClassName}>
            <span className='text-lg leading-none' aria-hidden='true'>
              🎮
            </span>
            <span className='text-[11px] font-medium'>Juegos ICA</span>
          </NavLink>

          <button
            type='button'
            onClick={() => setProfileOpen(true)}
            aria-haspopup='dialog'
            aria-expanded={profileOpen}
            className={linkClassName({ isActive: isProfileActive })}
          >
            <span className='relative inline-flex h-7 w-7 items-center justify-center'>
              {shouldPulseProfileButton && (
                <span className='pointer-events-none absolute -right-1 -top-1'>
                  <PendingReviewDot
                    title={profileAlertTitle}
                    useIconSpeaker={hasCoachingProfileAlert}
                  />
                </span>
              )}
              <span className='text-base leading-none' aria-hidden='true'>
                👤
              </span>
            </span>
            <span className='text-[11px] font-medium'>Perfil</span>
          </button>
        </div>
      </nav>

      <MobileProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        hasIcaTestAlert={hasIcaProfileAlert}
        hasCoachingAlert={hasCoachingProfileAlert}
      />
    </>
  )
}
