import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Gamepad2Icon, HouseIcon, PlusIcon, TrophyIcon, UserIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PendingReviewDot } from './PendingReviewDot'
import { ChallengeAlertBadge } from './IcaChallenges/ChallengeAlertBadge'
import { describeIcaChallengeAlerts, useIcaChallengeAlerts } from '../hooks/useIcaChallengeAlerts'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { t, tn } from '@/i18n'
import { useChatUnread } from '../game/ChatQuickButton'

/** Pestaña de la barra de abajo: icono de línea y texto; la activa va en una píldora. */
function TabItem({
  icon: Icon,
  label,
  active,
  alert,
  badge,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  alert?: ReactNode
  /** Globito ya posicionado (p. ej. retos pendientes). */
  badge?: ReactNode
}) {
  return (
    <span
      className={cn(
        'flex min-h-[52px] flex-col items-center justify-center gap-[3px] text-[11px] font-extrabold',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex h-8 w-[46px] items-center justify-center rounded-xl border-2',
          active ? 'border-primary/40 bg-primary/12' : 'border-transparent',
        )}
      >
        <Icon className='size-6' strokeWidth={2.2} aria-hidden='true' />
        {alert ? <span className='pointer-events-none absolute -top-1.5 -right-1.5'>{alert}</span> : null}
        {badge}
      </span>
      {label}
    </span>
  )
}

type MobileBottomNavProps = {
  shouldHighlightProfileButton: boolean
  shouldHighlightCoachingProfileButton?: boolean
}

export function MobileBottomNav({
  shouldHighlightProfileButton,
  shouldHighlightCoachingProfileButton = false,
}: MobileBottomNavProps) {
  const location = useLocation()
  // Retos nuevos o turnos pendientes en Desafíos ICA: globito encima del mando.
  const challengeAlerts = useIcaChallengeAlerts()
  // Mensajes nuevos en el chat de icademers: puntito en Perfil (el chat se abre desde ahí).
  const chatUnread = useChatUnread()
  const isOnProfileRoute = location.pathname.startsWith(DASHBOARD_ROUTES.profile)
  const isOnIcaTestsRoute = location.pathname.startsWith(DASHBOARD_ROUTES.testsIca)
  const isOnManageCoachingRoute = location.pathname.startsWith(
    DASHBOARD_ROUTES.manageCoaching,
  )
  const hasIcaProfileAlert = shouldHighlightProfileButton && !isOnIcaTestsRoute
  const hasCoachingProfileAlert =
    shouldHighlightCoachingProfileButton && !isOnManageCoachingRoute
  const shouldPulseProfileButton =
    (hasIcaProfileAlert || hasCoachingProfileAlert) &&
    !isOnProfileRoute
  const isProfileActive = isOnProfileRoute
  const profileAlertTitle = hasCoachingProfileAlert
    ? hasIcaProfileAlert
      ? t('Tienes novedades: test ICA y coaching pendiente de revisión.')
      : t('Tienes notas maestras pendientes de revisión en coaching.')
    : t('Tienes un test ICA disponible este mes.')

  return (
    <>
      <nav
        aria-label={t('Navegación principal')}
        className='fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-card pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden dark:bg-background'
      >
        <div className='mx-auto grid h-[74px] max-w-md grid-cols-5 items-center px-1.5'>
          <NavLink to={DASHBOARD_ROUTES.home} end className='outline-none'>
            {({ isActive }) => <TabItem icon={HouseIcon} label={t('Inicio')} active={isActive} />}
          </NavLink>

          <NavLink to={DASHBOARD_ROUTES.leaderboard} className='outline-none'>
            {({ isActive }) => <TabItem icon={TrophyIcon} label={t('Ranking')} active={isActive} />}
          </NavLink>

          <div className='flex justify-center'>
            <NavLink
              to={DASHBOARD_ROUTES.newIcaWords}
              aria-label={t('Añadir palabras ICA')}
              className='-mt-7 flex size-[58px] items-center justify-center rounded-[20px] bg-primary text-primary-foreground transition-transform active:translate-y-1'
              style={{ boxShadow: '0 5px 0 color-mix(in oklab, var(--primary) 70%, black)' }}
            >
              <PlusIcon className='size-8' strokeWidth={3} aria-hidden='true' />
            </NavLink>
          </div>

          <NavLink to={DASHBOARD_ROUTES.gamesIca} className='outline-none'>
            {({ isActive }) => (
              <TabItem
                icon={Gamepad2Icon}
                label={t('Juegos')}
                active={isActive}
                badge={
                  <ChallengeAlertBadge
                    count={challengeAlerts.total}
                    title={t('Desafíos ICA: {detail}', { detail: describeIcaChallengeAlerts(challengeAlerts) })}
                  />
                }
              />
            )}
          </NavLink>

          <NavLink to={DASHBOARD_ROUTES.profile} className='outline-none'>
            <TabItem
              icon={UserIcon}
              label={t('Perfil')}
              active={isProfileActive}
              alert={
                shouldPulseProfileButton ? (
                  <PendingReviewDot
                    title={profileAlertTitle}
                    useIconSpeaker={hasCoachingProfileAlert}
                  />
                ) : chatUnread > 0 && !isOnProfileRoute ? (
                  <span
                    className='flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card px-1 text-[10px] font-black text-white tabular-nums'
                    style={{ background: 'var(--ica-bad-strong)' }}
                    aria-label={tn(chatUnread, t('{n} mensaje nuevo en el chat'), t('{n} mensajes nuevos en el chat'))}
                  >
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                ) : null
              }
            />
          </NavLink>
        </div>
      </nav>
    </>
  )
}
