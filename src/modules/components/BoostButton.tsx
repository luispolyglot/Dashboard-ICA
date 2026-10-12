import { LoaderCircleIcon, ZapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import type { WordBoostState } from '../hooks/useLexicardBoost'

/**
 * El botón de Potenciar (rayo amarillo), igual en Inmersión, en los resultados de un Desafío ICA
 * y en PreguntICA. Según el estado de la palabra es un botón, una etiqueta «Potenciada» o un botón
 * apagado cuando ya se usaron las 3 del día.
 */
export function BoostButton({
  state,
  busy = false,
  compact = false,
  onBoost,
  className,
}: {
  state: WordBoostState
  busy?: boolean
  /** Only the ⚡ (for tight rows such as the suggestion chips of PreguntICA). */
  compact?: boolean
  onBoost: () => void
  className?: string
}) {
  if (state === 'none') return null

  if (state === 'boosted') {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${className ?? ''}`}
        style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
        title={compact ? t('Potenciada') : undefined}
      >
        <ZapIcon className='size-3.5' strokeWidth={2.8} aria-hidden='true' />
        {compact ? <span className='sr-only'>{t('Potenciada')}</span> : t('Potenciada')}
      </span>
    )
  }

  const disabled = state === 'limit' || busy
  const title = state === 'limit' ? t('Hoy ya se usaron las 3 potenciaciones.') : compact ? t('Potenciar') : undefined
  if (compact) {
    return (
      <Button
        type='button'
        size='icon-sm'
        variant={state === 'limit' ? 'outline' : 'gold'}
        disabled={disabled}
        onClick={onBoost}
        className={`shrink-0 ${className ?? ''}`}
        title={title}
        aria-label={t('Potenciar')}
      >
        {busy ? (
          <LoaderCircleIcon className='animate-spin' strokeWidth={2.6} aria-hidden='true' />
        ) : (
          <ZapIcon strokeWidth={2.6} aria-hidden='true' />
        )}
      </Button>
    )
  }
  return (
    <Button
      type='button'
      size='sm'
      variant={state === 'limit' ? 'outline' : 'gold'}
      disabled={disabled}
      onClick={onBoost}
      className={`shrink-0 ${className ?? ''}`}
      title={title}
    >
      {busy ? (
        <LoaderCircleIcon className='animate-spin' strokeWidth={2.6} aria-hidden='true' />
      ) : (
        <ZapIcon strokeWidth={2.6} aria-hidden='true' />
      )}
      {t('Potenciar')}
    </Button>
  )
}
