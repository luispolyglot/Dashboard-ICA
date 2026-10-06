import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { FichaIcon } from './icons'
import { LIMIT_LABELS, type DailyLimitsState } from './limits'
import { buyPhaseBoost, coinsText, useFichas } from './fichas'
import { gameSfx } from './sfx'
import { DAILY_LIMITS, LIMIT_PHASE, PHASE_BOOST_COST, PHASE_BOOST_MULTIPLIER, type DailyLimitKey } from './rules'
import { t } from '@/i18n'

const REACHED_TEXT: Record<DailyLimitKey, (limit: number) => string> = {
  words: (limit) => t('Hoy ya añadiste {n} palabras ICA, el máximo del día.', { n: limit }),
  phrases: (limit) => t('Hoy ya creaste {n} frases nuevas, el máximo del día.', { n: limit }),
  activations: (limit) => t('Hoy ya guardaste {n} activaciones, el máximo del día.', { n: limit }),
}

/**
 * Aviso de "máximo del día alcanzado" con la opción de ampliar esa fase hoy con ICA Coins.
 * Se usa en Añadir palabra, Crear frase y Activar frase.
 * Luis (6 Oct): the boost is bought right here (tap, then tap again to confirm), without going
 * to the shop.
 */
export function DailyLimitNotice({
  kind,
  state,
  className,
}: {
  kind: DailyLimitKey
  state: DailyLimitsState
  /** Kept for callers that closed a dialog before going to the shop; the purchase is now in place. */
  onNavigate?: () => void
  className?: string
}) {
  const { user } = useAuth()
  const { total } = useFichas(user?.id)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const limit = state.limits[kind]
  const phase = t(LIMIT_PHASE[kind].name)
  const balance = total ?? 0
  const canAfford = balance >= PHASE_BOOST_COST

  const buy = async () => {
    if (busy) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    setBusy(true)
    try {
      if (!(await buyPhaseBoost(user?.id, kind, balance))) throw new Error('PURCHASE_FAILED')
      gameSfx.celebrate()
      toast.success(t('{phase} ampliada hoy', { phase }), {
        description: t('Hoy puedes llegar a {n} {what}.', {
          n: DAILY_LIMITS[kind] * PHASE_BOOST_MULTIPLIER,
          what: t(LIMIT_LABELS[kind].many),
        }),
      })
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.includes('INSUFFICIENT_TOKENS')
          ? t('No tienes suficientes ICA Coins.')
          : t('No se pudo ampliar esta fase. Inténtalo de nuevo.'),
      )
    } finally {
      setBusy(false)
    }
  }

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
      {state.boosted[kind] ? (
        <p className='m-0 mt-2 text-xs font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
          {t('Hoy ya tienes {phase} ampliada (×{n}).', { phase, n: PHASE_BOOST_MULTIPLIER })}
        </p>
      ) : canAfford || total === null ? (
        <button
          type='button'
          onClick={() => void buy()}
          disabled={busy || total === null}
          className='mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-60'
          style={{ background: 'var(--ica-gold)', color: '#3a2a00' }}
        >
          <FichaIcon size={18} />
          {busy
            ? t('Ampliando...')
            : confirming
              ? t('Toca otra vez para pagar {n} ICA Coins', { n: PHASE_BOOST_COST })
              : t('Ampliar {phase} hoy · {n} ICA Coins', { phase, n: PHASE_BOOST_COST })}
        </button>
      ) : (
        <p className='m-0 mt-2 text-xs font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
          {t('Necesitas {n} para ampliar {phase} (tienes {balance}).', { n: coinsText(PHASE_BOOST_COST), phase, balance })}
        </p>
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
      {state.boosted[kind] ? t(' · ampliado hoy') : ''}
    </span>
  )
}
