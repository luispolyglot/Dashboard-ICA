import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { AuthField, AuthNotice, AuthShell } from './components/AuthShell'
import { t } from '@/i18n'

export function ForgotPasswordPage() {
  const { requestPasswordReset, hasSupabaseConfig } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSuccess(null)
    setBusy(true)

    try {
      await requestPasswordReset(email)
    } catch {
    } finally {
      setBusy(false)
      setSuccess(t('Si existe una cuenta para ese email, te enviaremos un enlace para cambiar tu contraseña.'))
    }
  }

  return (
    <AuthShell
      title={t('Recuperar contraseña')}
      subtitle={t('Te enviamos un enlace para crear una nueva.')}
      footer={
        <Link to='/login' className='text-sm font-extrabold text-[var(--ica-i)]'>
          {t('Volver a entrar')}
        </Link>
      }
    >
      <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
        {!hasSupabaseConfig && <AuthNotice tone='warning'>{t('Faltan variables de entorno de Supabase.')}</AuthNotice>}

        <AuthField
          id='forgot-email'
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

        {success && <AuthNotice tone='success'>{success}</AuthNotice>}

        <Button type='submit' size='xl' disabled={busy || !hasSupabaseConfig} className='mt-1 w-full'>
          {busy ? t('Enviando...') : t('Enviar enlace')}
        </Button>
      </form>
    </AuthShell>
  )
}
