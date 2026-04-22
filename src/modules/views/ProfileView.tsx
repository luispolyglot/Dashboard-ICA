import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { LanguagesIcon, LogOutIcon, MoonIcon, SunIcon, UserIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTheme } from '@/theme/ThemeContext'
import type { AppConfig } from '../types'

type ProfileViewProps = {
  config: AppConfig | null
  onEditLanguages: () => void
}

function formatDate(value?: string): string {
  if (!value) return 'No disponible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

export function ProfileView({ config, onEditLanguages }: ProfileViewProps) {
  const { user, signOut, changePassword } = useAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmNextPassword, setConfirmNextPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

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

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (nextPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (nextPassword !== confirmNextPassword) {
      setPasswordError('Las nuevas contraseñas no coinciden.')
      return
    }

    setIsChangingPassword(true)
    try {
      await changePassword(currentPassword, nextPassword)
      setCurrentPassword('')
      setNextPassword('')
      setConfirmNextPassword('')
      setPasswordSuccess('Contraseña actualizada correctamente.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la contraseña'
      setPasswordError(message)
    } finally {
      setIsChangingPassword(false)
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

        <Card>
          <CardHeader>
            <CardTitle>Seguridad</CardTitle>
          </CardHeader>
          <CardContent>
            <form className='space-y-3' onSubmit={handlePasswordChange}>
              <div className='space-y-1.5'>
                <Label htmlFor='profile-current-password'>Contraseña actual</Label>
                <Input
                  id='profile-current-password'
                  type='password'
                  required
                  minLength={6}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='profile-next-password'>Nueva contraseña</Label>
                <Input
                  id='profile-next-password'
                  type='password'
                  required
                  minLength={6}
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='profile-next-password-confirm'>Confirmar nueva contraseña</Label>
                <Input
                  id='profile-next-password-confirm'
                  type='password'
                  required
                  minLength={6}
                  value={confirmNextPassword}
                  onChange={(event) => setConfirmNextPassword(event.target.value)}
                />
              </div>

              {passwordError && <p className='text-sm text-destructive'>{passwordError}</p>}
              {passwordSuccess && <p className='text-sm text-emerald-500'>{passwordSuccess}</p>}

              <Button type='submit' disabled={isChangingPassword}>
                {isChangingPassword ? 'Actualizando...' : 'Cambiar contraseña'}
              </Button>
            </form>
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
