import { AppBreadcrumbs } from './AppBreadcrumbs'
import { LeaderboardMenu } from './LeaderboardMenu'
import { UserMenu } from './UserMenu'
import type { AppConfig } from '../types'
import { LogoIcademy } from './LogoIcademy'

type HeaderProps = {
  onLogout: () => Promise<void>
  config: AppConfig | null
  onEditLanguages: () => void
}

export function Header({ onLogout, config, onEditLanguages }: HeaderProps) {
  return (
    <header className='border-b bg-background'>
      <div className='container mx-auto flex h-16 items-center justify-between px-4'>
        <div className='min-w-0 flex-1'>
          <div className='hidden flex-row items-center gap-2 md:flex'>
            <LogoIcademy width={48} height={48} />
            <AppBreadcrumbs />
          </div>
          <div className='md:hidden'>
            <AppBreadcrumbs />
          </div>
        </div>

        <div className='hidden items-center gap-2 md:flex'>
          <LeaderboardMenu />
          <UserMenu
            onLogout={onLogout}
            config={config}
            onEditLanguages={onEditLanguages}
          />
        </div>
      </div>
    </header>
  )
}
