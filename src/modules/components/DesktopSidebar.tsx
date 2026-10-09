import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3Icon,
  FlameIcon,
  Gamepad2Icon,
  HouseIcon,
  TrophyIcon,
  UserIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { PendingReviewDot } from './PendingReviewDot'
import { ChallengeAlertBadge } from './IcaChallenges/ChallengeAlertBadge'
import { describeIcaChallengeAlerts, useIcaChallengeAlerts } from '../hooks/useIcaChallengeAlerts'
import { t } from '@/i18n'

type DesktopNavProps = {
  shouldHighlightProfileButton: boolean
  shouldHighlightCoachingProfileButton?: boolean
}

type Item = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  alert?: ReactNode
  badge?: ReactNode
  /** Marker for the welcome tour. */
  tour?: string
}

/**
 * Menú del ordenador: una barra de pestañas arriba (en la cabecera), no una columna a la izquierda.
 * La pestaña activa va rellena. En pantallas medianas solo se ven los iconos.
 */
export function DesktopNav({
  shouldHighlightProfileButton,
  shouldHighlightCoachingProfileButton = false,
}: DesktopNavProps) {
  const location = useLocation()
  const challengeAlerts = useIcaChallengeAlerts()
  const isOnProfileRoute = location.pathname === DASHBOARD_ROUTES.profile
  const profileAlert =
    (shouldHighlightProfileButton || shouldHighlightCoachingProfileButton) && !isOnProfileRoute ? (
      <PendingReviewDot
        title={
          shouldHighlightCoachingProfileButton
            ? t('Tienes notas maestras pendientes de revisión en coaching.')
            : t('Tienes un test ICA disponible este mes.')
        }
        useIconSpeaker={shouldHighlightCoachingProfileButton}
      />
    ) : null

  const items: Item[] = [
    { to: DASHBOARD_ROUTES.home, label: t('Inicio'), icon: HouseIcon, end: true },
    { to: DASHBOARD_ROUTES.leaderboard, label: t('Ranking'), icon: TrophyIcon, tour: 'nav-ranking' },
    {
      to: DASHBOARD_ROUTES.gamesIca,
      label: t('Juegos'),
      icon: Gamepad2Icon,
      tour: 'nav-games',
      badge: (
        <ChallengeAlertBadge
          count={challengeAlerts.total}
          title={t('Desafíos ICA: {detail}', { detail: describeIcaChallengeAlerts(challengeAlerts) })}
        />
      ),
    },
    { to: DASHBOARD_ROUTES.streaks, label: t('Rachas'), icon: FlameIcon },
    { to: DASHBOARD_ROUTES.myAnalytics, label: t('Estadísticas'), icon: BarChart3Icon },
    { to: DASHBOARD_ROUTES.profile, label: t('Perfil'), icon: UserIcon, alert: profileAlert },
  ]

  return (
    <nav
      aria-label={t('Navegación principal')}
      className='hidden items-center gap-1 rounded-[20px] border-2 border-border bg-muted/60 p-1 md:flex dark:bg-card/60'
    >
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} aria-label={item.label} data-tour={item.tour}>
          {({ isActive }) => (
            <span
              className={cn(
                'relative flex h-10 items-center gap-2 rounded-2xl px-3 text-[15px] font-extrabold transition-colors xl:px-4',
                isActive
                  ? 'bg-card text-foreground shadow-[0_2px_0_var(--border-strong)] dark:bg-[color-mix(in_oklab,var(--foreground)_12%,transparent)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className='relative inline-flex shrink-0'>
                <item.icon
                  className='size-5'
                  strokeWidth={isActive ? 2.6 : 2.2}
                  style={isActive ? { color: 'var(--primary)' } : undefined}
                  aria-hidden='true'
                />
                {item.badge}
              </span>
              <span className='hidden xl:inline'>{item.label}</span>
              {item.alert ? <span className='absolute -top-1 -right-1'>{item.alert}</span> : null}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
