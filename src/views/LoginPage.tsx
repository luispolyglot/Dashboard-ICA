import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LockIcon, MailIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { AuthField, AuthNotice, AuthShell } from './components/AuthShell'
import { t } from '@/i18n'

export function LoginPage() {
  const { signIn, hasSupabaseConfig } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromLocation =
    (location.state as { from?: { pathname?: string; search?: string } } | null)?.from ||
    null
  const redirectTo = fromLocation
    ? `${fromLocation.pathname || '/'}${fromLocation.search || ''}`
    : '/'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('No se pudo iniciar sesión')
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('¡Hola de nuevo!')}
      subtitle={t('Entra para seguir con tu racha y tus palabras ICA.')}
      showMethod
      footer={
        <div className='flex flex-col items-center gap-2'>
          <p className='m-0 text-sm font-bold text-muted-foreground'>{t('¿Es tu primera vez en ICADEMY?')}</p>
          <Button asChild variant='outline' size='lg' className='w-full rounded-2xl'>
            <Link to='/register'>{t('Crear mi cuenta')}</Link>
          </Button>
        </div>
      }
    >
      <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
        {!hasSupabaseConfig && <AuthNotice tone='warning'>{t('Faltan variables de entorno de Supabase.')}</AuthNotice>}

        <AuthField
          id='login-email'
          label={t('Email')}
          icon={MailIcon}
          type='email'
          autoComplete='email'
          inputMode='email'
          placeholder={t('tu@email.com')}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <AuthField
          id='login-password'
          label={t('Contraseña')}
          icon={LockIcon}
          type='password'
          autoComplete='current-password'
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={
            <Link to='/forgot-password' className='text-xs font-extrabold text-[var(--ica-i)]'>
              {t('¿La olvidaste?')}
            </Link>
          }
        />

        {error && <AuthNotice tone='error'>{error}</AuthNotice>}

        <Button type='submit' size='xl' disabled={busy || !hasSupabaseConfig} className='mt-1 w-full'>
          {busy ? t('Entrando...') : t('Entrar')}
        </Button>
      </form>
    </AuthShell>
  )
}
