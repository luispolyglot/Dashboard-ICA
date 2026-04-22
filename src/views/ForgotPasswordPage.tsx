import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangleIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from './components/AuthShell'

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
      setSuccess('Si existe una cuenta para ese email, te enviaremos un enlace para cambiar tu contraseña.')
    }
  }

  return (
    <AuthShell title='Recuperar contraseña' subtitle='Te enviamos un enlace para restablecer tu acceso.'>
      {!hasSupabaseConfig && (
        <div className='mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          <AlertTriangleIcon className='size-4' />
          Faltan variables de entorno de Supabase.
        </div>
      )}

      <form className='space-y-4' onSubmit={handleSubmit}>
        <div className='space-y-1.5'>
          <Label htmlFor='forgot-email'>Email</Label>
          <Input
            id='forgot-email'
            type='email'
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {success && <p className='text-sm text-emerald-500'>{success}</p>}

        <Button type='submit' disabled={busy || !hasSupabaseConfig} className='w-full'>
          {busy ? 'Enviando...' : 'Enviar enlace'}
        </Button>
      </form>

      <p className='mt-4 text-sm text-muted-foreground'>
        Recordaste tu clave?{' '}
        <Link to='/login' className='font-semibold text-primary'>
          Volver al login
        </Link>
      </p>
    </AuthShell>
  )
}
