import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon, WalletIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTile, PageTitle, Panel, SectionLabel, tone } from '../game/ui'
import {
  COST_GROUPS,
  currentMonth,
  fetchMonthCosts,
  shiftMonth,
  type CostGroup,
  type MonthCosts,
} from '../services/aiCosts'

// GASTOS DE IA (Luis, 11 Oct): super admins only. Spanish only, like the rest of the admin pages.

/** Approximate dollar to euro rate (the providers bill in dollars and the card pays in euros). */
const USD_TO_EUR = 0.88

const GROUPS: Record<CostGroup, { label: string; detail: string; color: string }> = {
  sonnet: { label: 'Claude Sonnet', detail: 'Traducciones, frases, PreguntICA y coaching', color: '#1e5fb4' },
  haiku: { label: 'Claude Haiku', detail: 'Tareas cortas: ejemplos, ortografía, pronunciación', color: '#3aaeee' },
  voice: { label: 'Voz de Gemini', detail: 'La voz premium de la app', color: '#d99a00' },
  transcription: { label: 'Transcripción (OpenAI)', detail: 'Los audios de PreguntICA', color: '#8b5cf6' },
  other: { label: 'Otros modelos', detail: 'Modelos que no están en la lista de precios', color: '#7a8796' },
}

const FEATURES: Record<string, string> = {
  translate: 'Traducir palabras (Inmersión)',
  activation_phrase: 'Frase de Creación',
  split_phrase: 'Trozos de la nota desafiante',
  pronunciation: 'Pronunciación figurada',
  word_example: 'Ejemplo de una palabra',
  spellcheck: 'Corregir ortografía',
  phrase_token_insight: 'Explicar una palabra de la frase',
  manual_phrase_suggestion: 'Revisar una frase escrita a mano',
  coaching_focus_exercise: 'Ejercicio del coaching',
  flashcard_example: 'Ejemplos de las flashcards',
  preguntica_analysis: 'Corrección de PreguntICA',
  preguntica_suggestions: 'Sugerencias de PreguntICA',
  preguntica_question: 'Traducir la pregunta de PreguntICA',
  preguntica_transcription: 'Pasar a texto el audio de PreguntICA',
  voice: 'Voz premium',
}

const euros = (usd: number) => {
  const value = usd * USD_TO_EUR
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 1 ? 3 : 2 })} €`
}
const dollars = (usd: number) =>
  `${usd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: usd > 0 && usd < 1 ? 3 : 2 })} $`
const monthName = (month: string) => {
  const label = new Date(`${month}T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function Tile({ value, label, sub }: { value: string; label: string; sub?: string | null }) {
  const colors = tone('a')
  return (
    <div className='rounded-3xl px-4 py-4' style={{ background: colors.soft }}>
      <p className='m-0 text-2xl leading-none font-black tabular-nums' style={{ color: colors.ink }}>
        {value}
      </p>
      <p className='m-0 mt-1.5 text-xs font-extrabold' style={{ color: colors.ink }}>
        {label}
      </p>
      {sub ? <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>{sub}</p> : null}
    </div>
  )
}

function compareText(costs: MonthCosts, isCurrent: boolean): string | null {
  const before = isCurrent ? costs.previousSameDaysUsd : costs.previousTotalUsd
  if (before <= 0) return null
  const change = ((costs.totalUsd - before) / before) * 100
  const rounded = Math.round(change)
  const when = isCurrent ? 'que a estas alturas del mes pasado' : 'que el mes anterior'
  if (rounded === 0) return `Igual ${when}`
  return `${rounded > 0 ? '+' : ''}${rounded} % ${when}`
}

export function AdminCostsView() {
  const thisMonth = currentMonth()
  const [month, setMonth] = useState(thisMonth)
  const [costs, setCosts] = useState<MonthCosts | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setCosts(await fetchMonthCosts(month))
    setLoading(false)
  }, [month])

  useEffect(() => {
    setCosts(undefined)
    void load()
  }, [load])

  const isCurrent = month === thisMonth
  const usedGroups = useMemo(
    () => (costs ? COST_GROUPS.filter((group) => costs.byGroup[group].costUsd > 0 || group !== 'other') : []),
    [costs],
  )
  const chartData = useMemo(
    () =>
      (costs?.days ?? []).map((day) => ({
        ...day,
        label: String(Number(day.day.slice(8, 10))),
      })),
    [costs],
  )
  const perPerson = costs && costs.people > 0 ? costs.totalUsd / costs.people : null
  const maxGroup = costs ? Math.max(...COST_GROUPS.map((group) => costs.byGroup[group].costUsd), 0) : 0

  return (
    <section className='mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='a' size={48}>
            <WalletIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle='Lo que cuestan Claude, la voz de Gemini y las transcripciones de PreguntICA.'
        right={
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='rounded-2xl'
            onClick={() => void load()}
            disabled={loading}
            aria-label='Actualizar'
          >
            <RefreshCwIcon className={loading ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
          </Button>
        }
      >
        Gastos de IA
      </PageTitle>

      <div className='flex items-center justify-between gap-3'>
        <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => setMonth(shiftMonth(month, -1))} aria-label='Mes anterior'>
          <ChevronLeftIcon className='size-5' strokeWidth={2.6} />
        </Button>
        <p className='m-0 font-display text-xl font-extrabold tracking-tight'>{monthName(month)}</p>
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='rounded-2xl'
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={isCurrent}
          aria-label='Mes siguiente'
        >
          <ChevronRightIcon className='size-5' strokeWidth={2.6} />
        </Button>
      </div>

      {costs === undefined ? (
        <div className='grid grid-cols-2 gap-3 md:grid-cols-4' aria-hidden='true'>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className='h-24 animate-pulse rounded-3xl bg-muted' />
          ))}
        </div>
      ) : costs === null ? (
        <Panel tone='bad' className='text-sm font-bold'>
          No se pudieron leer los gastos. Esta página es solo para super admins y necesita la migración de gastos de IA en el servidor.
        </Panel>
      ) : (
        <>
          <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
            <Tile value={euros(costs.totalUsd)} label={isCurrent ? 'Este mes, hasta hoy' : 'Total del mes'} sub={`${dollars(costs.totalUsd)} · ${compareText(costs, isCurrent) ?? 'sin mes anterior para comparar'}`} />
            {isCurrent ? (
              <Tile value={euros(costs.projectedUsd ?? 0)} label='Previsión a fin de mes' sub='Si sigue al mismo ritmo' />
            ) : (
              <Tile value={euros(costs.previousTotalUsd)} label='Mes anterior' sub={dollars(costs.previousTotalUsd)} />
            )}
            <Tile
              value={perPerson === null ? '–' : euros(perPerson)}
              label='Por alumno que la usó'
              sub={`${costs.people.toLocaleString('es-ES')} ${costs.people === 1 ? 'alumno' : 'alumnos'} este mes`}
            />
            {isCurrent ? <Tile value={euros(costs.todayUsd)} label='Hoy' sub='Día en hora UTC' /> : <Tile value={String(costs.days.length)} label='Días del mes' />}
          </div>

          <div>
            <SectionLabel>Por modelo</SectionLabel>
            <Panel className='flex flex-col gap-4'>
              {usedGroups.map((group) => {
                const value = costs.byGroup[group]
                const share = maxGroup > 0 ? value.costUsd / maxGroup : 0
                return (
                  <div key={group} className='flex flex-col gap-1.5'>
                    <div className='flex items-baseline justify-between gap-3'>
                      <span className='flex min-w-0 items-center gap-2'>
                        <span className='size-3 shrink-0 rounded-full' style={{ background: GROUPS[group].color }} aria-hidden='true' />
                        <span className='min-w-0'>
                          <span className='block text-sm font-extrabold'>{GROUPS[group].label}</span>
                          <span className='block text-xs font-semibold text-muted-foreground'>{GROUPS[group].detail}</span>
                        </span>
                      </span>
                      <span className='shrink-0 text-right'>
                        <span className='block text-sm font-black tabular-nums'>{euros(value.costUsd)}</span>
                        <span className='block text-xs font-semibold text-muted-foreground tabular-nums'>
                          {value.calls.toLocaleString('es-ES')} {group === 'voice' ? 'audios' : 'llamadas'}
                        </span>
                      </span>
                    </div>
                    <div className='h-2.5 overflow-hidden rounded-full bg-muted'>
                      <div className='h-full rounded-full' style={{ width: `${Math.max(share * 100, value.costUsd > 0 ? 2 : 0)}%`, background: GROUPS[group].color }} />
                    </div>
                  </div>
                )
              })}
            </Panel>
          </div>

          <div>
            <SectionLabel>Cada día</SectionLabel>
            <Panel>
              <div className='mb-3 flex flex-wrap gap-x-4 gap-y-1.5'>
                {usedGroups.map((group) => (
                  <span key={group} className='flex items-center gap-1.5 text-xs font-bold text-muted-foreground'>
                    <span className='size-2.5 rounded-full' style={{ background: GROUPS[group].color }} aria-hidden='true' />
                    {GROUPS[group].label}
                  </span>
                ))}
              </div>
              <div className='h-64 w-full'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke='var(--border)' strokeDasharray='4 6' />
                    <XAxis dataKey='label' axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} interval='preserveStartEnd' />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }}
                      tickFormatter={(value: number) => `${(value * USD_TO_EUR).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)' }}
                      formatter={(value, name) => [euros(Number(value)), GROUPS[name as CostGroup]?.label ?? String(name)]}
                      labelFormatter={(label) => `Día ${label}`}
                      contentStyle={{ borderRadius: 16, border: '2px solid var(--border)', background: 'var(--popover)', fontWeight: 700 }}
                    />
                    {usedGroups.map((group, index) => (
                      <Bar
                        key={group}
                        dataKey={group}
                        stackId='cost'
                        fill={GROUPS[group].color}
                        stroke='var(--card)'
                        strokeWidth={1}
                        radius={index === usedGroups.length - 1 ? [4, 4, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div>
            <SectionLabel>En qué se gasta</SectionLabel>
            {costs.byFeature.length === 0 ? (
              <Panel className='text-sm font-semibold text-muted-foreground'>Todavía no hay gastos guardados este mes.</Panel>
            ) : (
              <Panel className='overflow-x-auto p-0'>
                <table className='w-full min-w-[480px] text-sm'>
                  <thead>
                    <tr className='text-left text-xs font-extrabold tracking-[0.06em] text-muted-foreground uppercase'>
                      <th className='px-4 py-3'>Para qué</th>
                      <th className='px-4 py-3'>Modelo</th>
                      <th className='px-4 py-3 text-right'>Veces</th>
                      <th className='px-4 py-3 text-right'>Coste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.byFeature.map((item) => (
                      <tr key={`${item.group}:${item.feature}`} className='border-t-2 border-border'>
                        <td className='px-4 py-2.5 font-bold'>{FEATURES[item.feature] ?? item.feature}</td>
                        <td className='px-4 py-2.5'>
                          <span className='flex items-center gap-1.5 font-semibold text-muted-foreground'>
                            <span className='size-2.5 rounded-full' style={{ background: GROUPS[item.group].color }} aria-hidden='true' />
                            {GROUPS[item.group].label}
                          </span>
                        </td>
                        <td className='px-4 py-2.5 text-right font-semibold tabular-nums'>{item.calls.toLocaleString('es-ES')}</td>
                        <td className='px-4 py-2.5 text-right font-black tabular-nums'>{euros(item.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>

          <p className='m-0 text-xs font-semibold text-muted-foreground'>
            Precio estimado con la lista de precios de cada proveedor y pasado a euros a {USD_TO_EUR.toLocaleString('es-ES')} € el dólar. La factura real puede variar un poco. Claude y las transcripciones se cuentan desde que se instaló esta página; la voz de Gemini, desde el 6 de octubre. Los días van en hora UTC.
          </p>
        </>
      )}
    </section>
  )
}
