import { IMPORTANCE_LEVELS } from '../constants'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { tone, type Tone } from '../game/ui'
import type { ImportanceKey } from '../types'

// Piezas de la fase I (Añadir palabras y Mis palabras ICA): el color de cada frecuencia,
// su icono de barras y el selector de frecuencia en bloques grandes.

/** Color del modo juego para cada frecuencia de uso. */
export const IMPORTANCE_TONE: Record<ImportanceKey, Tone> = {
  vital: 'i',
  frequent: 'ok',
  occasional: 'gold',
  rare: 'fire',
  irrelevant: 'bad',
}

const BARS_BY_LEVEL: Record<ImportanceKey, number> = {
  vital: 5,
  frequent: 4,
  occasional: 3,
  rare: 2,
  irrelevant: 1,
}

/** Icono de barras (como la cobertura del móvil): más barras = la usas más. */
export function ImportanceBars({ level, size = 20, className }: { level: ImportanceKey; size?: number; className?: string }) {
  const filled = BARS_BY_LEVEL[level]
  const color = tone(IMPORTANCE_TONE[level]).solid
  return (
    <svg
      viewBox='0 0 20 16'
      width={size}
      height={(size * 16) / 20}
      className={cn('shrink-0', className)}
      aria-hidden='true'
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const height = 4 + index * 3
        return (
          <rect
            key={index}
            x={index * 4.1}
            y={16 - height}
            width='3.1'
            height={height}
            rx='1.2'
            style={{ fill: index < filled ? color : 'var(--border-strong)' }}
          />
        )
      })}
    </svg>
  )
}

/** Cuadradito de color suave con las barras de la frecuencia (para las filas de palabras). */
export function ImportanceTile({ level, size = 40 }: { level: ImportanceKey; size?: number }) {
  const colors = tone(IMPORTANCE_TONE[level])
  return (
    <span
      className='flex shrink-0 items-center justify-center rounded-2xl'
      style={{ width: size, height: size, background: colors.soft }}
      aria-hidden='true'
    >
      <ImportanceBars level={level} size={Math.round(size * 0.5)} />
    </span>
  )
}

/**
 * Selector de frecuencia: 5 bloques gruesos (3 arriba y 2 abajo) con su color.
 * El elegido se tiñe y se ve su descripción debajo.
 */
export function ImportancePicker({
  value,
  onChange,
  disabled,
  showHint = true,
}: {
  value: ImportanceKey | null
  onChange: (key: ImportanceKey) => void
  disabled?: boolean
  showHint?: boolean
}) {
  const selected = IMPORTANCE_LEVELS.find((level) => level.key === value) || null
  return (
    <div className='@container'>
      <div className='grid grid-cols-6 gap-2' role='radiogroup' aria-label={t('Frecuencia de uso')}>
        {IMPORTANCE_LEVELS.map((level, index) => {
          const active = value === level.key
          const colors = tone(IMPORTANCE_TONE[level.key])
          return (
            <button
              key={level.key}
              type='button'
              role='radio'
              aria-checked={active}
              onClick={() => onChange(level.key)}
              disabled={disabled}
              className={cn(
                'flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl lg:h-12 border-2 px-1.5 text-sm font-extrabold transition-[transform,box-shadow,background-color] active:translate-y-[3px] active:shadow-none disabled:opacity-60',
                index < 3 ? 'col-span-2' : 'col-span-3',
                active ? '' : 'border-border bg-card text-foreground dark:bg-transparent',
              )}
              style={
                active
                  ? {
                      background: colors.soft,
                      borderColor: colors.solid,
                      color: colors.ink,
                      boxShadow: `0 3px 0 ${colors.solid}`,
                    }
                  : { boxShadow: '0 3px 0 var(--border)' }
              }
            >
              {/* Si el hueco es estrecho, solo el nombre, para que quepa entero */}
              <ImportanceBars level={level.key} size={16} className='@max-[21.5rem]:hidden' />
              <span className='truncate'>{t(level.label)}</span>
            </button>
          )
        })}
      </div>
      {/* Al elegir una frecuencia no se explica debajo: el botón ya lo dice. */}
      {showHint && !selected ? (
        <p className='m-0 mt-2.5 text-xs font-semibold text-muted-foreground'>{t('Elige cuánto vas a usar esta palabra.')}</p>
      ) : null}
    </div>
  )
}
