import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangleIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './components/AuthShell'

export function LoginPage() {
  const { signIn, hasSupabaseConfig } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar sesión'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title='Bienvenido de nuevo' subtitle='Iniciá sesión para continuar tu progreso en Icademy.'>
      {!hasSupabaseConfig && (
        <div className='mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          <AlertTriangleIcon className='size-4' />
          Faltan variables de entorno de Supabase.
        </div>
      )}

      <form className='space-y-4' onSubmit={handleSubmit}>
        <div className='space-y-1.5'>
          <Label htmlFor='login-email'>Email</Label>
          <Input
            id='login-email'
            type='email'
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='login-password'>Contraseña</Label>
          <Input
            id='login-password'
            type='password'
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className='pt-1 text-right'>
            <Link to='/forgot-password' className='text-sm font-medium text-primary'>
              Olvidé mi contraseña
            </Link>
          </div>
        </div>

        {error && <p className='text-sm text-destructive'>{error}</p>}

        <Button type='submit' disabled={busy || !hasSupabaseConfig} className='w-full'>
          {busy ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>

      <p className='mt-4 text-sm text-muted-foreground'>
        No tienes cuenta?{' '}
        <Link to='/register' className='font-semibold text-primary'>
          Regístrate
        </Link>
      </p>
    </AuthShell>
  )
}
