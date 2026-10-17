import { TargetGlyph } from '../../game/icons'
import { t, uiLocale } from '@/i18n'

/* ══════════════════════════════════════════════════════════════════════
   Focos en escalón (Luis, 16 Oct): cuatro escalones (Explicado → Dominado)
   y la diana encima del último. Llegar a la diana es dominar el foco.
   - Reporte: azul lo que ya tenía, dorado lo ganado esa semana.
   - Tablero de cada día: Ica de pie en el último escalón subido y el
     siguiente parpadea.
   ══════════════════════════════════════════════════════════════════════ */

export type StairState = 'before' | 'gained' | 'pending' | 'next'

const PHASES_ES = ['Explicado', 'Entrenado', 'Entendido', 'Dominado'] as const
// «Entendido» is already a dictionary key with another meaning («Got it»), so the names go here.
const PHASES_EN = ['Explained', 'Trained', 'Understood', 'Mastered'] as const

export function focusPhaseName(index: number): string {
  return (uiLocale().startsWith('en') ? PHASES_EN[index] : PHASES_ES[index]) || ''
}

export function FocusStairs({
  states,
  mastered,
  showIca = false,
  compact = false,
  selected,
  onSelect,
}: {
  states: StairState[]
  /** All four steps: the target lights up. */
  mastered: boolean
  /** Daily board: Ica stands on the last step reached. */
  showIca?: boolean
  compact?: boolean
  /** Daily board: the step whose meaning is shown below. */
  selected?: number
  onSelect?: (index: number) => void
}) {
  const unit = compact ? 16 : 20
  const heights = [1, 2, 3, 4].map((n) => n * unit + 10)
  const top = compact ? 46 : 54
  const reached = states.reduce((last, state, index) => (state === 'before' || state === 'gained' ? index : last), -1)
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='relative flex items-end gap-0.5' style={{ paddingTop: top }}>
        {states.map((state, index) => {
          const color =
            state === 'gained'
              ? { bg: 'var(--ica-gold)', edge: 'var(--ica-gold-edge)', ink: '#4a3200' }
              : state === 'before'
                ? { bg: 'var(--ica-i)', edge: 'var(--ica-i-edge)', ink: '#ffffff' }
                : null
          const isTop = index === 3
          const step = (
            <div
              className={`flex items-start justify-center rounded-t-xl pt-1.5 text-xs font-black ${state === 'next' ? 'ica-attention' : ''} ${index === 0 ? 'rounded-bl-lg' : ''} ${isTop ? 'rounded-br-lg' : ''}`}
              style={{
                height: heights[index],
                background: color
                  ? color.bg
                  : state === 'next'
                    ? 'color-mix(in oklab, var(--ica-i) 14%, var(--card))'
                    : 'color-mix(in oklab, var(--muted) 70%, var(--card))',
                boxShadow: [
                  color ? `inset 0 -4px 0 ${color.edge}` : '',
                  selected === index ? '0 0 0 3px color-mix(in oklab, var(--ica-i) 35%, transparent)' : '',
                ]
                  .filter(Boolean)
                  .join(', ') || undefined,
                border: color ? undefined : `2px ${state === 'next' ? 'solid' : 'dashed'} ${state === 'next' ? 'var(--ica-i)' : 'var(--border)'}`,
                color: color ? color.ink : state === 'next' ? 'var(--ica-i-ink)' : 'var(--muted-foreground)',
              }}
            >
              {state === 'gained' ? '+1' : index + 1}
            </div>
          )
          return (
            <div key={index} className='relative flex-1'>
              {isTop ? (
                <span
                  className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${mastered ? 'ica-pop' : ''}`}
                  style={{
                    bottom: heights[index] + 2,
                    opacity: mastered ? 1 : 0.55,
                    filter: mastered ? 'drop-shadow(0 0 10px rgb(255 199 44 / 0.9))' : 'grayscale(0.35)',
                  }}
                >
                  <TargetGlyph size={compact ? 36 : 44} />
                </span>
              ) : null}
              {showIca && index === reached && !isTop ? (
                <img
                  src='/guia-ica.png'
                  alt=''
                  aria-hidden='true'
                  draggable={false}
                  className='ica-bob pointer-events-none absolute left-1/2 -translate-x-1/2 select-none'
                  style={{ bottom: heights[index] + 1, width: compact ? 28 : 32, height: 'auto' }}
                />
              ) : null}
              {onSelect ? (
                <button
                  type='button'
                  className='block w-full'
                  aria-pressed={selected === index}
                  aria-label={t('Qué significa {phase}', { phase: focusPhaseName(index) })}
                  onClick={() => onSelect(index)}
                >
                  {step}
                </button>
              ) : (
                step
              )}
            </div>
          )
        })}
      </div>
      <div className='flex gap-0.5'>
        {states.map((state, index) => (
          <span
            key={index}
            className='flex-1 text-center text-[10px] leading-tight font-black'
            style={{ color: state === 'pending' ? 'var(--muted-foreground)' : undefined }}
          >
            {focusPhaseName(index)}
          </span>
        ))}
      </div>
    </div>
  )
}
