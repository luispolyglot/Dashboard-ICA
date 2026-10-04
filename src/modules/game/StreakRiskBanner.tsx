import { useEffect, useState } from 'react'
import { XIcon } from 'lucide-react'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { StreakClockIcon } from './icons'
import { getIcaStreakState } from './streak'
import { getStreakRisk } from './streakRisk'
import { todayKey } from '../utils'
import { t, tn } from '@/i18n'

// The student can close the warning with the X (Luis, 4 Oct). It stays closed for the rest of the
// day in this browser; tomorrow it can show again.
const DISMISSED_KEY = 'ica.streakRiskDismissedDay'

function readDismissedDay(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

function storeDismissedDay(day: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, day)
  } catch {
    // Without storage it simply stays closed until the page reloads.
  }
}

/**
 * Aviso en Inicio cuando la racha ICA está en peligro: quedan 5 horas o menos para medianoche
 * y el ciclo de hoy aún no está hecho. Cuenta atrás con un reloj. Mismo aviso que la
 * notificación «Te quedan 5 horas» del servidor.
 */
export function StreakRiskBanner({ className }: { className?: string }) {
  const { dailyProgress, creationDays, savedCreationDays, creationSavesUsedThisMonth, creationSavesLimit } =
    useDashboardContext()
  const [now, setNow] = useState(() => new Date())
  const [dismissedDay, setDismissedDay] = useState<string | null>(() => readDismissedDay())

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
  if (dismissedDay === todayKey()) return null

  const dismiss = () => {
    const day = todayKey()
    storeDismissedDay(day)
    setDismissedDay(day)
  }

  const left =
    risk.hours > 0
      ? t('Te quedan {h} h {m} min', { h: risk.hours, m: risk.minutes })
      : t('Te quedan {m} min', { m: risk.minutes })

  return (
    <div
      role='status'
      className={`ica-pop flex items-center gap-3 rounded-2xl border-2 py-2.5 pr-1.5 pl-3 ${className ?? ''}`}
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
      <button
        type='button'
        onClick={dismiss}
        className='flex size-10 shrink-0 items-center justify-center self-start rounded-xl transition-colors hover:bg-black/10'
        style={{ color: 'var(--ica-fire-ink)' }}
        aria-label={t('Cerrar aviso')}
      >
        <XIcon className='size-5' strokeWidth={2.8} aria-hidden='true' />
      </button>
    </div>
  )
}
