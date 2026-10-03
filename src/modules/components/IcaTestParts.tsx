import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { tone as toneColors, type Tone } from '../game/ui'

// Piezas del Test ICA (icono propio, nota en grande y tarjeta de estado).

/** Icono del Test ICA: portapapeles morado con una marca verde (sin emojis). */
export function IcaTestGlyph({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <rect x='3.6' y='3.8' width='15.4' height='18.6' rx='3' fill='#6D28D9' />
      <rect x='3.6' y='2.8' width='15.4' height='18.6' rx='3' fill='#8B5CF6' />
      <rect x='5.8' y='5.2' width='11' height='13.8' rx='1.6' fill='#FFFFFF' />
      <path d='M8 9.2h6.2M8 12.2h4.6M8 15.2h3.4' stroke='#C4B5FD' strokeWidth='1.5' strokeLinecap='round' />
      <rect x='8' y='1.2' width='6.6' height='3.6' rx='1.4' fill='#FFC72C' stroke='#D99A00' strokeWidth='0.6' />
      <circle cx='17.4' cy='17.6' r='4.6' fill='#16A34A' />
      <circle cx='17.4' cy='17' r='4.6' fill='#22C55E' />
      <path d='M15.3 17.1l1.5 1.5 2.8-3' fill='none' stroke='#FFFFFF' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  )
}

/** Color de una nota según el porcentaje de aciertos. */
export function scoreTone(score: number, total: number, failed = false): Tone {
  if (failed) return 'bad'
  if (total <= 0) return 'neutral'
  const ratio = score / total
  if (ratio >= 0.8) return 'ok'
  if (ratio >= 0.5) return 'gold'
  return 'a'
}

/** Nota en grande dentro de un cuadrado de color con canto (10/12). */
export function ScoreBadge({
  score,
  total,
  failed = false,
  size = 64,
  className,
}: {
  score: number
  total: number
  failed?: boolean
  size?: number
  className?: string
}) {
  const colors = toneColors(scoreTone(score, total, failed))
  return (
    <span
      className={cn('flex shrink-0 flex-col items-center justify-center rounded-2xl leading-none text-white', className)}
      style={{ width: size, height: size, background: colors.solid, boxShadow: `0 4px 0 ${colors.edge}` }}
    >
      <span className='font-black tabular-nums' style={{ fontSize: Math.round(size * 0.4) }}>
        {score}
      </span>
      <span className='mt-0.5 font-extrabold tabular-nums opacity-85' style={{ fontSize: Math.round(size * 0.19) }}>
        {t('de {total}', { total })}
      </span>
    </span>
  )
}

/** Pantalla de estado (bloqueado, error, cargando...): icono grande, título, texto y acción. */
export function IcaTestStateCard({
  icon,
  title,
  text,
  children,
  tone,
}: {
  icon: ReactNode
  title: ReactNode
  text?: ReactNode
  children?: ReactNode
  tone?: Tone
}) {
  const colors = tone ? toneColors(tone) : null
  return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-2 pb-8 lg:py-8'>
      <div className='ica-panel flex flex-col items-center gap-3 px-5 py-8 text-center'>
        <span
          className='flex size-20 items-center justify-center rounded-3xl'
          style={{ background: colors ? colors.soft : 'var(--muted)', color: colors ? colors.ink : 'var(--muted-foreground)' }}
        >
          {icon}
        </span>
        <h1 className='m-0 font-display text-2xl leading-tight font-extrabold tracking-tight'>{title}</h1>
        {text ? <div className='m-0 max-w-sm text-sm font-semibold text-muted-foreground'>{text}</div> : null}
        {children ? <div className='mt-2 flex w-full flex-col items-center gap-2'>{children}</div> : null}
      </div>
    </section>
  )
}
