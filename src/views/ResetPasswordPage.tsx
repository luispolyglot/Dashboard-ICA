import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckIcon, LockIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { AuthField, AuthNotice, AuthShell } from './components/AuthShell'
import { t } from '@/i18n'

export function ResetPasswordPage() {
  const { updatePassword, signOut, session, loading, isPasswordRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const canSubmit = Boolean(session && isPasswordRecovery)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!session) {
      setError(t('El enlace es inválido o expiró. Solicita uno nuevo desde recuperar contraseña.'))
      return
    }
    if (!isPasswordRecovery) {
      setError(t('Esta pantalla solo funciona desde un enlace de recuperación válido.'))
      return
    }
    if (password.length < 6) {
      setError(t('La contraseña debe tener al menos 6 caracteres.'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('Las contraseñas no coinciden.'))
      return
    }

    setBusy(true)
    try {
      await updatePassword(password)
      await signOut()
      // A clear end screen with its own button, instead of a message that vanishes (Luis, 9 Oct).
      setDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('No se pudo actualizar la contraseña')
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthShell title={t('Contraseña cambiada')} subtitle={t('Ya puedes entrar con tu nueva contraseña.')}>
        <div className='flex flex-col items-center gap-4 text-center'>
          <span
            className='ica-pop flex size-16 items-center justify-center rounded-full text-white'
            style={{ background: 'var(--ica-ok)', boxShadow: '0 4px 0 var(--ica-ok-edge)' }}
            aria-hidden='true'
          >
            <CheckIcon className='size-8' strokeWidth={3} />
          </span>
          <p className='m-0 text-base font-extrabold'>{t('Tu contraseña se ha cambiado.')}</p>
          <p className='m-0 text-sm font-semibold text-muted-foreground'>
            {t('Entra de nuevo con tu correo y tu nueva contraseña.')}
          </p>
          <Button type='button' size='xl' className='mt-1 w-full' onClick={() => navigate('/login', { replace: true })}>
            {t('Entrar')}
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('Nueva contraseña')}
      subtitle={t('Elige una contraseña nueva para tu cuenta.')}
      footer={
        <Link to='/forgot-password' className='text-sm font-extrabold text-[var(--ica-i)]'>
          {t('Solicitar un nuevo enlace')}
        </Link>
      }
    >
      <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
        {!loading && !canSubmit && (
          <AuthNotice tone='warning'>{t('No detectamos una sesión de recuperación válida. Pide un nuevo enlace.')}</AuthNotice>
        )}

        <AuthField
          id='reset-password'
          label={t('Nueva contraseña')}
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
          id='reset-password-confirm'
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

        <Button type='submit' size='xl' disabled={busy || loading || !canSubmit} className='mt-1 w-full'>
          {busy ? t('Guardando...') : t('Actualizar contraseña')}
        </Button>
      </form>
    </AuthShell>
  )
}
