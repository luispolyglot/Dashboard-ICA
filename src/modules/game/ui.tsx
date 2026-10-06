import type { CSSProperties, ReactNode } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Piezas comunes del estilo "modo juego" (el de Inicio, Ranking, Rachas e ICA Coins).
 * Todas las pantallas nuevas se montan con estas piezas para que se vean iguales.
 */

export type Tone = 'i' | 'c' | 'a' | 'fire' | 'gold' | 'ok' | 'bad' | 'primary' | 'neutral'

type ToneColors = { solid: string; edge: string; soft: string; ink: string }

const TONES: Record<Tone, ToneColors> = {
  i: { solid: 'var(--ica-i)', edge: 'var(--ica-i-edge)', soft: 'var(--ica-i-soft)', ink: 'var(--ica-i-ink)' },
  c: { solid: 'var(--ica-c)', edge: 'var(--ica-c-edge)', soft: 'var(--ica-c-soft)', ink: 'var(--ica-c-ink)' },
  a: { solid: 'var(--ica-a)', edge: 'var(--ica-a-edge)', soft: 'var(--ica-a-soft)', ink: 'var(--ica-a-ink)' },
  fire: { solid: 'var(--ica-fire)', edge: 'var(--ica-fire-edge)', soft: 'var(--ica-fire-soft)', ink: 'var(--ica-fire-ink)' },
  gold: { solid: 'var(--ica-gold)', edge: 'var(--ica-gold-edge)', soft: 'var(--ica-gold-soft)', ink: 'var(--ica-gold-ink)' },
  ok: { solid: 'var(--ica-ok)', edge: 'var(--ica-ok-edge)', soft: 'var(--ica-ok-soft)', ink: 'var(--ica-ok-ink)' },
  bad: { solid: 'var(--ica-bad-strong)', edge: 'var(--ica-bad-edge)', soft: 'var(--ica-bad-soft)', ink: 'var(--ica-bad-ink)' },
  primary: {
    solid: 'var(--primary)',
    edge: 'var(--primary-edge)',
    soft: 'color-mix(in oklab, var(--primary) 14%, var(--card))',
    ink: 'color-mix(in oklab, var(--primary) 78%, var(--foreground))',
  },
  neutral: { solid: 'var(--muted-foreground)', edge: 'var(--border-strong)', soft: 'var(--muted)', ink: 'var(--foreground)' },
}

/** Los colores de un tono (para usarlos en `style`). */
export function tone(t: Tone): ToneColors {
  return TONES[t]
}

/** Contenedor de página: columna centrada con el ancho y los márgenes de las pantallas de juego. */
export function GamePage({
  children,
  className,
  wide = false,
}: {
  children: ReactNode
  className?: string
  /** Más ancho en ordenador (para pantallas con dos columnas). */
  wide?: boolean
}) {
  return (
    <section
      className={cn(
        'mx-auto flex w-full flex-1 flex-col gap-4 px-4 pt-1 pb-8 lg:gap-6 lg:py-8',
        wide ? 'max-w-5xl' : 'max-w-xl',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** Título grande de pantalla (letra redonda, nunca serif). */
export function PageTitle({
  children,
  subtitle,
  icon,
  right,
  className,
}: {
  children: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex items-center gap-3', className)}>
      {icon ? <span className='flex shrink-0 items-center justify-center'>{icon}</span> : null}
      <div className='min-w-0 flex-1'>
        <h1 className='m-0 font-display text-[22px] leading-tight font-extrabold tracking-tight lg:text-3xl'>{children}</h1>
        {subtitle ? <p className='m-0 mt-0.5 text-[13px] leading-snug font-semibold text-muted-foreground lg:text-sm'>{subtitle}</p> : null}
      </div>
      {right ? <div className='shrink-0'>{right}</div> : null}
    </header>
  )
}

/** Etiqueta de sección en mayúsculas pequeñas (EN QUÉ SE GASTAN, TUS LÍMITES DE HOY...). */
export function SectionLabel({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 flex items-center justify-between gap-2', className)}>
      <p className='ica-label m-0'>{children}</p>
      {right}
    </div>
  )
}

/**
 * Tarjeta con profundidad (borde y canto inferior). Con `tone` se tiñe del color de la fase.
 * `as='button'` la hace pulsable (se hunde al tocarla).
 */
export function Panel({
  children,
  className,
  tone: t,
  style,
  onClick,
  as = 'div',
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  className?: string
  tone?: Tone
  style?: CSSProperties
  onClick?: () => void
  as?: 'div' | 'button'
  disabled?: boolean
  ariaLabel?: string
}) {
  const colors = t ? TONES[t] : null
  const toneStyle: CSSProperties | undefined = colors
    ? {
        background: colors.soft,
        borderColor: `color-mix(in oklab, ${colors.solid} 38%, transparent)`,
        boxShadow: `0 4px 0 color-mix(in oklab, ${colors.solid} 30%, transparent)`,
      }
    : undefined
  const classes = cn('ica-panel block w-full p-4 text-left', as === 'button' && 'ica-press disabled:opacity-60', className)
  if (as === 'button') {
    return (
      <button type='button' onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={classes} style={{ ...toneStyle, ...style }}>
        {children}
      </button>
    )
  }
  return (
    <div className={classes} style={{ ...toneStyle, ...style }} aria-label={ariaLabel}>
      {children}
    </div>
  )
}

/** Grupo de filas separadas por líneas (tarjeta blanca en modo claro, plano en oscuro). */
export function RowGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('ica-group divide-y-2 divide-border', className)}>{children}</div>
}

/** Cuadradito de color suave con un icono dentro. */
export function IconTile({
  children,
  tone: t = 'primary',
  size = 48,
  className,
  solid = false,
}: {
  children: ReactNode
  tone?: Tone
  size?: number
  className?: string
  /** Color lleno con canto (más llamativo). */
  solid?: boolean
}) {
  const colors = TONES[t]
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-2xl', className)}
      style={{
        width: size,
        height: size,
        background: solid ? colors.solid : colors.soft,
        color: solid ? '#fff' : colors.ink,
        boxShadow: solid ? `0 4px 0 ${colors.edge}` : undefined,
      }}
    >
      {children}
    </span>
  )
}

/** Letra I, C o A de la marca (la única letra con serif), en su cuadrado 3D. */
export function PhaseLetter({ letter, size = 40, className }: { letter: 'I' | 'C' | 'A'; size?: number; className?: string }) {
  const t = letter === 'I' ? TONES.i : letter === 'C' ? TONES.c : TONES.a
  return (
    <span
      aria-hidden='true'
      className={cn('flex shrink-0 items-center justify-center rounded-xl font-ica leading-none font-extrabold text-white', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.55),
        background: t.solid,
        boxShadow: `0 ${Math.max(3, Math.round(size / 12))}px 0 ${t.edge}`,
      }}
    >
      {letter}
    </span>
  )
}

/** Barra de progreso gruesa con brillo (como la del nivel). `value` de 0 a 1. */
export function GameProgress({
  value,
  color = 'var(--primary)',
  height = 14,
  className,
  label,
}: {
  value: number
  color?: string
  height?: number
  className?: string
  label?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <span
      className={cn('relative block w-full overflow-hidden rounded-full bg-muted', className)}
      style={{ height }}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <span
        className='absolute inset-y-0 left-0 rounded-full transition-[width] duration-700'
        style={{ width: `${pct > 0 ? Math.max(pct, 4) : 0}%`, background: color }}
      />
      {height >= 10 && pct > 6 ? (
        <span
          className='absolute top-[3px] left-2 h-1 rounded-full bg-white/35'
          style={{ width: `calc(${pct}% - 1rem)` }}
          aria-hidden='true'
        />
      ) : null}
    </span>
  )
}

/** Dato grande con icono (palabras, frases, puntos...). */
export function StatTile({
  icon,
  value,
  label,
  tone: t,
  className,
}: {
  icon?: ReactNode
  value: ReactNode
  label: ReactNode
  tone?: Tone
  className?: string
}) {
  const colors = t ? TONES[t] : null
  return (
    <div className={cn('ica-panel flex min-w-0 items-center gap-3 px-3.5 py-3', className)}>
      {icon ? <span className='flex shrink-0 items-center justify-center'>{icon}</span> : null}
      <div className='min-w-0'>
        <p className='m-0 truncate text-xl leading-none font-black tabular-nums' style={colors ? { color: colors.ink } : undefined}>
          {value}
        </p>
        <p className='m-0 mt-1 truncate text-xs font-bold text-muted-foreground'>{label}</p>
      </div>
    </div>
  )
}

/** Bloque protagonista de color suave (como el saldo de ICA Coins). */
export function HeroBlock({
  tone: t,
  icon,
  eyebrow,
  title,
  text,
  children,
  className,
}: {
  tone: Tone
  icon?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  text?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const colors = TONES[t]
  return (
    <div className={cn('rounded-3xl px-4 py-3.5 lg:px-5 lg:py-4', className)} style={{ background: colors.soft }}>
      <div className='flex items-center gap-4'>
        {icon ? <span className='flex shrink-0 items-center justify-center'>{icon}</span> : null}
        <div className='min-w-0 flex-1'>
          {eyebrow ? (
            <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: colors.ink }}>
              {eyebrow}
            </p>
          ) : null}
          <p className='m-0 text-xl leading-tight font-black tracking-tight lg:text-2xl' style={{ color: colors.ink }}>
            {title}
          </p>
          {text ? <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>{text}</p> : null}
        </div>
      </div>
      {children ? <div className='mt-3 lg:mt-4'>{children}</div> : null}
    </div>
  )
}

/** Fila de lista con icono, título, texto y algo a la derecha (flecha por defecto si es pulsable). */
export function ListRow({
  icon,
  title,
  text,
  right,
  onClick,
  to,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  right?: ReactNode
  onClick?: () => void
  to?: string
  className?: string
}) {
  const clickable = Boolean(onClick || to)
  const content = (
    <>
      {icon ? <span className='flex shrink-0 items-center justify-center'>{icon}</span> : null}
      <span className='min-w-0 flex-1'>
        <span className='block leading-tight font-extrabold'>{title}</span>
        {text ? <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>{text}</span> : null}
      </span>
      {right ?? (clickable ? <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' /> : null)}
    </>
  )
  const classes = cn('flex w-full items-center gap-3 py-3 text-left', clickable && 'transition-opacity active:opacity-70', className)
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type='button' onClick={onClick} className={classes}>
        {content}
      </button>
    )
  }
  return <div className={classes}>{content}</div>
}

/** Pastilla pequeña de color (NUEVO, HOY, SEMANA 3/10...). */
export function Pill({ children, tone: t = 'primary', solid = false, className }: { children: ReactNode; tone?: Tone; solid?: boolean; className?: string }) {
  const colors = TONES[t]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] leading-5 font-extrabold whitespace-nowrap', className)}
      style={solid ? { background: colors.solid, color: '#fff' } : { background: colors.soft, color: colors.ink }}
    >
      {children}
    </span>
  )
}

/** Estado vacío amable: icono grande, título, texto y un botón opcional. */
export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}>
      {icon ? <span className='flex items-center justify-center'>{icon}</span> : null}
      <p className='m-0 text-lg font-extrabold'>{title}</p>
      {text ? <p className='m-0 max-w-sm text-sm font-semibold text-muted-foreground'>{text}</p> : null}
      {action ? <div className='mt-1'>{action}</div> : null}
    </div>
  )
}

/** Selector de pestañas (el mismo que el de Rachas: botones grandes, el activo teñido). */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role='tablist'
      aria-label={ariaLabel}
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type='button'
            role='tab'
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border-2 px-2 text-sm font-extrabold transition-colors',
              active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted dark:bg-transparent',
            )}
          >
            {option.icon}
            <span className='truncate'>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
