/**
 * Desafíos ICA · tu balance: racha de victorias seguidas, mejor racha,
 * ganados, perdidos y empates. Se enseña en el Historial y, si vas en racha,
 * también arriba del todo.
 */
import { FlameIcon, TrophyIcon } from 'lucide-react'
import { t, tn } from '@/i18n'
import type { IcaChallengeStats } from '../../types'

/** Chip de arriba: solo aparece si llevas 2 victorias seguidas o más. */
export function WinStreakChip({ stats }: { stats: IcaChallengeStats | null }) {
  if (!stats || stats.currentStreak < 2) return null
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-800 dark:border-amber-400/40 dark:text-amber-200'>
      <FlameIcon className='h-4 w-4' />
      {tn(stats.currentStreak, '{n} victoria seguida', '{n} victorias seguidas')}
    </span>
  )
}

export function ChallengeStatsCard({ stats }: { stats: IcaChallengeStats }) {
  const { currentStreak, bestStreak, wins, losses, draws, played } = stats
  const message =
    played === 0
      ? t('Gana tu primer desafío para empezar la racha.')
      : currentStreak === 0
        ? t('Gana el próximo desafío para empezar una racha nueva.')
        : currentStreak >= bestStreak
          ? t('¡Es tu mejor racha! Sigue así.')
          : t('Tu récord es de {n}. ¡A por él!', { n: bestStreak })

  return (
    <div className='mb-3 overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent p-4 dark:border-amber-400/40'>
      <div className='flex items-center gap-3'>
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
            currentStreak > 0
              ? 'bg-amber-500/25 text-amber-600 dark:text-amber-300'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <FlameIcon className='h-7 w-7' />
        </span>
        <div className='min-w-0'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
            {t('Racha de victorias')}
          </p>
          <p className='font-display tracking-tight text-2xl font-extrabold leading-tight'>
            {tn(currentStreak, '{n} victoria seguida', '{n} victorias seguidas')}
          </p>
          <p className='text-xs text-muted-foreground'>{message}</p>
        </div>
      </div>

      <div className='mt-4 grid grid-cols-3 gap-2 text-center'>
        <div className='rounded-xl border bg-background/60 px-2 py-2.5'>
          <p className='inline-flex items-center gap-1 font-display font-extrabold tracking-tight text-2xl leading-none'>
            <TrophyIcon className='h-4 w-4 text-amber-500' />
            {bestStreak}
          </p>
          <p className='mt-1 text-[11px] text-muted-foreground'>{t('Mejor racha')}</p>
        </div>
        <div className='rounded-xl border border-blue-300/70 bg-blue-500/10 px-2 py-2.5 dark:border-blue-400/30'>
          <p className='font-display font-extrabold tracking-tight text-2xl leading-none text-blue-700 dark:text-blue-300'>{wins}</p>
          <p className='mt-1 text-[11px] text-muted-foreground'>{tn(wins, 'Ganado', 'Ganados')}</p>
        </div>
        <div className='rounded-xl border border-rose-200 bg-rose-500/[0.06] px-2 py-2.5 dark:border-rose-400/20'>
          <p className='font-display font-extrabold tracking-tight text-2xl leading-none text-rose-600/90 dark:text-rose-300/90'>{losses}</p>
          <p className='mt-1 text-[11px] text-muted-foreground'>{tn(losses, 'Perdido', 'Perdidos')}</p>
        </div>
      </div>
      {draws > 0 && (
        <p className='mt-2 text-center text-[11px] text-muted-foreground'>
          {tn(draws, 'y {n} empate', 'y {n} empates')}
        </p>
      )}
    </div>
  )
}
