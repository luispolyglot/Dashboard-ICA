/**
 * Cargas suaves para toda la app.
 *
 * En vez de dejar la pantalla vacía con «Cargando…», se enseña un esqueleto
 * con la forma del contenido. Aparece con un pequeño retraso (ver
 * `.loading-reveal` en index.css): si los datos llegan rápido, no se ve nada
 * y no hay parpadeo.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-foreground/[0.08]', className)} aria-hidden='true' />
}

function LoadingFrame({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role='status' aria-busy='true' aria-live='polite' className={cn('loading-reveal', className)}>
      <span className='sr-only'>{label}</span>
      {children}
    </div>
  )
}

function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className='rounded-2xl border bg-card p-5'>
      <Skeleton className='h-5 w-2/5' />
      <div className='mt-4 space-y-2.5'>
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className={cn('h-3.5', index === lines - 1 ? 'w-3/5' : 'w-full')} />
        ))}
      </div>
    </div>
  )
}

/** Tarjetas de esqueleto, para poner donde irá el contenido (sin márgenes de página). */
export function ContentLoading({
  label = 'Cargando…',
  cards = 3,
  className,
}: {
  label?: string
  cards?: number
  className?: string
}) {
  return (
    <LoadingFrame label={label} className={cn('space-y-4', className)}>
      {Array.from({ length: cards }, (_, index) => (
        <CardSkeleton key={index} lines={index === 0 ? 3 : 2} />
      ))}
    </LoadingFrame>
  )
}

/** Página completa de esqueleto (título, subtítulo y tarjetas) dentro del diseño normal. */
export function PageLoading({
  label = 'Cargando…',
  cards = 3,
  className,
}: {
  label?: string
  cards?: number
  className?: string
}) {
  return (
    <LoadingFrame label={label} className={cn('mx-auto w-full max-w-4xl flex-1 px-5 py-8', className)}>
      <Skeleton className='h-8 w-56 max-w-[70%]' />
      <Skeleton className='mt-3 h-4 w-80 max-w-[90%]' />
      <div className='mt-8 space-y-4'>
        {Array.from({ length: cards }, (_, index) => (
          <CardSkeleton key={index} lines={index === 0 ? 3 : 2} />
        ))}
      </div>
    </LoadingFrame>
  )
}

/** Un bloque grande de esqueleto, para calendarios y gráficas. */
export function BlockLoading({
  label = 'Cargando…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <LoadingFrame label={label}>
      <Skeleton className={cn('h-80 w-full rounded-xl', className)} />
    </LoadingFrame>
  )
}

/** Filas de esqueleto, para listas y tablas. */
export function ListLoading({
  label = 'Cargando…',
  rows = 4,
  className,
}: {
  label?: string
  rows?: number
  className?: string
}) {
  return (
    <LoadingFrame label={label} className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className='flex items-center gap-3 rounded-xl border bg-card/60 p-3'>
          <Skeleton className='h-9 w-9 shrink-0 rounded-full' />
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton className={cn('h-3.5', index % 2 === 0 ? 'w-2/5' : 'w-1/3')} />
            <Skeleton className={cn('h-3', index % 2 === 0 ? 'w-3/4' : 'w-3/5')} />
          </div>
        </div>
      ))}
    </LoadingFrame>
  )
}
