import { CheckIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { t, tn } from '@/i18n'
import { TASKS_PER_WEEK, type WeekRing } from '../../game/coachingRings'

// «Tu recorrido» (Luis, 6 Oct): one ring per week of the coaching. The 6 tasks of the week fill
// it; with the 6 it turns gold with a check («sellada»). Used on the coaching board (big, with the
// number or «4/6» under each ring) and on the Home coaching card (small).

const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Space between the 6 pieces of a ring, in degrees. */
const GAP_DEGREES = 9
const SEGMENT = (CIRCUMFERENCE * (360 / TASKS_PER_WEEK - GAP_DEGREES)) / 360

function RingGlyph({
  ring,
  size,
  showNumber,
  pop,
}: {
  ring: WeekRing
  size: number
  showNumber: boolean
  pop?: boolean
}) {
  const locked = ring.state === 'locked'
  return (
    <span className={`relative inline-flex shrink-0 ${pop ? 'ica-pop' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox='0 0 64 64' width={size} height={size} aria-hidden='true'>
        {ring.complete ? (
          <>
            <circle cx='32' cy='32' r='30' fill='none' stroke='var(--ica-gold)' strokeWidth='2' opacity='0.8' />
            <circle cx='32' cy='32' r='25' fill='var(--ica-gold)' stroke='var(--ica-gold-edge)' strokeWidth='2' />
          </>
        ) : (
          <>
            <circle cx='32' cy='32' r={RADIUS - 3} fill={locked ? 'transparent' : 'rgba(255,255,255,0.06)'} />
            {/* The ring is split in its 6 tasks (Luis, 7 Oct): one piece per task, gold when done. */}
            {Array.from({ length: TASKS_PER_WEEK }, (_, index) => {
              const done = index < ring.answered
              return (
                <circle
                  key={index}
                  cx='32'
                  cy='32'
                  r={RADIUS}
                  fill='none'
                  stroke={done ? 'var(--ica-gold)' : locked ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.24)'}
                  strokeWidth='6'
                  strokeDasharray={`${SEGMENT} ${CIRCUMFERENCE}`}
                  transform={`rotate(${-90 + index * (360 / TASKS_PER_WEEK) + GAP_DEGREES / 2} 32 32)`}
                  opacity={done && ring.state === 'closed' ? 0.75 : 1}
                />
              )
            })}
          </>
        )}
      </svg>
      <span className='absolute inset-0 flex items-center justify-center'>
        {ring.complete ? (
          <CheckIcon style={{ width: size * 0.42, height: size * 0.42, color: '#1b2450' }} strokeWidth={3.4} />
        ) : showNumber ? (
          <span
            className='font-display font-black tabular-nums'
            style={{ fontSize: Math.max(10, size * 0.32), color: locked ? 'rgba(255,255,255,0.35)' : '#fff' }}
          >
            {ring.period}
          </span>
        ) : null}
      </span>
    </span>
  )
}

function ringLabel(ring: WeekRing): string {
  if (ring.state === 'locked') return t('Semana {n}: aún no ha empezado', { n: ring.period })
  if (ring.complete) return t('Semana {n}: anillo completo', { n: ring.period })
  return t('Semana {n}: {done} de 6 tareas', { n: ring.period, done: ring.answered })
}

/** Big rings of the coaching board: tap a week to open it. */
export function CoachingWeekRingsStrip({
  rings,
  selectedPeriod,
  preparablePeriod,
  canOpen,
  onOpen,
  popPeriod,
}: {
  rings: WeekRing[]
  selectedPeriod: number
  preparablePeriod: number | null
  canOpen: (period: number) => boolean
  onOpen: (period: number) => void
  popPeriod?: number | null
}) {
  return (
    <div
      className='grid grid-cols-5 gap-x-1 gap-y-3 md:[grid-template-columns:repeat(var(--weeks),minmax(0,1fr))]'
      style={{ '--weeks': rings.length } as CSSProperties}
    >
      {rings.map((ring) => {
        const selected = ring.period === selectedPeriod
        const preparable = ring.state === 'locked' && ring.period === preparablePeriod
        const openable = canOpen(ring.period)
        const caption = ring.state === 'locked' ? (preparable ? t('Preparar') : '') : ring.complete ? String(ring.period) : `${ring.answered}/6`
        return (
          <button
            key={ring.period}
            type='button'
            onClick={() => openable && onOpen(ring.period)}
            disabled={!openable}
            aria-label={ringLabel(ring)}
            aria-current={selected ? 'true' : undefined}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl py-1 transition ${openable ? 'hover:-translate-y-0.5' : 'cursor-not-allowed'} ${selected ? 'bg-white/10' : ''}`}
          >
            <span
              className='rounded-full'
              style={
                preparable
                  ? { outline: '2px dashed rgba(255,255,255,0.6)', outlineOffset: 2 }
                  : selected
                    ? { outline: '2px solid #fff', outlineOffset: 2 }
                    : undefined
              }
            >
              <RingGlyph ring={ring} size={52} showNumber pop={popPeriod === ring.period} />
            </span>
            <span
              className='min-h-4 text-xs font-extrabold tabular-nums'
              style={{ color: ring.complete ? 'rgba(255,255,255,0.75)' : ring.state === 'locked' ? 'rgba(255,255,255,0.6)' : 'var(--ica-gold)' }}
            >
              {caption}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Rings for the Home coaching card (Luis, 7 Oct: like «Tu recorrido» of the board): a header with
 * the weeks left, then one numbered ring per week with «4/6» under the ones still open.
 * `compact` (mobile card) drops the header and the captions.
 */
export function CoachingWeekRingsMini({
  rings,
  currentPeriod,
  size = 40,
  compact = false,
}: {
  rings: WeekRing[]
  currentPeriod: number
  size?: number
  compact?: boolean
}) {
  const done = rings.filter((ring) => ring.complete).length
  const left = Math.max(0, rings.length - currentPeriod)
  return (
    <div role='img' aria-label={t('{done} de {total} anillos del coaching', { done, total: rings.length })}>
      {compact ? null : (
        <div className='mb-2.5 flex items-center justify-between gap-2'>
          <span className='text-[11px] font-black tracking-[0.12em] text-white/70 uppercase'>{t('Tu recorrido')}</span>
          <span className='text-xs font-bold text-white/70'>{tn(left, 'Queda {n} semana', 'Quedan {n} semanas')}</span>
        </div>
      )}
      <div className='grid gap-x-1 gap-y-1' style={{ gridTemplateColumns: `repeat(${rings.length}, minmax(0, 1fr))` }}>
        {rings.map((ring) => {
          const current = ring.period === currentPeriod
          const caption = ring.state === 'locked' ? '' : ring.complete ? '' : `${ring.answered}/6`
          return (
            <span key={ring.period} className='flex min-w-0 flex-col items-center gap-1'>
              <span
                className='flex justify-center rounded-full'
                style={current && !ring.complete ? { outline: '2px solid rgba(255,255,255,0.85)', outlineOffset: 2 } : undefined}
              >
                <RingGlyph ring={ring} size={size} showNumber />
              </span>
              {compact ? null : (
                <span
                  className='min-h-4 text-[11px] font-extrabold tabular-nums'
                  style={{ color: ring.complete ? 'rgba(255,255,255,0.7)' : 'var(--ica-gold)' }}
                >
                  {ring.complete ? ring.period : caption}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
