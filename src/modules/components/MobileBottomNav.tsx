import { NavLink, useLocation } from 'react-router-dom'
import { PendingReviewDot } from './PendingReviewDot'
import { DASHBOARD_ROUTES } from '../routes/paths'

type MobileBottomNavProps = {
  shouldHighlightProfileButton: boolean
  shouldHighlightCoachingProfileButton?: boolean
}

export function MobileBottomNav({
  shouldHighlightProfileButton,
  shouldHighlightCoachingProfileButton = false,
}: MobileBottomNavProps) {
  const location = useLocation()
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
    (hasIcaProfileAlert || hasCoachingProfileAlert) && !isOnProfileRoute
  const profileAlertTitle = hasCoachingProfileAlert
    ? hasIcaProfileAlert
      ? 'Tienes novedades: test ICA y coaching pendiente de revision.'
      : 'Tienes notas maestras pendientes de revision en coaching.'
    : 'Tienes un test ICA disponible este mes.'

  return (
    <nav className='fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-1.5 backdrop-blur md:hidden min-h-20'>
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

        <NavLink to={DASHBOARD_ROUTES.profile} className={linkClassName}>
          <span
            className={
              shouldPulseProfileButton
                ? 'relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_0_18px_rgba(251,191,36,0.25)]'
                : 'relative inline-flex h-7 w-7 items-center justify-center'
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
            <span className='text-base leading-none' aria-hidden='true'>
              👤
            </span>
          </span>
          <span className='text-[11px] font-medium'>Perfil</span>
        </NavLink>
      </div>
    </nav>
  )
}
