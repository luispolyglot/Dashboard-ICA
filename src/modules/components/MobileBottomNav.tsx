import {
  BookOpenIcon,
  CalendarDaysIcon,
  HomeIcon,
  PlusIcon,
  UserIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useMonthlyLeaderboard } from '../hooks/useMonthlyLeaderboard'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { AppConfig, CalendarTab } from '../types'
import { UserMenu } from './UserMenu'

type MobileBottomNavProps = {
  onOpenCalendar: (tab: CalendarTab) => void
  onLogout: () => Promise<void>
  config: AppConfig | null
  onEditLanguages: () => void
}

export function MobileBottomNav({
  onOpenCalendar,
  onLogout,
  config,
  onEditLanguages,
}: MobileBottomNavProps) {
  const leaderboard = useMonthlyLeaderboard()

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 ${
      isActive ? 'text-primary' : 'text-muted-foreground'
    }`

  return (
    <nav className='fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur md:hidden'>
      <div className='mx-auto grid max-w-md grid-cols-5 items-end px-3 pt-2'>
        <NavLink to={DASHBOARD_ROUTES.home} className={linkClassName}>
          <HomeIcon className='h-5 w-5' aria-hidden='true' />
          <span className='text-[11px] font-medium'>Inicio</span>
        </NavLink>

        <button
          type='button'
          onClick={() => onOpenCalendar('review')}
          className='flex flex-col items-center gap-1 text-muted-foreground'
        >
          <CalendarDaysIcon className='h-5 w-5' aria-hidden='true' />
          <span className='text-[11px] font-medium'>Rachas</span>
        </button>

        <NavLink
          to={DASHBOARD_ROUTES.newIcaWords}
          aria-label='Añadir palabras ICA'
          className='mx-auto -mt-7 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-[0_12px_28px_-10px_var(--color-primary)]'
        >
          <PlusIcon className='h-7 w-7' aria-hidden='true' />
        </NavLink>

        <NavLink to={DASHBOARD_ROUTES.flashcards} className={linkClassName}>
          <BookOpenIcon className='h-5 w-5' aria-hidden='true' />
          <span className='text-[11px] font-medium'>Flashcards</span>
        </NavLink>

        <div className='flex flex-col items-center gap-1 text-muted-foreground'>
          <UserMenu
            onLogout={onLogout}
            config={config}
            onEditLanguages={onEditLanguages}
            showTooltip={false}
            customTrigger={
              <button
                type='button'
                aria-label='Abrir menu de perfil'
                className='inline-flex h-5 w-5 items-center justify-center text-current'
              >
                <UserIcon className='h-5 w-5' aria-hidden='true' />
              </button>
            }
            includeMobileLeaderboard
            mobileLeaderboard={leaderboard}
          />
          <span className='text-[11px] font-medium'>Perfil</span>
        </div>
      </div>
    </nav>
  )
}
