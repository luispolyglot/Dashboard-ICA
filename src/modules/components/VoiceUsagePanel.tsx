import { useCallback, useEffect, useState } from 'react'
import { AudioLinesIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTile, Panel, SectionLabel, tone } from '../game/ui'
import { fetchVoiceUsage, type VoiceUsage } from '../services/voiceUsage'

// Admin panel card: what the premium voice (Gemini) has cost, today, this month and in total.
// Spanish only, like the rest of the admin analytics page.

/** Approximate dollar to euro rate (Google charges the card in euros at its own daily rate). */
const USD_TO_EUR = 0.88

const euros = (usd: number) => {
  const value = usd * USD_TO_EUR
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 3 : 2 })} €`
}
const dollars = (usd: number) =>
  `${usd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 3 : 2 })} $`
const minutes = (seconds: number) => {
  const value = seconds / 60
  return value < 10 ? value.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : Math.round(value).toLocaleString('es-ES')
}
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')

function Stat({ value, label }: { value: string; label: string }) {
  const colors = tone('a')
  return (
    <div className='rounded-2xl px-3 py-3' style={{ background: colors.soft }}>
      <p className='m-0 text-xl leading-none font-black tabular-nums' style={{ color: colors.ink }}>
        {value}
      </p>
      <p className='m-0 mt-1 text-xs font-bold' style={{ color: colors.ink }}>
        {label}
      </p>
    </div>
  )
}

export function VoiceUsagePanel() {
  const [usage, setUsage] = useState<VoiceUsage | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setUsage(await fetchVoiceUsage())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const right = (
    <Button type='button' variant='ghost' size='sm' onClick={() => void load()} disabled={loading} aria-label='Actualizar el gasto de la voz'>
      <RefreshCwIcon className={loading ? 'size-4 animate-spin' : 'size-4'} strokeWidth={2.5} />
    </Button>
  )

  if (usage === undefined) {
    return (
      <div>
        <SectionLabel>Voz premium (Gemini)</SectionLabel>
        <div className='h-40 animate-pulse rounded-3xl bg-muted' aria-hidden='true' />
      </div>
    )
  }

  if (usage === null) {
    return (
      <div>
        <SectionLabel>Voz premium (Gemini)</SectionLabel>
        <Panel>
          <p className='m-0 text-sm font-semibold text-muted-foreground'>
            La voz premium todavía no está en icademy.app. Cuando lo esté, aquí verás cuánto se gasta cada día y cada mes.
          </p>
        </Panel>
      </div>
    )
  }

  const maxCost = Math.max(...usage.days.map((day) => day.costUsd), 0.0001)
  return (
    <div>
      <SectionLabel right={right}>Voz premium (Gemini)</SectionLabel>
      <Panel>
        {!usage.enabled ? (
          <p className='m-0 mb-3 text-sm font-bold text-destructive'>
            Falta la clave: pon GEMINI_API_KEY en el archivo .env.local de la copia local.
          </p>
        ) : null}
        <div className='flex items-center gap-3'>
          <IconTile tone='a' size={48}>
            <AudioLinesIcon className='size-6' strokeWidth={2.5} />
          </IconTile>
          <div className='min-w-0 flex-1'>
            <p className='m-0 text-xs font-bold text-muted-foreground'>Gastado este mes</p>
            <p className='m-0 text-3xl leading-none font-black tabular-nums'>{euros(usage.month.costUsd)}</p>
            <p className='m-0 mt-1 text-xs font-semibold text-muted-foreground'>
              {dollars(usage.month.costUsd)} · hoy {euros(usage.today.costUsd)} · en total {euros(usage.all.costUsd)}
            </p>
          </div>
        </div>

        <div className='mt-4 grid grid-cols-2 gap-2 md:grid-cols-4'>
          <Stat value={usage.month.generated.toLocaleString('es-ES')} label='Audios creados este mes' />
          <Stat value={minutes(usage.month.seconds)} label='Minutos de voz creados' />
          <Stat value={usage.month.reused.toLocaleString('es-ES')} label='Escuchas repetidas (gratis)' />
          <Stat value={usage.today.generated.toLocaleString('es-ES')} label='Audios creados hoy' />
        </div>

        <p className='m-0 mt-5 mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>Últimos 14 días</p>
        <div className='flex h-28 items-end gap-1.5' role='img' aria-label='Gasto de la voz en los últimos 14 días'>
          {usage.days.map((day) => {
            const height = day.costUsd > 0 ? Math.max(6, Math.round((day.costUsd / maxCost) * 100)) : 4
            return (
              <div key={day.day} className='flex h-full min-w-0 flex-1 flex-col items-center justify-end'>
                <div
                  className='w-full rounded-t-lg rounded-b-sm'
                  style={{
                    height: `${height}%`,
                    background: day.costUsd > 0 ? 'var(--ica-a)' : 'var(--muted)',
                    boxShadow: day.costUsd > 0 ? '0 3px 0 var(--ica-a-edge)' : undefined,
                  }}
                />
              </div>
            )
          })}
        </div>
        <div className='mt-2 flex justify-between text-[11px] font-bold text-muted-foreground'>
          <span>{usage.days[0] ? dayLabel(usage.days[0].day) : ''}</span>
          <span>{usage.days.length ? dayLabel(usage.days[usage.days.length - 1].day) : ''}</span>
        </div>

        <p className='m-0 mt-4 text-xs font-semibold text-muted-foreground'>
          Cada audio se paga una sola vez: escucharlo otra vez no cuesta nada. Precio de Google:{' '}
          {usage.prices.inputPerMillionUsd.toLocaleString('es-ES')} $ por millón de tokens de texto y {usage.prices.outputPerMillionUsd.toLocaleString('es-ES')} $ por millón de
          tokens de audio (unos 25 tokens por segundo de voz); desde el 1 de enero de 2027, el doble. Los euros son aproximados.
          Esto cuenta la voz de la copia local; el saldo que te queda lo ves en Google AI Studio, en «Gasto».
        </p>
      </Panel>
    </div>
  )
}
