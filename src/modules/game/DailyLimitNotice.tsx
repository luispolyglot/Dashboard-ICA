import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { FichaIcon } from './icons'
import type { DailyLimitsState } from './limits'
import { DAY_BOOST_COST, type DailyLimitKey } from './rules'
import { t } from '@/i18n'

const REACHED_TEXT: Record<DailyLimitKey, (limit: number) => string> = {
  words: (limit) => t('Hoy ya añadiste {n} palabras ICA, el máximo del día.', { n: limit }),
  phrases: (limit) => t('Hoy ya creaste {n} frases nuevas, el máximo del día.', { n: limit }),
  activations: (limit) => t('Hoy ya guardaste {n} activaciones, el máximo del día.', { n: limit }),
}

/**
 * Aviso de "máximo del día alcanzado" con la opción de ampliar el día con fichas.
 * Se usa en Añadir palabra, Crear frase y Activar frase.
 */
export function DailyLimitNotice({
  kind,
  state,
  onNavigate,
  className,
}: {
  kind: DailyLimitKey
  state: DailyLimitsState
  onNavigate?: () => void
  className?: string
}) {
  const limit = state.limits[kind]

  return (
    <div
      role='status'
      className={cn('rounded-2xl border-2 p-3 text-left', className)}
      style={{ borderColor: 'var(--ica-gold-edge)', background: 'var(--ica-gold-soft)' }}
    >
      <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
        {REACHED_TEXT[kind](limit)}
      </p>
      <p className='m-0 mt-1 text-xs font-medium' style={{ color: 'var(--ica-gold-ink)' }}>
        {t('El método ICA funciona mejor con poco y bien trabajado. Mañana el contador vuelve a cero.')}
      </p>
      {state.boosted ? (
        <p className='m-0 mt-2 text-xs font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
          {t('Hoy ya tienes el día ampliado (el doble de todo).')}
        </p>
      ) : (
        <Link
          to={DASHBOARD_ROUTES.fichas}
          onClick={onNavigate}
          className='mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-transform active:scale-[0.98]'
          style={{ background: 'var(--ica-gold)', color: '#3a2a00' }}
        >
          <FichaIcon size={18} />
          {t('Ampliar el día · {n} ICA Coins', { n: DAY_BOOST_COST })}
        </Link>
      )}
    </div>
  )
}

/** Línea corta "Hoy: 3 de 10 palabras" para poner bajo los títulos. */
export function DailyLimitCounter({
  kind,
  state,
  className,
}: {
  kind: DailyLimitKey
  state: DailyLimitsState
  className?: string
}) {
  const used = Math.min(state.used[kind], state.limits[kind])
  const limit = state.limits[kind]
  const label =
    kind === 'words'
      ? t('Hoy: {used} de {limit} palabras', { used, limit })
      : kind === 'phrases'
        ? t('Hoy: {used} de {limit} frases nuevas', { used, limit })
        : t('Hoy: {used} de {limit} activaciones', { used, limit })
  return (
    <span className={cn('text-xs font-semibold text-muted-foreground tabular-nums', className)}>
      {label}
      {state.boosted ? t(' · día ampliado') : ''}
    </span>
  )
}
