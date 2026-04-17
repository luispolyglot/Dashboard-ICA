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
        <div className='flex flex-row gap-2 justify-center items-center'>
          <LogoIcademy width={48} height={48} />
          <AppBreadcrumbs />
        </div>

        <div className='flex items-center gap-2'>
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
