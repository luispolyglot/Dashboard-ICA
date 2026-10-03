import { useEffect, useState } from 'react'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { StreakClockIcon } from './icons'
import { getIcaStreakState } from './streak'
import { getStreakRisk } from './streakRisk'
import { t, tn } from '@/i18n'

/**
 * Aviso en Inicio cuando la racha ICA está en peligro: quedan 5 horas o menos para medianoche
 * y el ciclo de hoy aún no está hecho. Cuenta atrás con un reloj. Mismo aviso que la
 * notificación «Te quedan 5 horas» del servidor.
 */
export function StreakRiskBanner({ className }: { className?: string }) {
  const { dailyProgress, creationDays, savedCreationDays, creationSavesUsedThisMonth, creationSavesLimit } =
    useDashboardContext()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const { streak, cycleDoneToday } = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  })
  const risk = getStreakRisk({ streak, cycleDoneToday, now })
  if (!risk.atRisk) return null

  const left =
    risk.hours > 0
      ? t('Te quedan {h} h {m} min', { h: risk.hours, m: risk.minutes })
      : t('Te quedan {m} min', { m: risk.minutes })

  return (
    <div
      role='status'
      className={`ica-pop flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 ${className ?? ''}`}
      style={{ borderColor: 'var(--ica-fire)', background: 'var(--ica-fire-soft)' }}
    >
      <StreakClockIcon size={40} />
      <div className='min-w-0 flex-1'>
        <p className='m-0 text-base leading-tight font-black tabular-nums' style={{ color: 'var(--ica-fire-ink)' }}>
          {left}
        </p>
        <p className='m-0 mt-0.5 text-xs font-bold' style={{ color: 'var(--ica-fire-ink)' }}>
          {tn(
            streak,
            t('Haz tu ciclo ICA antes de que sea tarde para no perder tu racha de {n} día.'),
            t('Haz tu ciclo ICA antes de que sea tarde para no perder tu racha de {n} días.'),
          )}
        </p>
      </div>
    </div>
  )
}
