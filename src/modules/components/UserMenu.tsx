import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  TrophyIcon,
  UserIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme } from '@/theme/ThemeContext'
import type { AppConfig, LeaderboardEntry } from '../types'

type UserMenuProps = {
  onLogout: () => Promise<void>
  config: AppConfig | null
  onEditLanguages: () => void
  showTooltip?: boolean
  customTrigger?: ReactNode
  includeMobileLeaderboard?: boolean
  mobileLeaderboard?: {
    rows: LeaderboardEntry[]
    loading: boolean
    error: string | null
  }
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

export function UserMenu({
  onLogout,
  config,
  onEditLanguages,
  showTooltip = true,
  customTrigger,
  includeMobileLeaderboard = false,
  mobileLeaderboard,
}: UserMenuProps) {
  const { user } = useAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return

    try {
      setIsLoggingOut(true)
      await onLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const trigger = (
    <DropdownMenuTrigger asChild>
      {customTrigger ?? (
        <Button
          variant='outline'
          size='icon'
          aria-label='Abrir menu de usuario'
        >
          <UserIcon />
        </Button>
      )}
    </DropdownMenuTrigger>
  )

  return (
    <>
      <DropdownMenu>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>Menu de usuario</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}

      <DropdownMenuContent
        onCloseAutoFocus={(e) => e.preventDefault()}
        align='end'
        className='w-80'
      >
        <DropdownMenuLabel className='space-y-1'>
          <div className='text-xs font-medium text-muted-foreground'>
            Sesion
          </div>
          <div className='truncate text-sm font-semibold'>
            {user?.email || 'Sin email'}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className='pt-0 text-xs font-normal text-muted-foreground'>
          {config
            ? `${config.nativeLang} -> ${config.targetLang} (${config.level || 'A2'})`
            : 'Configura idiomas'}
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            onEditLanguages()
          }}
        >
          <LanguagesIcon />
          Cambiar idiomas
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className='text-xs font-medium text-muted-foreground'>
          Tema ({resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'})
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as 'light' | 'dark')}
        >
          <DropdownMenuRadioItem value='light'>
            <SunIcon />
            Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='dark'>
            <MoonIcon />
            Oscuro
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {includeMobileLeaderboard && mobileLeaderboard && (
          <>
            <DropdownMenuItem
              onSelect={() => setIsLeaderboardModalOpen(true)}
            >
              <TrophyIcon />
              Leaderboard mensual
            </DropdownMenuItem>

            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void handleLogout()
          }}
          disabled={isLoggingOut}
          className='text-destructive focus:text-destructive'
        >
          <LogOutIcon />
          {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>

      {includeMobileLeaderboard && mobileLeaderboard && (
        <Dialog
          open={isLeaderboardModalOpen}
          onOpenChange={setIsLeaderboardModalOpen}
        >
          <DialogContent className='max-w-md'>
            <DialogHeader>
              <DialogTitle>Leaderboard mensual</DialogTitle>
              <DialogDescription>
                Ranking del mes por porcentaje medio.
              </DialogDescription>
            </DialogHeader>

            {mobileLeaderboard.loading && (
              <p className='text-sm text-muted-foreground'>Cargando...</p>
            )}
            {!mobileLeaderboard.loading && mobileLeaderboard.error && (
              <p className='text-sm text-destructive'>
                {mobileLeaderboard.error}
              </p>
            )}
            {!mobileLeaderboard.loading &&
              !mobileLeaderboard.error &&
              mobileLeaderboard.rows.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  Todavía no hay datos suficientes este mes.
                </p>
              )}

            {!mobileLeaderboard.loading &&
              !mobileLeaderboard.error &&
              mobileLeaderboard.rows.length > 0 && (
                <div className='max-h-[60dvh] space-y-1 overflow-y-auto pr-1'>
                  {mobileLeaderboard.rows.map((row) => (
                    <div
                      key={`${row.user_id}-${row.rank}`}
                      className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${
                        row.user_id === user?.id
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : ''
                      }`}
                    >
                      <div className='flex min-w-0 items-center gap-2'>
                        <span className='w-8 shrink-0 text-[11px] text-muted-foreground'>
                          {rankBadge(row.rank)}
                        </span>
                        <span className='truncate text-xs'>
                          {row.display_name || row.username || 'Usuario'}
                        </span>
                      </div>
                      <span className='text-xs font-semibold'>
                        {Math.round(row.avg_percent || 0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
