import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { checkRegistrationEmail, normalizeEmail } from '../auth/whitelist'

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
    <main className='flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100'>
      <section className='w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl'>
        <h1 className='font-serif text-3xl font-bold'>Crea tu cuenta</h1>
        <p className='mt-2 text-sm text-slate-400'>
          Unete a Icademy y empieza a construir tu racha.
        </p>

        {!hasSupabaseConfig && (
          <div className='mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300'>
            Faltan variables de entorno de Supabase.
          </div>
        )}

        {step === 'email' && (
          <form className='mt-6 space-y-4' onSubmit={handleCheckEmail}>
            <label className='block text-sm'>
              <span className='mb-1 block text-slate-300'>
                Ingresa el mail que usas en la comunidad Icademy de Skool
              </span>
              <input
                type='email'
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className='w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none'
              />
            </label>

            {error && <p className='text-sm text-red-400'>{error}</p>}
            {success && <p className='text-sm text-emerald-400'>{success}</p>}

            <button
              type='submit'
              disabled={busy || !hasSupabaseConfig}
              className='w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
            >
              {busy ? 'Validando...' : 'Validar email'}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form className='mt-6 space-y-4' onSubmit={handleSubmit}>
            <div className='rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300 opacity-60'>
              {normalizeEmail(email)}
            </div>

            <label className='block text-sm'>
              <span className='mb-1 block text-slate-300'>Nombre</span>
              <input
                type='text'
                required
                maxLength={40}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder='Ej: Tu nombre o un apodo'
                className='w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none'
              />
            </label>

            <label className='block text-sm'>
              <span className='mb-1 block text-slate-300'>Contraseña</span>
              <input
                type='password'
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className='w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none'
              />
            </label>

            <label className='block text-sm'>
              <span className='mb-1 block text-slate-300'>Confirmar contraseña</span>
              <input
                type='password'
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className='w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none'
              />
            </label>

            {error && <p className='text-sm text-red-400'>{error}</p>}
            {success && <p className='text-sm text-emerald-400'>{success}</p>}

            <div className='flex gap-2'>
              <button
                type='button'
                onClick={() => {
                  setStep('email')
                  setNickname('')
                  setPassword('')
                  setConfirmPassword('')
                  setError(null)
                  setSuccess(null)
                }}
                className='flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300'
              >
                Cambiar email
              </button>
              <button
                type='submit'
                disabled={busy || !hasSupabaseConfig}
                className='flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
              >
                {busy ? 'Creando...' : 'Crear cuenta'}
              </button>
            </div>
          </form>
        )}

        <p className='mt-4 text-sm text-slate-400'>
          Ya tienes cuenta?{' '}
          <Link to='/login' className='font-semibold text-blue-400'>
            Iniciá sesión
          </Link>
        </p>
      </section>
    </main>
  )
}
