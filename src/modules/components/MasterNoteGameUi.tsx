import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  StarIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GameProgress, tone, type Tone } from '../game/ui'
import { t, uiLocale } from '@/i18n'

/**
 * Piezas visuales de la fase A (notas maestras) con el estilo "modo juego".
 * Solo presentación: la lógica vive en las vistas.
 */

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** Fecha corta: "28 sep". */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' }).replace('.', '')
}

/** Número de la nota ("Nota Maestra: 7" → 7). */
export function noteNumber(name: string | null | undefined): string | null {
  const match = (name || '').match(/(\d+)\s*$/)
  return match ? match[1] : null
}

/** Clases del menú "Más opciones" (el desplegable base aún es fino). */
export const MENU_CONTENT_CLASS =
  'min-w-56 rounded-2xl border-2 border-border bg-popover p-1.5 shadow-[var(--pop-shadow)] ring-0'
export const MENU_ITEM_CLASS = 'gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold [&_svg]:size-4.5'

/**
 * Botón de "Más opciones" (los tres puntos). Se llama como función para que el
 * desplegable (asChild) reciba directamente el <Button>, que ya pasa la ref.
 */
export function moreMenuTrigger({
  label = t('Más opciones'),
  quiet = false,
}: { label?: string; quiet?: boolean } = {}) {
  return (
    <Button
      type='button'
      variant={quiet ? 'ghost' : 'outline'}
      size='icon'
      aria-label={label}
      className={cn('shrink-0 rounded-xl', quiet ? 'size-9 text-muted-foreground' : 'size-10')}
    >
      <MoreVerticalIcon className='size-5' strokeWidth={2.6} />
    </Button>
  )
}

/** Cuadrado con el número de la nota: rojo lleno si está terminada, suave si está abierta. */
export function NoteNumberTile({
  name,
  closed,
  size = 48,
  className,
}: {
  name: string | null | undefined
  closed: boolean
  size?: number
  className?: string
}) {
  const num = noteNumber(name)
  const a = tone('a')
  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center rounded-2xl font-black tabular-nums', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * (num && num.length > 2 ? 0.34 : 0.42)),
        background: closed ? a.solid : a.soft,
        color: closed ? '#fff' : a.ink,
        boxShadow: closed ? `0 4px 0 ${a.edge}` : undefined,
        border: closed ? undefined : `2px dashed color-mix(in oklab, ${a.solid} 55%, transparent)`,
      }}
      aria-hidden='true'
    >
      {num ?? 'A'}
      {closed ? (
        <span
          className='absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full'
          style={{ background: 'var(--ica-gold)', boxShadow: '0 2px 0 var(--ica-gold-edge)' }}
        >
          <StarIcon className='size-3 fill-white text-white' strokeWidth={2.6} />
        </span>
      ) : null}
    </span>
  )
}

/**
 * Botón redondo grande con canto (el del micrófono). Con `to` es un enlace.
 * `live` añade el aro que late (grabando o escuchando).
 */
export function RoundActionButton({
  children,
  onClick,
  to,
  disabled = false,
  ariaLabel,
  size = 96,
  tone: t = 'a',
  live = false,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  to?: string
  disabled?: boolean
  ariaLabel: string
  size?: number
  tone?: Tone
  live?: boolean
  className?: string
}) {
  const colors = tone(t)
  const edge = Math.max(4, Math.round(size / 14))
  const style: CSSProperties = disabled
    ? {
        width: size,
        height: size,
        background: 'var(--muted)',
        color: 'var(--muted-foreground)',
        boxShadow: `0 ${edge}px 0 var(--border)`,
      }
    : {
        width: size,
        height: size,
        background: colors.solid,
        color: '#fff',
        boxShadow: `0 ${edge}px 0 ${colors.edge}`,
      }
  const classes = cn(
    'ica-press relative flex shrink-0 items-center justify-center rounded-full transition-[filter] hover:brightness-105 disabled:cursor-not-allowed',
    className,
  )
  const ring = live ? (
    <span
      className='pointer-events-none absolute -inset-2.5 animate-pulse rounded-full border-[6px]'
      style={{ borderColor: `color-mix(in oklab, ${colors.solid} 30%, transparent)` }}
      aria-hidden='true'
    />
  ) : null

  if (to && !disabled) {
    return (
      <Link to={to} aria-label={ariaLabel} className={classes} style={style}>
        {ring}
        {children}
      </Link>
    )
  }
  return (
    <button type='button' onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={classes} style={style}>
      {ring}
      {children}
    </button>
  )
}

/** Botón cuadrado pequeño con canto (−10 s, +10 s, más opciones...). */
export function SquareIconButton({
  children,
  onClick,
  ariaLabel,
  disabled,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'ica-press flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-card text-foreground shadow-[0_3px_0_var(--border)] hover:bg-muted disabled:opacity-50 dark:bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Seek10({ forward }: { forward?: boolean }) {
  const Icon = forward ? RotateCwIcon : RotateCcwIcon
  return (
    <span className='relative flex items-center justify-center'>
      <Icon className='size-5' strokeWidth={2.4} />
      <span className='absolute -right-1.5 -bottom-1.5 text-[9px] font-black'>10</span>
    </span>
  )
}

/** Controles mientras suena una nota: barra, tiempos, −10 s, pausa, +10 s (y detener si se pasa `onStop`). */
export function NotePlayerControls({
  positionSec,
  durationSec,
  isPaused,
  onSeekBack,
  onTogglePause,
  onSeekForward,
  onStop,
  className,
}: {
  positionSec: number
  durationSec: number
  isPaused: boolean
  onSeekBack: () => void
  onTogglePause: () => void
  onSeekForward: () => void
  onStop?: () => void
  className?: string
}) {
  const value = durationSec > 0 ? positionSec / durationSec : 0
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div>
        <GameProgress value={value} color='var(--ica-a)' height={12} />
        <div className='mt-1 flex justify-between text-xs font-extrabold text-muted-foreground tabular-nums'>
          <span>{formatSeconds(positionSec)}</span>
          <span>{formatSeconds(durationSec)}</span>
        </div>
      </div>
      <div className='flex items-center justify-center gap-3'>
        <SquareIconButton onClick={onSeekBack} ariaLabel={t('Retroceder 10 segundos')}>
          <Seek10 />
        </SquareIconButton>
        <RoundActionButton size={56} onClick={onTogglePause} ariaLabel={isPaused ? t('Reanudar') : t('Pausar')}>
          {isPaused ? (
            <PlayIcon className='ml-0.5 size-6 fill-current' strokeWidth={2.4} />
          ) : (
            <PauseIcon className='size-6 fill-current' strokeWidth={2.4} />
          )}
        </RoundActionButton>
        <SquareIconButton onClick={onSeekForward} ariaLabel={t('Adelantar 10 segundos')}>
          <Seek10 forward />
        </SquareIconButton>
        {onStop ? (
          <SquareIconButton onClick={onStop} ariaLabel={t('Detener')}>
            <SquareIcon className='size-4 fill-current' strokeWidth={2.4} />
          </SquareIconButton>
        ) : null}
      </div>
    </div>
  )
}

/** Aviso de error amable (rojo suave, sin texto diminuto). */
export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role='alert'
      className={cn('m-0 rounded-2xl px-4 py-3 text-sm font-bold', className)}
      style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
    >
      {children}
    </p>
  )
}
