import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className='flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100'>
      <section className='w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl'>
        <h1 className='font-serif text-3xl font-bold'>{title}</h1>
        <p className='mt-2 text-sm text-slate-400'>{subtitle}</p>
        <div className='mt-6'>{children}</div>
      </section>
    </main>
  )
}

export function LoginPage() {
  const { signIn, hasSupabaseConfig } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/app'

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
        <div className='mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300'>
          Faltan variables de entorno de Supabase.
        </div>
      )}

      <form className='space-y-4' onSubmit={handleSubmit}>
        <label className='block text-sm'>
          <span className='mb-1 block text-slate-300'>Email</span>
          <input
            type='email'
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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

        {error && <p className='text-sm text-red-400'>{error}</p>}

        <button
          type='submit'
          disabled={busy || !hasSupabaseConfig}
          className='w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
        >
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className='mt-4 text-sm text-slate-400'>
        No tienes cuenta?{' '}
        <Link to='/register' className='font-semibold text-blue-400'>
          Regístrate
        </Link>
      </p>
    </AuthShell>
  )
}
