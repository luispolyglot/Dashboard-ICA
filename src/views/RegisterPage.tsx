import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangleIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { checkRegistrationEmail, normalizeEmail } from '../auth/whitelist'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './components/AuthShell'

type RegisterStep = 'email' | 'password'

export function RegisterPage() {
  const { signUp, hasSupabaseConfig } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<RegisterStep>('email')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailAllowed, setEmailAllowed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleCheckEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setBusy(true)

    try {
      const normalized = normalizeEmail(email)
      const result = await checkRegistrationEmail(normalized)
      setEmailAllowed(result.allowed)
      if (!result.allowed) {
        setError(
          result.reason || 'Tu email no pertenece a la comunidad habilitada.',
        )
        return
      }
      setStep('password')
      setSuccess('Email validado. Ahora crea tu contraseña.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo validar tu email'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (step !== 'password') {
      setError('Primero valida tu email de la comunidad.')
      return
    }
    if (!emailAllowed) {
      setError('Tu email no esta autorizado para registro.')
      return
    }
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
      setSuccess(
        'Cuenta creada. En breve recibirás un correo con un enlace para confirmar tu email. Revísalo (y la carpeta de spam) antes de iniciar sesión.',
      )
      window.setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo crear la cuenta'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title='Crea tu cuenta'
      subtitle='Unete a Icademy y empieza a construir tu racha.'
    >
      {!hasSupabaseConfig && (
        <div className='mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          <AlertTriangleIcon className='size-4' />
          Faltan variables de entorno de Supabase.
        </div>
      )}

      {step === 'email' && (
        <form className='space-y-4' onSubmit={handleCheckEmail}>
          <div className='space-y-1.5'>
            <Label htmlFor='register-email'>
              Ingresa el mail que usas en la comunidad Icademy de Skool
            </Label>
            <Input
              id='register-email'
              type='email'
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {error && <p className='text-sm text-destructive'>{error}</p>}
          {success && <p className='text-sm text-emerald-500'>{success}</p>}

          <Button
            type='submit'
            disabled={busy || !hasSupabaseConfig}
            className='w-full'
          >
            {busy ? 'Validando...' : 'Validar email'}
          </Button>
        </form>
      )}

      {step === 'password' && (
        <form className='space-y-4' onSubmit={handleSubmit}>
          <Input value={normalizeEmail(email)} disabled />

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
            <Label htmlFor='register-password-confirm'>
              Confirmar contraseña
            </Label>
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

          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              className='flex-1'
              onClick={() => {
                setStep('email')
                setNickname('')
                setPassword('')
                setConfirmPassword('')
                setError(null)
                setSuccess(null)
              }}
            >
              Cambiar email
            </Button>
            <Button
              type='submit'
              disabled={busy || !hasSupabaseConfig}
              className='flex-1'
            >
              {busy ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </div>
        </form>
      )}

      <p className='mt-4 text-sm text-muted-foreground'>
        Ya tienes cuenta?{' '}
        <Link to='/login' className='font-semibold text-primary'>
          Iniciar sesión
        </Link>
      </p>
    </AuthShell>
  )
}
