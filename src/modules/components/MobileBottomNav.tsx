import { NavLink } from 'react-router-dom'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { CalendarTab } from '../types'

type MobileBottomNavProps = {
  onOpenCalendar: (tab: CalendarTab) => void
}

export function MobileBottomNav({ onOpenCalendar }: MobileBottomNavProps) {
  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 ${
      isActive ? 'text-primary' : 'text-muted-foreground'
    }`

  return (
    <nav className='fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-1.5 backdrop-blur md:hidden min-h-20'>
      <div className='mx-auto grid max-w-md grid-cols-5 items-end px-3 pt-2'>
        <NavLink to={DASHBOARD_ROUTES.home} className={linkClassName}>
          <span className='text-lg leading-none' aria-hidden='true'>
            🏠
          </span>
          <span className='text-[11px] font-medium'>Inicio</span>
        </NavLink>

        <button
          type='button'
          onClick={() => onOpenCalendar('creation')}
          className='flex flex-col items-center gap-1 text-muted-foreground'
        >
          <span className='text-lg leading-none' aria-hidden='true'>
            📆
          </span>
          <span className='text-[11px] font-medium'>Rachas</span>
        </button>

        <NavLink
          to={DASHBOARD_ROUTES.newIcaWords}
          aria-label='Añadir palabras ICA'
          className='mx-auto -mt-7 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-[0_12px_28px_-10px_var(--color-primary)]'
        >
          <span className='text-3xl leading-none' aria-hidden='true'>
            ➕
          </span>
        </NavLink>

        <NavLink to={DASHBOARD_ROUTES.flashcards} className={linkClassName}>
          <span className='text-lg leading-none' aria-hidden='true'>
            📚
          </span>
          <span className='text-[11px] font-medium'>Flashcards</span>
        </NavLink>

        <NavLink to={DASHBOARD_ROUTES.profile} className={linkClassName}>
          <span className='text-base leading-none' aria-hidden='true'>
            👤
          </span>
          <span className='text-[11px] font-medium'>Perfil</span>
        </NavLink>
      </div>
    </nav>
  )
}
