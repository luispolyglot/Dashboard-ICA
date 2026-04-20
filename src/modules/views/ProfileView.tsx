import { useMemo, useState } from 'react'
import { LanguagesIcon, LogOutIcon, MoonIcon, SunIcon, TrophyIcon, UserIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTheme } from '@/theme/ThemeContext'
import { useMonthlyLeaderboard } from '../hooks/useMonthlyLeaderboard'
import type { AppConfig } from '../types'

type ProfileViewProps = {
  config: AppConfig | null
  onEditLanguages: () => void
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

function formatDate(value?: string): string {
  if (!value) return 'No disponible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

export function ProfileView({ config, onEditLanguages }: ProfileViewProps) {
  const { user, signOut } = useAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { rows, loading, error } = useMonthlyLeaderboard()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const metadata = useMemo(() => user?.user_metadata ?? {}, [user?.user_metadata])
  const displayName = metadata.display_name || user?.email?.split('@')[0] || 'Usuario'

  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await signOut()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold'>
        👤 Perfil
      </h2>
      <p className='mb-6 text-sm text-muted-foreground'>
        Gestiona tu cuenta, idioma y apariencia desde un solo lugar.
      </p>

      <div className='grid gap-4'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserIcon className='h-4 w-4' />
              Información de usuario
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <p><span className='text-muted-foreground'>Nombre:</span> {displayName}</p>
            <p><span className='text-muted-foreground'>Email:</span> {user?.email || 'No disponible'}</p>
            <p><span className='text-muted-foreground'>Creado:</span> {formatDate(user?.created_at)}</p>
            <p><span className='text-muted-foreground'>Último acceso:</span> {formatDate(user?.last_sign_in_at)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <LanguagesIcon className='h-4 w-4' />
              Configurar idioma de estudio
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              {config
                ? `${config.nativeLang} -> ${config.targetLang} (${config.level || 'A2'})`
                : 'No hay configuración de idiomas'}
            </p>
            <Button type='button' variant='outline' onClick={onEditLanguages}>
              <LanguagesIcon />
              Cambiar idiomas
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tema ({resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'})</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant={theme === 'light' ? 'default' : 'outline'}
              onClick={() => setTheme('light')}
            >
              <SunIcon />
              Claro
            </Button>
            <Button
              type='button'
              variant={theme === 'dark' ? 'default' : 'outline'}
              onClick={() => setTheme('dark')}
            >
              <MoonIcon />
              Oscuro
            </Button>
          </CardContent>
        </Card>

        <Card className='md:hidden'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <TrophyIcon className='h-4 w-4' />
              Leaderboard mensual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && <p className='text-sm text-muted-foreground'>Cargando...</p>}
            {!loading && error && <p className='text-sm text-destructive'>{error}</p>}
            {!loading && !error && rows.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                Todavía no hay datos suficientes este mes.
              </p>
            )}
            {!loading && !error && rows.length > 0 && (
              <div className='space-y-1'>
                {rows.map((row) => (
                  <div
                    key={`${row.user_id}-${row.rank}`}
                    className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${
                      row.user_id === user?.id
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : ''
                    }`}
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      <span className='w-10 shrink-0 text-xs text-muted-foreground'>
                        {rankBadge(row.rank)}
                      </span>
                      <span className='truncate text-sm'>
                        {row.display_name || row.username || 'Usuario'}
                      </span>
                    </div>
                    <span className='text-sm font-medium'>
                      {Math.round(row.avg_percent || 0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <Button
            type='button'
            variant='destructive'
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            <LogOutIcon />
            {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </Button>
        </div>
      </div>
    </section>
  )
}
