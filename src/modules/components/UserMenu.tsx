import { useState } from 'react'
import {
  LanguagesIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
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
import type { AppConfig } from '../types'

type UserMenuProps = {
  onLogout: () => Promise<void>
  config: AppConfig | null
  onEditLanguages: () => void
}

export function UserMenu({ onLogout, config, onEditLanguages }: UserMenuProps) {
  const { user } = useAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return

    try {
      setIsLoggingOut(true)
      await onLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='inline-flex'>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                aria-label='Abrir menu de usuario'
              >
                <UserIcon />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>Menu de usuario</TooltipContent>
      </Tooltip>

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
          Tema ({resolvedTheme})
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) =>
            setTheme(value as 'light' | 'dark' | 'system')
          }
        >
          <DropdownMenuRadioItem value='light'>
            <SunIcon />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='dark'>
            <MoonIcon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='system'>
            <MonitorIcon />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void handleLogout()
          }}
          disabled={isLoggingOut}
          className='text-destructive focus:text-destructive'
        >
          <LogOutIcon />
          {isLoggingOut ? 'Cerrando sesion...' : 'Cerrar sesion'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
