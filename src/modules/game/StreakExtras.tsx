import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { useDashboardContext } from '../context/DashboardContext'
import { getStreak } from '../utils'
import {
  claimedMilestones,
  claimReachedFlashMilestones,
  claimReachedMilestones,
  coinsText,
  useFichas,
} from './fichas'
import { FichaIcon, IceCubeIcon } from './icons'
import type { StreakMilestone } from './rules'
import { t } from '@/i18n'

// Piezas de la pantalla de Rachas: la tarjeta de CongeladICA, los hitos de racha
// (ICA y flashcards) y el "vigilante" que cobra los hitos de flashcards.

const ICE = '#0ea5e9'

/** CongeladICA del mes: un cubito por cada una (con color = disponible, apagado = usada). */
export function CongeladicaCard({
  used,
  limit,
  message,
  frozenNow,
}: {
  used: number
  limit: number
  message: string
  frozenNow: boolean
}) {
  const available = Math.max(0, limit - used)
  return (
    <div
      className={cn('flex items-center gap-3 rounded-3xl border-2 p-3', frozenNow && 'animate-pulse')}
      style={{ borderColor: 'rgba(14, 165, 233, 0.4)', background: 'rgba(14, 165, 233, 0.1)' }}
    >
      <div className='flex shrink-0 gap-1.5' aria-hidden='true'>
        {Array.from({ length: limit }, (_, index) => {
          const isAvailable = index < available
          return (
            <span
              key={index}
              className='flex size-11 items-center justify-center rounded-2xl border-2'
              style={
                isAvailable
                  ? { background: 'var(--background)', borderColor: ICE }
                  : { background: 'var(--muted)', borderColor: 'var(--border-strong)', borderStyle: 'dashed', opacity: 0.6 }
              }
            >
              <span style={isAvailable ? undefined : { filter: 'grayscale(1)', opacity: 0.5 }}>
                <IceCubeIcon size={26} />
              </span>
            </span>
          )
        })}
      </div>
      <div className='min-w-0'>
        <p className='m-0 text-sm font-extrabold'>
          CongeladICA: te {available === 1 ? 'queda' : 'quedan'} {available} de {limit} este mes
        </p>
        <p className='m-0 text-xs font-medium text-muted-foreground'>{message}</p>
      </div>
    </div>
  )
}

/**
 * Hitos de una racha con su premio en ICA Coins. La primera vez que llegas a cada
 * hito, las ICA Coins se suman solas a tu saldo (vista previa en este dispositivo).
 */
export function StreakMilestones({
  kind,
  streak,
  milestones,
}: {
  kind: 'ica' | 'flashcards'
  streak: number
  milestones: ReadonlyArray<StreakMilestone>
}) {
  const { user } = useAuth()
  const { entries } = useFichas(user?.id)
  const claimed = claimedMilestones(entries, kind === 'ica' ? 'streak_milestone' : 'flash_milestone')
  const next = milestones.find((item) => item.days > streak)
  const previousDays = [...milestones].reverse().find((item) => item.days <= streak)?.days ?? 0

  useEffect(() => {
    if (!user?.id || kind !== 'ica') return
    const gained = claimReachedMilestones(user.id, streak)
    if (gained > 0) {
      toast.success(t('¡Hito de racha ICA! +{n}', { n: coinsText(gained) }), { description: t('Ya están en tu saldo.') })
    }
  }, [kind, streak, user?.id])

  const toNext = next ? next.days - streak : 0
  const pct = next ? Math.max(4, ((streak - previousDays) / (next.days - previousDays)) * 100) : 100

  return (
    <div>
      <div className='mb-2 flex items-baseline justify-between gap-2'>
        <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
          {kind === 'ica' ? t('Hitos de racha ICA') : t('Hitos de racha de flashcards')}
        </p>
      </div>

      {next ? (
        <div className='mb-3 rounded-2xl border-2 border-border p-3'>
          <div className='mb-1.5 flex items-center justify-between gap-2 text-sm font-extrabold'>
            <span>
              Próximo: {next.days} días
              <span className='font-semibold text-muted-foreground'>
                {' '}
                · te {toNext === 1 ? t('falta 1 día') : t('faltan {toNext} días', { toNext })}
              </span>
            </span>
            <span className='flex shrink-0 items-center gap-1' style={{ color: 'var(--ica-gold-ink)' }}>
              <FichaIcon size={18} />+{next.reward}
            </span>
          </div>
          <div className='h-3 overflow-hidden rounded-full bg-muted'>
            <div className='h-full rounded-full' style={{ width: `${pct}%`, background: 'var(--ica-gold)' }} />
          </div>
        </div>
      ) : null}

      <ul className='grid grid-cols-5 gap-1.5'>
        {milestones.map((milestone) => {
          const isClaimed = claimed.has(milestone.days) || streak >= milestone.days
const isNext = next?.days === milestone.days
return (
            <li key={milestone.days} className='flex flex-col items-center gap-1 text-center'>
              <span
                className='flex size-13 flex-col items-center justify-center rounded-2xl leading-none'
                style={
                  isClaimed
                    ? { background: 'var(--ica-gold)', color: '#3a2a00', boxShadow: '0 3px 0 var(--ica-gold-edge)' }
                    : isNext
                      ? { background: 'var(--background)', color: 'var(--foreground)', border: '2px dashed var(--ica-gold-edge)' }
                      : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                }
              >
                <span className='text-base font-black tabular-nums'>{milestone.days}</span>
                <span className='text-[9px] font-extrabold uppercase'>{t('días')}</span>
              </span>
              <span className='flex items-center gap-0.5 text-xs font-extrabold tabular-nums' style={{ color: 'var(--ica-gold-ink)' }}>
                <FichaIcon size={14} />+{milestone.reward}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Se monta una vez en la app: cuando la racha de flashcards llega a un hito
 * (7, 30, 90, 180, 360 días), suma sus ICA Coins y lo avisa.
 */
export function StreakRewardsWatcher() {
  const { user } = useAuth()
  const { completedDays } = useDashboardContext()
  const flashStreak = getStreak(completedDays)
  const lastRef = useRef<string>('')

  useEffect(() => {
    if (!user?.id) return
    const key = `${user.id}:${flashStreak}`
    if (lastRef.current === key) return
    lastRef.current = key
    const gained = claimReachedFlashMilestones(user.id, flashStreak)
    if (gained > 0) {
      toast.success(t('¡Hito de racha de flashcards! +{n}', { n: coinsText(gained) }), { description: t('Ya están en tu saldo.') })
    }
  }, [flashStreak, user?.id])

  return null
}
