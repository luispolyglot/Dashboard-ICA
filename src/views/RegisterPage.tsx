import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangleIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { normalizeEmail } from '../auth/whitelist'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './components/AuthShell'

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
      setError('Las contraseñas no coinciden')
      return
    }
    if (!nickname.trim()) {
      setError('Ingresa un nickname para tu perfil')
      return
    }

    setBusy(true)
    try {
      await signUp(normalizeEmail(email), password, nickname)
    } catch {
    } finally {
      setBusy(false)
      setSuccess(
        'Si eres miembro de la comunidad Icademy en Skool, recibirás un email para confirmar tu acceso. Revisa también la carpeta de spam.',
      )
      window.setTimeout(() => navigate('/login', { replace: true }), 7000)
    }
  }

  return (
    <AuthShell
      title='Crea tu cuenta'
      subtitle='Únete a Icademy y empieza a construir tu racha.'
    >
      {!hasSupabaseConfig && (
        <div className='mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          <AlertTriangleIcon className='size-4' />
          Faltan variables de entorno de Supabase.
        </div>
      )}

      <form className='space-y-4' onSubmit={handleSubmit}>
        <div className='space-y-1.5'>
          <Label htmlFor='register-email'>Email de tu comunidad Icademy</Label>
          <Input
            id='register-email'
            type='email'
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='register-nickname'>Nombre</Label>
          <Input
            id='register-nickname'
            type='text'
            required
            maxLength={40}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder='Ej: Tu nombre o un apodo'
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='register-password'>Contraseña</Label>
          <Input
            id='register-password'
            type='password'
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='register-password-confirm'>Confirmar contraseña</Label>
          <Input
            id='register-password-confirm'
            type='password'
            required
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        {error && <p className='text-sm text-destructive'>{error}</p>}
        {success && <p className='text-sm text-emerald-500'>{success}</p>}

        <Button
          type='submit'
          disabled={busy || !hasSupabaseConfig}
          className='w-full'
        >
          {busy ? 'Enviando...' : 'Crear cuenta'}
        </Button>
      </form>

      <p className='mt-4 text-sm text-muted-foreground'>
        Ya tienes cuenta?{' '}
        <Link to='/login' className='font-semibold text-primary'>
          Iniciar sesión
        </Link>
      </p>
    </AuthShell>
  )
}
