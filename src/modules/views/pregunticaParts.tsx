import type { ReactNode } from 'react'
import { ArrowRightIcon, CheckIcon, PlusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { coinsText } from '../game/fichas'
import { FichaIcon, TrophyIcon } from '../game/icons'
import { GameProgress, Pill, SectionLabel, tone, type Tone } from '../game/ui'
import type { PregunticaFeedback, PregunticaWordSuggestion } from '../services/preguntica'

/**
 * Piezas visuales de PreguntICA (pantalla principal e historial) con el estilo "modo juego".
 * Solo pintan: la lógica sigue en las vistas.
 */

/** Tipos de palabras (modos) con su color. */
export const WORD_MODES: Array<{ key: string; label: string; tone: Tone }> = [
  { key: 'mixed', label: 'Aleatorio', tone: 'c' },
  { key: 'vital', label: 'Vital', tone: 'i' },
  { key: 'frequent', label: 'Frecuente', tone: 'ok' },
  { key: 'occasional', label: 'Ocasional', tone: 'gold' },
  { key: 'rare', label: 'Raro', tone: 'fire' },
]

/** Nombre y color de un modo (si no se conoce, se enseña tal cual en gris). */
export function wordModeMeta(mode: string): { key: string; label: string; tone: Tone } {
  const normalized = (mode || '').trim().toLowerCase()
  return WORD_MODES.find((item) => item.key === normalized) || { key: normalized, label: mode, tone: 'neutral' }
}

/** Pastilla del modo (Vital, Frecuente...) con su punto de color. */
export function ModePill({ mode, prefix }: { mode: string; prefix?: string }) {
  const meta = wordModeMeta(mode)
  return (
    <Pill tone={meta.tone}>
      <span className='size-2 rounded-full' style={{ background: tone(meta.tone).solid }} aria-hidden='true' />
      {prefix ? `${prefix} ${t(meta.label)}` : t(meta.label)}
    </Pill>
  )
}

/** Selector de tipo de palabras: pastillas grandes con canto (la elegida, teñida de su color). */
export function ModePicker({
  value,
  onChange,
  disabled,
  ariaLabel = t('Tipo de palabras'),
}: {
  value: string | null
  onChange: (mode: string) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <div className='@container'>
      <div role='radiogroup' aria-label={ariaLabel} className='grid grid-cols-2 gap-2 @md:grid-cols-4'>
        {WORD_MODES.map((option, index) => {
          const active = value === option.key
          const colors = tone(option.tone)
          return (
            <button
              key={option.key}
              type='button'
              role='radio'
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.key)}
              className={cn(
                'flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-sm font-extrabold transition-[transform,box-shadow] active:translate-y-[3px] active:shadow-none disabled:opacity-50',
                // "Aleatorio" (el de siempre) ocupa toda la fila
                index === 0 && 'col-span-2 @md:col-span-4',
                !active && 'bg-card text-muted-foreground dark:bg-transparent',
              )}
              style={
                active
                  ? { background: colors.soft, borderColor: colors.solid, color: colors.ink, boxShadow: `0 3px 0 ${colors.solid}` }
                  : { borderColor: 'var(--border)', boxShadow: '0 3px 0 var(--border)' }
              }
            >
              <span className='size-2.5 rounded-full' style={{ background: colors.solid }} aria-hidden='true' />
              {t(option.label)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Botón de precio (la moneda y lo que cuesta), igual que en ICA Coins. */
export function CoinPriceButton({
  cost,
  onClick,
  disabled,
  ariaLabel,
}: {
  cost: number
  onClick: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? t('Cuesta {coins}', { coins: coinsText(cost) })}
      className='flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-border bg-card px-3 text-base font-extrabold tabular-nums transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-50'
      style={{ boxShadow: '0 3px 0 var(--border)', color: 'var(--ica-gold-ink)' }}
    >
      <FichaIcon size={20} /> {cost}
    </button>
  )
}

/** Circulito con el número del paso (o ✓ si está hecho). */
export function StepBadge({ n, done, active }: { n: number; done?: boolean; active?: boolean }) {
  const colors = done ? tone('ok') : active ? tone('c') : tone('neutral')
  return (
    <span
      className='flex size-9 shrink-0 items-center justify-center rounded-full text-base font-black text-white tabular-nums'
      style={{
        background: done || active ? colors.solid : 'var(--muted)',
        color: done || active ? '#fff' : 'var(--muted-foreground)',
        boxShadow: done || active ? `0 3px 0 ${colors.edge}` : undefined,
      }}
      aria-hidden='true'
    >
      {done ? <CheckIcon className='size-5' strokeWidth={3} /> : n}
    </span>
  )
}

/** Nota de naturalidad en grande con la copa y la barra dorada. */
export function ScoreHero({ score, text, compact = false }: { score: number; text?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('rounded-3xl', compact ? 'px-4 py-3' : 'px-5 py-4')} style={{ background: 'var(--ica-gold-soft)' }}>
      <div className='flex items-center gap-4'>
        <TrophyIcon size={compact ? 44 : 56} />
        <div className='min-w-0 flex-1'>
          <p className='m-0 flex items-baseline gap-1'>
            <span
              className={cn('leading-none font-black tabular-nums', compact ? 'text-4xl' : 'text-5xl')}
              style={{ color: 'var(--ica-gold-ink)' }}
            >
              {score.toFixed(1)}
            </span>
            <span className='text-base font-extrabold text-muted-foreground'>/10</span>
          </p>
          <p className='m-0 mt-1 text-sm font-extrabold' style={{ color: 'var(--ica-gold-ink)' }}>
            {t('Naturalidad')}
          </p>
        </div>
      </div>
      <GameProgress value={score / 10} color='var(--ica-gold)' className='mt-3' height={12} />
      {text ? <p className='m-0 mt-3 text-sm font-semibold text-foreground/80'>{text}</p> : null}
    </div>
  )
}

/** Bloque con la transcripción de lo que dijiste. */
export function TranscriptBlock({ text, meta }: { text: string; meta?: ReactNode }) {
  return (
    <div className='rounded-2xl border-2 border-border bg-muted/40 px-4 py-3'>
      <p className='ica-label m-0'>{t('Lo que dijiste')}</p>
      <p className='m-0 mt-1.5 text-base leading-relaxed font-semibold'>{text}</p>
      {meta ? <p className='m-0 mt-1 text-xs font-bold text-muted-foreground'>{meta}</p> : null}
    </div>
  )
}

/** Palabras ICA objetivo: verdes con ✓ las que usaste. */
export function WordUsage({ usage, className }: { usage: Array<{ word: string; used: boolean }>; className?: string }) {
  if (usage.length === 0) return null
  const usedCount = usage.filter((item) => item.used).length
  return (
    <div className={className}>
      <SectionLabel right={<Pill tone={usedCount === usage.length ? 'ok' : 'neutral'}>{usedCount}/{usage.length}</Pill>}>
        {t('Palabras objetivo usadas')}
      </SectionLabel>
      <div className='flex flex-wrap gap-2'>
        {usage.map((item) => (
          <span
            key={item.word}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-extrabold',
              item.used ? '' : 'border-border text-muted-foreground',
            )}
            style={
              item.used
                ? { background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)', borderColor: 'color-mix(in oklab, var(--ica-ok) 40%, transparent)' }
                : undefined
            }
          >
            {item.used ? <CheckIcon className='size-3.5' strokeWidth={3} aria-hidden='true' /> : null}
            {item.word}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Botón redondo "+" para llevar una expresión al Baúl ICA. */
function ExtractButton({
  text,
  added,
  onClick,
}: {
  text: string
  added: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={added}
      aria-label={t('Extraer "{text}" al baul', { text })}
      className='flex size-9 shrink-0 items-center justify-center rounded-xl border-2 transition-transform active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-60'
      style={{
        background: 'var(--ica-ok-soft)',
        color: 'var(--ica-ok-ink)',
        borderColor: 'color-mix(in oklab, var(--ica-ok) 40%, transparent)',
        boxShadow: added ? undefined : '0 2px 0 color-mix(in oklab, var(--ica-ok) 40%, transparent)',
      }}
    >
      {added ? <CheckIcon className='size-4' strokeWidth={3} /> : <PlusIcon className='size-4' strokeWidth={3} />}
    </button>
  )
}

/** Correcciones: lo que dijiste tachado → cómo sonaría natural, con el motivo. */
export function CorrectionList({
  corrections,
  isSame,
  onExtract,
  isExtractAdded,
}: {
  corrections: PregunticaFeedback['corrections']
  isSame: (original: string, suggestion: string) => boolean
  onExtract: (text: string) => void
  isExtractAdded: (text: string) => boolean
}) {
  if (corrections.length === 0) return null
  return (
    <div>
      <SectionLabel>{t('Correcciones')}</SectionLabel>
      <ul className='m-0 flex list-none flex-col gap-2 p-0'>
        {corrections.map((item, index) => {
          const same = isSame(item.original, item.suggestion)
          return (
            <li key={`${item.original}-${index}`} className='flex items-start gap-3 rounded-2xl border-2 border-border bg-card px-3.5 py-3 dark:bg-transparent'>
              <div className='min-w-0 flex-1'>
                {same ? (
                  <p className='m-0 flex items-start gap-1.5 text-base leading-snug font-extrabold' style={{ color: 'var(--ica-ok-ink)' }}>
                    <CheckIcon className='mt-0.5 size-4 shrink-0' strokeWidth={3} aria-hidden='true' />
                    <span>{item.suggestion}</span>
                  </p>
                ) : (
                  <div className='flex flex-col gap-1'>
                    <p className='m-0 text-sm leading-snug font-bold line-through' style={{ color: 'var(--ica-bad-ink)' }}>
                      {item.original}
                    </p>
                    <p className='m-0 flex items-start gap-1.5 text-base leading-snug font-extrabold' style={{ color: 'var(--ica-ok-ink)' }}>
                      <ArrowRightIcon className='mt-0.5 size-4 shrink-0' strokeWidth={3} aria-hidden='true' />
                      <span>{item.suggestion}</span>
                    </p>
                  </div>
                )}
                <p className='m-0 mt-1 text-xs font-semibold text-muted-foreground'>{item.reason}</p>
              </div>
              <ExtractButton text={item.suggestion} added={isExtractAdded(item.suggestion)} onClick={() => onExtract(item.suggestion)} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** El comentario del coach, como un bocadillo morado. */
export function CoachBubble({ text }: { text: string }) {
  return (
    <div>
      <SectionLabel>{t('Comentario del coach')}</SectionLabel>
      <div
        className='relative rounded-3xl rounded-tl-lg border-2 px-4 py-3 text-base leading-relaxed font-semibold'
        style={{
          background: 'var(--ica-c-soft)',
          borderColor: 'color-mix(in oklab, var(--ica-c) 35%, transparent)',
          color: 'var(--foreground)',
        }}
      >
        {text}
      </div>
    </div>
  )
}

/** Sugerencias ICA: pastillas doradas; al tocarlas se añaden al Baúl. */
export function SuggestionChips({
  suggestions,
  isAdded,
  onPick,
}: {
  suggestions: PregunticaWordSuggestion[]
  isAdded: (word: string) => boolean
  onPick: (suggestion: PregunticaWordSuggestion) => void
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      {suggestions.map((item) => {
        const added = isAdded(item.word)
        return (
          <button
            type='button'
            key={`${item.word}-${item.reason}`}
            onClick={() => onPick(item)}
            disabled={added}
            className='inline-flex max-w-full items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 text-left text-sm transition-transform active:translate-y-[2px] disabled:cursor-not-allowed'
            style={
              added
                ? { background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)', borderColor: 'transparent' }
                : {
                    background: 'var(--ica-gold-soft)',
                    borderColor: 'color-mix(in oklab, var(--ica-gold) 55%, transparent)',
                    boxShadow: '0 2px 0 color-mix(in oklab, var(--ica-gold) 55%, transparent)',
                  }
            }
          >
            {added ? (
              <CheckIcon className='size-3.5 shrink-0' strokeWidth={3} aria-hidden='true' />
            ) : (
              <PlusIcon className='size-3.5 shrink-0' strokeWidth={3} style={{ color: 'var(--ica-gold-ink)' }} aria-hidden='true' />
            )}
            <span className='min-w-0'>
              <span className='font-extrabold'>{item.word}</span>
              {item.translation ? <span className='font-semibold text-muted-foreground'> · {item.translation}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
