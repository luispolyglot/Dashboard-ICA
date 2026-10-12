import type { CSSProperties, ReactNode } from 'react'
import { t } from '@/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { tone, type Tone } from '../../game/ui'

/** Las tres habilidades del tracker, con su color de siempre. */
export const TRACKER_SKILLS: Array<{ key: 'pronunciation' | 'fluency' | 'improvisation'; label: string; tone: Tone }> = [
  { key: 'pronunciation', label: 'Pronunciación', tone: 'ok' },
  { key: 'fluency', label: 'Fluidez', tone: 'i' },
  { key: 'improvisation', label: 'Improvisación', tone: 'fire' },
]

/** Un porcentaje: número grande que se puede escribir y una barra para deslizar. */
export function TrackerMetricField({
  id,
  label,
  toneKey,
  value,
  onChange,
}: {
  id: string
  label: string
  toneKey: Tone
  value: number
  onChange: (value: number) => void
}) {
  const colors = tone(toneKey)
  const clamp = (next: number) => Math.max(0, Math.min(100, Number.isFinite(next) ? next : 0))
  return (
    <div className='rounded-2xl px-3.5 py-3' style={{ background: colors.soft }}>
      <div className='flex items-center justify-between gap-3'>
        <label htmlFor={id} className='text-sm font-extrabold' style={{ color: colors.ink }}>
          {label}
        </label>
        <span className='flex items-center gap-1'>
          <input
            id={id}
            type='number'
            inputMode='decimal'
            min={0}
            max={100}
            step='0.1'
            value={value}
            onChange={(event) => onChange(clamp(Number(event.target.value)))}
            className='h-10 w-20 rounded-xl border-2 border-border bg-card px-2 text-right text-lg font-black tabular-nums outline-none focus-visible:border-[var(--ring)]'
          />
          <span className='text-sm font-extrabold' style={{ color: colors.ink }}>
            %
          </span>
        </span>
      </div>
      <input
        type='range'
        min={0}
        max={100}
        step={0.1}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        aria-label={label}
        className='ica-range mt-3 w-full cursor-pointer'
        style={{ '--range-color': colors.solid, '--range-pct': `${value}%` } as CSSProperties}
      />
    </div>
  )
}

/** Mes y año del tracker. */
export function TrackerMonthPicker({
  idPrefix,
  year,
  month,
  yearOptions,
  monthOptions,
  onYearChange,
  onMonthChange,
}: {
  idPrefix: string
  year: number
  month: number
  yearOptions: number[]
  monthOptions: Array<{ value: number; label: string }>
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
}) {
  return (
    <div className='grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2'>
      <Field label={t('Mes')} htmlFor={`${idPrefix}-month`}>
        <Select value={String(month)} onValueChange={(value) => onMonthChange(Number(value))}>
          <SelectTrigger id={`${idPrefix}-month`} className='h-12 w-full rounded-2xl text-base'>
            <SelectValue placeholder={t('Mes')} />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('Año')} htmlFor={`${idPrefix}-year`}>
        <Select value={String(year)} onValueChange={(value) => onYearChange(Number(value))}>
          <SelectTrigger id={`${idPrefix}-year`} className='h-12 w-full rounded-2xl text-base'>
            <SelectValue placeholder={t('Año')} />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <label htmlFor={htmlFor} className='ica-label'>
        {label}
      </label>
      {children}
    </div>
  )
}

/** Aviso pequeño de color (error, éxito o advertencia). */
export function TrackerNotice({ kind, children }: { kind: 'bad' | 'ok' | 'gold'; children: ReactNode }) {
  const colors = tone(kind)
  return (
    <p className='m-0 rounded-xl px-3 py-2 text-sm font-bold' style={{ background: colors.soft, color: colors.ink }} role={kind === 'bad' ? 'alert' : undefined}>
      {children}
    </p>
  )
}
