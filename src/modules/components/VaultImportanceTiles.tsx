import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { IMPORTANCE_LEVELS } from '../constants'
import { tone } from '../game/ui'
import { IMPORTANCE_TONE, ImportanceBars } from '../views/IcaWordParts'
import type { ImportanceKey } from '../types'

/**
 * Selector de "Frecuencia de uso" en fichas grandes (modo juego).
 * Lo usan los modales de guardar palabras en el baúl ICA desde una frase.
 * Mismos colores y barras que la pantalla de Inmersión.
 */
export function VaultImportanceTiles({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ImportanceKey | null
  onChange: (key: ImportanceKey) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-5', className)} role='radiogroup' aria-label={t('Frecuencia de uso')}>
      {IMPORTANCE_LEVELS.map((item) => {
        const selected = value === item.key
        const colors = tone(IMPORTANCE_TONE[item.key])
        return (
          <button
            key={item.key}
            type='button'
            role='radio'
            aria-checked={selected}
            onClick={() => onChange(item.key)}
            disabled={disabled}
            className='ica-press flex min-h-12 flex-col items-start justify-center gap-0.5 rounded-2xl border-2 px-3 py-2 text-left transition-colors disabled:opacity-50 sm:items-center sm:text-center'
            style={
              selected
                ? {
                    borderColor: colors.solid,
                    background: colors.soft,
                    color: colors.ink,
                    boxShadow: `0 3px 0 ${colors.solid}`,
                  }
                : { borderColor: 'var(--border)', background: 'var(--card)', boxShadow: '0 3px 0 var(--border)' }
            }
          >
            <span className='flex items-center gap-1.5 text-sm font-extrabold'>
              <ImportanceBars level={item.key} size={16} />
              {t(item.label)}
            </span>
            <span className='text-[11px] leading-tight font-semibold text-muted-foreground'>{t(item.desc)}</span>
          </button>
        )
      })}
    </div>
  )
}
