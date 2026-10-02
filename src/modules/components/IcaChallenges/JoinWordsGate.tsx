/**
 * Desafíos ICA · mínimo de palabras para entrar.
 * Hace falta tener 20 palabras en el Baúl ICA de ese idioma para retar, aceptar retos
 * y salir en la lista de los demás. Aquí se enseña cuánto falta y se lleva a Inmersión.
 */
import { LockIcon, SparklesIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DASHBOARD_ROUTES } from '../../routes/paths'

export function JoinWordsGate({
  wordCount,
  minWords,
  targetLang,
}: {
  wordCount: number
  minWords: number
  targetLang: string
}) {
  const safeCount = Math.max(0, Math.min(wordCount, minWords))
  const missing = Math.max(0, minWords - wordCount)
  const percent = minWords > 0 ? Math.round((safeCount / minWords) * 100) : 100

  return (
    <div className='mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4'>
      <div className='flex items-start gap-3'>
        <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary'>
          <LockIcon className='h-5 w-5' />
        </span>
        <div className='min-w-0'>
          <p className='font-serif text-lg font-semibold leading-tight'>Desbloquea los Desafíos ICA</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            Añade {missing} palabra{missing === 1 ? '' : 's'} más a tu Baúl ICA de {targetLang} para poder retar y
            que te reten.
          </p>
        </div>
      </div>

      <div className='mt-4'>
        <div className='mb-1.5 flex items-baseline justify-between gap-2 text-xs'>
          <span className='font-medium'>
            {safeCount} de {minWords} palabras
          </span>
          <span className='text-muted-foreground'>{percent}%</span>
        </div>
        <div
          className='h-2.5 overflow-hidden rounded-full bg-muted'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={minWords}
          aria-valuenow={safeCount}
          aria-label='Palabras en tu Baúl ICA'
        >
          <div
            className='h-full rounded-full bg-primary transition-[width] duration-500'
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <Button asChild className='mt-4 w-full'>
        <Link to={DASHBOARD_ROUTES.newIcaWords}>
          <SparklesIcon className='mr-2 h-4 w-4' />
          Añadir palabras en Inmersión
        </Link>
      </Button>
    </div>
  )
}
