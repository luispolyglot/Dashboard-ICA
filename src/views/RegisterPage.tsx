import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LockIcon, MailCheckIcon, MailIcon, UserIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { normalizeEmail } from '../auth/whitelist'
import { Button } from '@/components/ui/button'
import { AuthField, AuthNotice, AuthShell } from './components/AuthShell'
import { DISPLAY_NAME_MAX_LENGTH } from '../modules/constants'
import { t } from '@/i18n'

export function RegisterPage() {
  const { signUp, hasSupabaseConfig } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (password !== confirmPassword) {
      setError(t('Las contraseñas no coinciden'))
      return
    }
    if (!nickname.trim()) {
      setError(t('Ingresa un nickname para tu perfil'))
      return
    }

    setBusy(true)
    try {
      await signUp(normalizeEmail(email), password, nickname)
    } catch {
    } finally {
      setBusy(false)
      setSuccess(
        t(
          'Si eres miembro de la comunidad Icademy en Skool, recibirás un email para confirmar tu acceso. Revisa también la carpeta de spam.',
        ),
      )
      window.setTimeout(() => navigate('/login', { replace: true }), 12000)
    }
  }

  return (
    <AuthShell
      title={t('Crea tu cuenta')}
      subtitle={t('Usa el mismo email con el que entraste en la comunidad ICADEMY.')}
      footer={
        <p className='m-0 text-sm font-bold text-muted-foreground'>
          {t('¿Ya tienes cuenta?')}{' '}
          <Link to='/login' className='font-extrabold text-[var(--ica-i)]'>
            {t('Iniciar sesión')}
          </Link>
        </p>
      }
    >
      {success ? (
        <div className='flex flex-col items-center gap-3 py-2 text-center'>
          <span className='ica-pop flex size-16 items-center justify-center rounded-3xl bg-[var(--ica-ok-soft)] text-[var(--ica-ok)]'>
            <MailCheckIcon className='size-8' strokeWidth={2.4} aria-hidden='true' />
          </span>
          <p className='m-0 text-lg font-black'>{t('¡Revisa tu email!')}</p>
          <p className='m-0 text-sm font-semibold text-muted-foreground'>{success}</p>
          <Button asChild size='lg' className='mt-2 w-full rounded-2xl'>
            <Link to='/login' replace>
              {t('Ir a entrar')}
            </Link>
          </Button>
        </div>
      ) : (
        <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
          {!hasSupabaseConfig && <AuthNotice tone='warning'>{t('Faltan variables de entorno de Supabase.')}</AuthNotice>}

          <AuthField
            id='register-email'
            label={t('Email de tu comunidad ICADEMY')}
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
            id='register-nickname'
            label={t('Tu nombre')}
            icon={UserIcon}
            autoComplete='nickname'
            required
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={t('Ej: Tu nombre o un apodo')}
          />

          <AuthField
            id='register-password'
            label={t('Contraseña')}
            icon={LockIcon}
            type='password'
            autoComplete='new-password'
            placeholder={t('Mínimo 6 caracteres')}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <AuthField
            id='register-password-confirm'
            label={t('Repite la contraseña')}
            icon={LockIcon}
            type='password'
            autoComplete='new-password'
            required
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          {error && <AuthNotice tone='error'>{error}</AuthNotice>}

          <Button type='submit' size='xl' disabled={busy || !hasSupabaseConfig} className='mt-1 w-full'>
            {busy ? t('Enviando...') : t('Crear cuenta')}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
