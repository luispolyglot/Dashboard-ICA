import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './components/AuthShell'

export function ResetPasswordPage() {
  const { updatePassword, signOut, session, loading, isPasswordRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canSubmit = Boolean(session && isPasswordRecovery)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!session) {
      setError('El enlace es inválido o expiró. Solicita uno nuevo desde recuperar contraseña.')
      return
    }
    if (!isPasswordRecovery) {
      setError('Esta pantalla solo funciona desde un enlace de recuperación válido.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setBusy(true)
    try {
      await updatePassword(password)
      await signOut()
      setSuccess('Contraseña actualizada. Ya puedes iniciar sesión con tu nueva clave.')
      window.setTimeout(() => navigate('/login', { replace: true }), 7000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la contraseña'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title='Nueva contraseña' subtitle='Define una contraseña nueva para tu cuenta.'>
      <form className='space-y-4' onSubmit={handleSubmit}>
        {!loading && !canSubmit && !success && (
          <p className='text-sm text-destructive'>
            No detectamos una sesión de recuperación válida. Pide un nuevo enlace.
          </p>
        )}

        <div className='space-y-1.5'>
          <Label htmlFor='reset-password'>Nueva contraseña</Label>
          <Input
            id='reset-password'
            type='password'
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='reset-password-confirm'>Confirmar contraseña</Label>
          <Input
            id='reset-password-confirm'
            type='password'
            required
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        {error && <p className='text-sm text-destructive'>{error}</p>}
        {success && <p className='text-sm text-emerald-500'>{success}</p>}

        <Button type='submit' disabled={busy || loading || !canSubmit} className='w-full'>
          {busy ? 'Guardando...' : 'Actualizar contraseña'}
        </Button>
      </form>

      <p className='mt-4 text-sm text-muted-foreground'>
        <Link to='/forgot-password' className='font-semibold text-primary'>
          Solicitar un nuevo enlace
        </Link>
      </p>
    </AuthShell>
  )
}
