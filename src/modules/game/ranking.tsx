import { useState, type ReactNode } from 'react'
import { ChevronRightIcon, CrownIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ACHIEVEMENT_CATALOG } from './achievements'
import type { FeaturedBadge } from './featuredBadge'
import { Medal } from './Medal'
import { medalText, tierName } from './medals'
import { SpinningMedal } from './SpinningMedal'
import { t, uiLocale } from '@/i18n'

export { closedMonthEfficacy, rowName, rowTotalPoints } from './rankingMath'

// Piezas del ranking del mes con el estilo del prototipo: puesto, inicial (mismo
// color para todos), nombre + insignia destacada y puntos.

// Se crea al pintar para usar el idioma de la interfaz (12,5 en español; 12.5 en inglés).
export const pointsFormatter = {
  format: (value: number): string =>
    new Intl.NumberFormat(uiLocale(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value),
}

const PODIUM: Record<number, [string, string]> = {
  1: ['#ffc72c', '#3a2a00'],
  2: ['#d3dbe4', '#28394a'],
  3: ['#e7b98a', '#5a3310'],
}

export function RankBadge({ rank }: { rank: number }) {
  const podium = PODIUM[rank]
  if (podium) {
    return (
      <span
        className='flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold'
        style={{ background: podium[0], color: podium[1] }}
      >
        {rank}
      </span>
    )
  }
  return (
    <span className='w-8 shrink-0 text-center text-[15px] font-extrabold text-muted-foreground tabular-nums'>
      {rank}
    </span>
  )
}

/** Inicial del alumno: el mismo color para todos. */
export function UserInitial({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className='flex shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted font-extrabold text-foreground'
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden='true'
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/**
 * Nombre corto para el ranking, como en el prototipo: «Ana García» → «Ana G.».
 * Así el nombre nunca tapa la insignia destacada.
 */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return t('Usuario')
  const first = words[0].length > 14 ? `${words[0].slice(0, 13)}…` : words[0]
  const second = words.find((word, index) => index > 0 && /\p{L}/u.test(word))
  return second ? `${first} ${second.match(/\p{L}/u)?.[0]?.toUpperCase()}.` : first
}

/** Insignia junto al nombre. Al tocarla se enseña en grande con una pequeña animación. */
export function FeaturedBadgeMini({ badge, size = 34, compact = false }: { badge: FeaturedBadge; size?: number; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const def = ACHIEVEMENT_CATALOG.find((item) => item.key === badge.category)
  const level = def?.levels.find((item) => item.tier === badge.tier)
  if (!def || !level) return null
  const label = `${t(def.title)} · ${tierName(level.tier)}`
  return (
    <>
      <button
        type='button'
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        className='inline-flex shrink-0 rounded-full transition-transform active:scale-90'
        style={{ width: size }}
        aria-label={t('Ver insignia: {label}', { label })}
      >
        <Medal category={def.key} tier={level.tier} ribbon={level.ribbon} label={label} earned compact={compact} className='w-full' />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='overflow-hidden sm:max-w-sm' onClick={(event) => event.stopPropagation()}>
          <div className='flex flex-col items-center gap-3 pt-2 text-center'>
            <div className='relative flex size-52 items-center justify-center'>
              <span className='ica-badge-glow absolute inset-6 rounded-full' aria-hidden='true' />
              {/* Al abrirla (y al tocarla) da una vuelta con el whoosh de su rango. */}
              <div className='relative w-40'>
                <SpinningMedal tier={level.tier} enter>
                  <Medal category={def.key} tier={level.tier} ribbon={level.ribbon} label={label} earned className='w-full' />
                </SpinningMedal>
              </div>
            </div>
            <DialogTitle className='pr-0 text-2xl'>{t(def.title)}</DialogTitle>
            <span className='rounded-full bg-muted px-3 py-1 text-xs font-extrabold tracking-[0.08em] uppercase'>
              {tierName(level.tier)}
            </span>
            {/* Sin texto debajo: basta con la insignia y su nombre (el texto queda para el lector de pantalla). */}
            <DialogDescription className='sr-only'>{medalText(level.caption)}</DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function LeaderboardRow({
  rank,
  name,
  points,
  isMe = false,
  detail,
  badge,
  onRankClick,
  onPointsClick,
  onProfileClick,
}: {
  rank: number
  name: string
  points: number
  isMe?: boolean
  detail?: ReactNode
  badge?: FeaturedBadge | null
  onRankClick?: () => void
  onPointsClick?: () => void
  /** Tocar la inicial o el nombre abre el perfil de este icademer. */
  onProfileClick?: () => void
}) {
  const rankNode = <RankBadge rank={rank} />
  const who = (
    <>
      <UserInitial name={name} />
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <span className={cn('truncate text-[15px]', isMe ? 'font-extrabold' : 'font-bold')}>
            {shortName(name)}
            {isMe ? t(' (tú)') : ''}
          </span>
        </div>
        {detail ? <div className='truncate text-xs font-medium text-muted-foreground'>{detail}</div> : null}
      </div>
    </>
  )
  return (
    <div
      className={cn(
        'flex min-h-[60px] items-center gap-2.5 rounded-2xl border-2 px-2 py-2',
        isMe ? 'border-[color-mix(in_oklab,var(--ica-me)_45%,transparent)] bg-[var(--ica-me-soft)]' : 'border-transparent',
      )}
    >
      {onRankClick && rank <= 3 ? (
        <button type='button' onClick={onRankClick} aria-label={t('Ver premio del puesto {rank}', { rank })}>
          {rankNode}
        </button>
      ) : (
        rankNode
      )}
      {onProfileClick ? (
        <button
          type='button'
          onClick={onProfileClick}
          className='-my-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1 text-left transition-colors hover:bg-muted/70'
          aria-label={t('Ver el perfil de {name}', { name })}
        >
          {who}
        </button>
      ) : (
        who
      )}
      {/* La insignia va a la derecha, centrada entre las dos líneas (sin pisar el texto).
          Cabe entera dentro de su fila: aunque dos filas seguidas lleven la de diamante
          (la más grande, con rayos), no se tocan. */}
      {badge ? (
        <span className='inline-flex shrink-0'>
          <FeaturedBadgeMini badge={badge} size={42} compact />
        </span>
      ) : null}
      {onPointsClick ? (
        <button
          type='button'
          onClick={onPointsClick}
          className='flex shrink-0 flex-col items-end rounded-lg px-1.5 py-1 leading-none tabular-nums text-muted-foreground hover:bg-muted'
          aria-label={t('Ver cómo se calculan estos puntos')}
        >
          <span className='text-[15px] font-extrabold'>{pointsFormatter.format(points)}</span>
          <span className='mt-0.5 text-[10px] font-bold'>pts</span>
        </button>
      ) : (
        <span className='flex shrink-0 flex-col items-end leading-none tabular-nums text-muted-foreground'>
          <span className='text-[15px] font-extrabold'>{pointsFormatter.format(points)}</span>
          <span className='mt-0.5 text-[10px] font-bold'>pts</span>
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Podio (top 3), tu puesto fijo arriba y las filas "fantasma" a partir del 30
// ---------------------------------------------------------------------------

const PLINTH: Record<number, { top: string; edge: string; ink: string; height: number }> = {
  1: { top: '#ffd34d', edge: '#d99a00', ink: '#5a3b00', height: 74 },
  2: { top: '#dfe6ee', edge: '#a3afbd', ink: '#33475b', height: 56 },
  3: { top: '#efc39a', edge: '#b9814f', ink: '#5a3310', height: 44 },
}

export type PodiumEntry = {
  key: string
  rank: number
  name: string
  points: number
  isMe: boolean
  badge?: FeaturedBadge | null
  /** Puntos del mes (cómo se calculan). */
  onOpen: () => void
  onPrize: () => void
  /** Tocar la inicial o el nombre abre el perfil. Sin esto, la inicial abre los puntos. */
  onProfile?: () => void
}

/** Los tres primeros, en su podio: el 1.º en el centro y más alto, con corona. */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length === 0) return null
  const order = [entries[1], entries[0], entries[2]]
  return (
    <div className='mx-auto grid max-w-md grid-cols-3 items-end gap-2 px-1 pt-3'>
      {order.map((entry, index) => {
        if (!entry) return <span key={`empty-${index}`} />
        const place = Math.min(3, Math.max(1, entry.rank))
        const plinth = PLINTH[place]
        const isFirst = place === 1
        const avatar = isFirst ? 54 : 46
        return (
          <div key={entry.key} className='flex min-w-0 flex-col items-center'>
            <div className='flex min-w-0 flex-col items-center gap-1'>
              <button
                type='button'
                onClick={entry.onProfile ?? entry.onOpen}
                className='relative transition-transform active:scale-95'
                aria-label={
                  entry.onProfile
                    ? t('Ver el perfil de {name}', { name: entry.name })
                    : t('{name}: {points} puntos', { name: entry.name, points: pointsFormatter.format(entry.points) })
                }
              >
                {isFirst ? (
                  <CrownIcon
                    className='ica-bob absolute -top-5 left-1/2 size-6 -translate-x-1/2'
                    strokeWidth={2.4}
                    style={{ color: plinth.edge, fill: plinth.top }}
                    aria-hidden='true'
                  />
                ) : null}
                <span
                  className='flex items-center justify-center rounded-full font-black'
                  style={{
                    width: avatar,
                    height: avatar,
                    fontSize: Math.round(avatar * 0.4),
                    background: entry.isMe ? 'var(--ica-me)' : 'var(--card)',
                    color: entry.isMe ? '#fff' : 'var(--foreground)',
                    border: `4px solid ${plinth.top}`,
                    boxShadow: `0 4px 0 ${plinth.edge}`,
                  }}
                >
                  {entry.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
              </button>
              <span className='mt-1 flex max-w-full min-w-0 items-center gap-1'>
                {entry.onProfile ? (
                  <button
                    type='button'
                    onClick={entry.onProfile}
                    className={cn('truncate rounded-md text-sm hover:underline', entry.isMe ? 'font-black' : 'font-extrabold')}
                  >
                    {shortName(entry.name)}
                  </button>
                ) : (
                  <span className={cn('truncate text-sm', entry.isMe ? 'font-black' : 'font-extrabold')}>
                    {shortName(entry.name)}
                  </span>
                )}
                {entry.badge ? <FeaturedBadgeMini badge={entry.badge} size={32} /> : null}
              </span>
              {entry.onProfile ? (
                <button
                  type='button'
                  onClick={entry.onOpen}
                  className='rounded-md px-1 text-xs font-black tabular-nums hover:bg-muted'
                  style={{ color: entry.isMe ? 'var(--ica-me-ink)' : 'var(--muted-foreground)' }}
                  aria-label={t('{name}: {points} puntos', { name: entry.name, points: pointsFormatter.format(entry.points) })}
                >
                  {pointsFormatter.format(entry.points)} pts
                </button>
              ) : (
                <span className='text-xs font-black tabular-nums' style={{ color: entry.isMe ? 'var(--ica-me-ink)' : 'var(--muted-foreground)' }}>
                  {pointsFormatter.format(entry.points)} pts
                </span>
              )}
            </div>
            <button
              type='button'
              onClick={entry.onPrize}
              className='mt-2 flex w-full max-w-[150px] items-start justify-center rounded-t-2xl pt-1.5 font-display text-2xl font-black transition-[filter] hover:brightness-105'
              style={{
                height: plinth.height,
                background: `linear-gradient(180deg, ${plinth.top}, color-mix(in oklab, ${plinth.top} 70%, ${plinth.edge}))`,
                color: plinth.ink,
                boxShadow: `inset 0 -6px 0 ${plinth.edge}`,
              }}
              aria-label={t('Ver premio del puesto {rank}', { rank: place })}
            >
              {entry.rank}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Tu puesto, siempre arriba y en azul (aunque vayas el 34.º). */
export function MyRankCard({
  rank,
  name,
  points,
  onOpen,
}: {
  rank: number
  name: string
  points: number
  onOpen: () => void
}) {
  return (
    <button
      type='button'
      onClick={onOpen}
      className='ica-press flex w-full items-center gap-3 rounded-3xl px-3.5 py-3 text-left text-white'
      style={{ background: 'var(--ica-me)', boxShadow: '0 4px 0 var(--ica-me-edge)' }}
      aria-label={t('Tu puesto: {rank}. Ver tu puntuación', { rank })}
    >
      <span
        className='flex size-12 shrink-0 items-center justify-center rounded-full bg-white font-black tabular-nums'
        style={{ color: 'var(--ica-me)', fontSize: rank >= 100 ? 15 : 19 }}
      >
        {rank}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-[11px] font-black tracking-[0.1em] uppercase opacity-85'>{t('Tu puesto')}</span>
        <span className='block truncate text-base font-black'>{shortName(name)}</span>
      </span>
      <span className='flex shrink-0 items-center gap-1'>
        <span className='text-right'>
          <span className='block text-xl leading-none font-black tabular-nums'>{pointsFormatter.format(points)}</span>
          <span className='block text-[11px] font-bold opacity-85'>{t('puntos')}</span>
        </span>
        <ChevronRightIcon className='size-5 opacity-80' strokeWidth={2.8} aria-hidden='true' />
      </span>
    </button>
  )
}

/** Cuántos de los últimos puestos visibles se van difuminando (p. ej. del 26 al 30). */
const FADE_ROWS = 5

/**
 * Opacidad de cada puesto visible (posición 0 = el 1.º): los de arriba se ven enteros y los
 * últimos `FADE_ROWS` se van apagando poco a poco.
 */
export function rankingFadeOpacity(position: number, visible: number): number {
  const fadeStart = visible - FADE_ROWS
  if (position < fadeStart) return 1
  const step = position - fadeStart + 1
  return Math.max(0.12, 1 - step * 0.17)
}

/** Después del 30 el ranking sigue: tras las filas que se apagan, tres puntos. */
export function RankingFadeOut({ remaining }: { remaining: number }) {
  if (remaining <= 0) return null
  return (
    <p
      className='m-0 pt-1 pb-2 text-center text-xl leading-none font-black tracking-[0.3em] text-muted-foreground/50 select-none'
      aria-label={t('Y {n} icademers más', { n: remaining })}
    >
      <span aria-hidden='true'>···</span>
    </p>
  )
}
