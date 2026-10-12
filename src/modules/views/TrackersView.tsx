import { t, uiLocale } from '@/i18n'
import { useEffect, useMemo, useState } from 'react'
import { CalendarIcon, LineChartIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  deleteImprovementTracker,
  getTrackerMonthLabel,
  listImprovementTrackers,
} from '../services/trackers'
import type { ImprovementTracker } from '../types'
import { EmptyState, GamePage, IconTile, PageTitle, RowGroup, SectionLabel } from '../game/ui'

type TrackersViewProps = {
  targetLang: string
  nativeLang: string
}

type TrendPoint = {
  month: string
  monthLabel: string
  pronunciation: number | null
  fluency: number | null
  improvisation: number | null
}

const TREND_COLORS = {
  pronunciation: 'var(--ica-ok)',
  fluency: 'var(--ica-i)',
  improvisation: 'var(--ica-fire)',
} as const

function monthLabelShort(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(uiLocale(), {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

function monthSequence(startMonth: string, endMonth: string): string[] {
  const result: string[] = []
  const start = new Date(`${startMonth}T00:00:00Z`)
  const end = new Date(`${endMonth}T00:00:00Z`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return result

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const max = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))

  while (cursor <= max) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return result
}

export function TrackersView({ targetLang, nativeLang }: TrackersViewProps) {
  const [trackers, setTrackers] = useState<ImprovementTracker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingTrackerId, setDeletingTrackerId] = useState<string | null>(null)
  const [trackerToDelete, setTrackerToDelete] = useState<ImprovementTracker | null>(null)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await listImprovementTrackers(targetLang, nativeLang)
        if (mounted) setTrackers(data)
      } catch {
        if (mounted) setError(t('No pudimos cargar tu histórico de trackers.'))
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void run()

    return () => {
      mounted = false
    }
  }, [nativeLang, targetLang])

  const trendData = useMemo<TrendPoint[]>(() => {
    if (trackers.length < 2) return []

    const sorted = trackers.slice().sort((a, b) => a.trackerMonth.localeCompare(b.trackerMonth))
    const firstMonth = sorted[0]?.trackerMonth
    const lastMonth = sorted[sorted.length - 1]?.trackerMonth
    if (!firstMonth || !lastMonth) return []

    const trackerMap = new Map(sorted.map((tracker) => [tracker.trackerMonth, tracker]))
    return monthSequence(firstMonth, lastMonth).map((month) => {
      const tracker = trackerMap.get(month)
      return {
        month,
        monthLabel: monthLabelShort(month),
        pronunciation: tracker ? tracker.pronunciationPct : null,
        fluency: tracker ? tracker.fluencyPct : null,
        improvisation: tracker ? tracker.improvisationPct : null,
      }
    })
  }, [trackers])

  const handleDelete = async () => {
    if (!trackerToDelete) return
    if (deletingTrackerId) return

    setError(null)
    setDeletingTrackerId(trackerToDelete.id)

    try {
      await deleteImprovementTracker(trackerToDelete.id, targetLang, nativeLang)
      setTrackers((prev) => prev.filter((entry) => entry.id !== trackerToDelete.id))
      setTrackerToDelete(null)
    } catch {
      setError(t('No pudimos eliminar el tracker. Inténtalo de nuevo.'))
    } finally {
      setDeletingTrackerId(null)
    }
  }

  const sortedDesc = trackers.slice().sort((a, b) => b.trackerMonth.localeCompare(a.trackerMonth))
  const latest = sortedDesc[0] ?? null
  const previous = sortedDesc[1] ?? null
  const skills: Array<{ key: SkillKey; label: string; color: string }> = [
    { key: 'pronunciationPct', label: t('Pronunciación'), color: TREND_COLORS.pronunciation },
    { key: 'fluencyPct', label: t('Fluidez'), color: TREND_COLORS.fluency },
    { key: 'improvisationPct', label: t('Improvisación'), color: TREND_COLORS.improvisation },
  ]

  return (
    <GamePage wide className='gap-6 lg:max-w-4xl'>
      <PageTitle
        icon={
          <IconTile tone='i' size={48} solid>
            <LineChartIcon className='size-6' strokeWidth={2.6} aria-hidden='true' />
          </IconTile>
        }
        subtitle={t('Tu pronunciación, fluidez e improvisación, mes a mes.')}
        right={
          <Button asChild variant='i' className='rounded-2xl font-extrabold'>
            <Link to={DASHBOARD_ROUTES.trackersNew}>
              <PlusIcon className='size-4' strokeWidth={3} aria-hidden='true' />
              <span className='hidden sm:inline'>{t('Nuevo tracker')}</span>
              <span className='sm:hidden'>{t('Nuevo')}</span>
            </Link>
          </Button>
        }
      >
        {t('Trackers')}
      </PageTitle>

      {isLoading ? <div className='h-40 animate-pulse rounded-3xl bg-muted' aria-hidden='true' /> : null}
      {error ? (
        <p className='m-0 rounded-2xl px-3 py-2 text-sm font-bold' style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}>
          {error}
        </p>
      ) : null}

      {!isLoading && !error && trackers.length === 0 ? (
        <EmptyState
          icon={
            <IconTile tone='i' size={72}>
              <LineChartIcon className='size-9' strokeWidth={2.4} aria-hidden='true' />
            </IconTile>
          }
          title={t('Aún no tienes trackers')}
          text={t('Crea el primero para ver cómo mejoras cada mes.')}
          action={
            <Button asChild variant='i' size='xl'>
              <Link to={DASHBOARD_ROUTES.trackersNew}>
                <PlusIcon className='size-5' strokeWidth={3} aria-hidden='true' />
                {t('Crear mi primer tracker')}
              </Link>
            </Button>
          }
        />
      ) : null}

      {!isLoading && latest ? (
        <>
          {/* El último mes, en grande */}
          <Link to={`${DASHBOARD_ROUTES.trackers}/${latest.id}`} className='ica-panel ica-press block px-4 py-5'>
            <div className='mb-4 flex items-center justify-between gap-2'>
              <span className='ica-label'>{t('Tu último mes')}</span>
              <span className='text-sm font-extrabold text-muted-foreground'>
                {getTrackerMonthLabel(latest.trackerMonth)}
              </span>
            </div>
            <div className='grid grid-cols-3 gap-2'>
              {skills.map((skill) => {
                const value = latest[skill.key]
                const delta = previous ? value - previous[skill.key] : null
                return (
                  <div key={skill.key} className='flex flex-col items-center gap-1.5 text-center'>
                    <SkillRing value={value} color={skill.color} />
                    <span className='text-xs font-extrabold sm:text-sm'>{skill.label}</span>
                    {delta !== null && Math.abs(delta) >= 0.05 ? (
                      <span
                        className='inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums'
                        style={
                          delta > 0
                            ? { background: 'var(--ica-ok-soft)', color: 'var(--ica-ok-ink)' }
                            : { background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }
                        }
                      >
                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </Link>

          {/* Evolución */}
          {trackers.length >= 2 ? (
            <div>
              <SectionLabel>{t('Evolución')}</SectionLabel>
              <div className='ica-panel px-2 pt-4 pb-3'>
                <div className='h-64 w-full sm:h-72'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart data={trendData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke='var(--border)' strokeDasharray='4 6' />
                      <XAxis
                        dataKey='monthLabel'
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 700 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 700 }}
                      />
                      <Tooltip
                        formatter={(value) => `${Number(value).toFixed(1)}%`}
                        contentStyle={{
                          borderRadius: 16,
                          border: '2px solid var(--border)',
                          background: 'var(--popover)',
                          fontWeight: 700,
                        }}
                      />
                      {skills.map((skill, index) => (
                        <Line
                          key={skill.key}
                          type='monotone'
                          dataKey={['pronunciation', 'fluency', 'improvisation'][index]}
                          name={skill.label}
                          stroke={skill.color}
                          strokeWidth={3.5}
                          dot={{ r: 4, strokeWidth: 0, fill: skill.color }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className='mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-extrabold'>
                  {skills.map((skill) => (
                    <span key={skill.key} className='flex items-center gap-1.5'>
                      <span className='inline-block size-3 rounded-full' style={{ background: skill.color }} />
                      {skill.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Todos los meses */}
          <div>
            <SectionLabel>{t('Todos los meses')}</SectionLabel>
            <RowGroup>
              {sortedDesc.map((tracker) => (
                <div key={tracker.id} className='flex items-center gap-2 py-3'>
                  <Link
                    to={`${DASHBOARD_ROUTES.trackers}/${tracker.id}`}
                    className='flex min-w-0 flex-1 items-center gap-3 transition-opacity active:opacity-70'
                    aria-label={t('Ver o editar tracker')}
                  >
                    <IconTile tone='i' size={44}>
                      <CalendarIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
                    </IconTile>
                    <span className='min-w-0 flex-1'>
                      <span className='block leading-tight font-extrabold'>
                        {getTrackerMonthLabel(tracker.trackerMonth)}
                      </span>
                      <span className='mt-1.5 flex gap-1.5'>
                        {skills.map((skill) => (
                          <span key={skill.key} className='flex min-w-0 flex-1 flex-col gap-0.5'>
                            <span className='h-2 overflow-hidden rounded-full bg-muted'>
                              <span
                                className='block h-full rounded-full'
                                style={{ width: `${Math.max(3, tracker[skill.key])}%`, background: skill.color }}
                              />
                            </span>
                            <span className='text-[10px] font-extrabold text-muted-foreground tabular-nums'>
                              {Math.round(tracker[skill.key])}%
                            </span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </Link>
                  <button
                    type='button'
                    aria-label={t('Eliminar tracker')}
                    disabled={deletingTrackerId === tracker.id}
                    onClick={() => setTrackerToDelete(tracker)}
                    className='flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--ica-bad-ink)] disabled:opacity-50'
                  >
                    <Trash2Icon className='size-4.5' strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </RowGroup>
          </div>
        </>
      ) : null}

      <Dialog open={trackerToDelete !== null} onOpenChange={(open) => !open && setTrackerToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Eliminar tracker mensual')}</DialogTitle>
            <DialogDescription>
              {trackerToDelete
                ? t('Se eliminará el tracker de {month}. Esta acción no se puede deshacer.', {
                    month: getTrackerMonthLabel(trackerToDelete.trackerMonth),
                  })
                : t('Esta acción no se puede deshacer.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setTrackerToDelete(null)}
              disabled={Boolean(deletingTrackerId)}
            >
              {t('Cancelar')}
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => void handleDelete()}
              disabled={Boolean(deletingTrackerId)}
            >
              {deletingTrackerId ? t('Eliminando...') : t('Eliminar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GamePage>
  )
}

type SkillKey = 'pronunciationPct' | 'fluencyPct' | 'improvisationPct'

/** Anillo de progreso con el porcentaje en el centro. */
function SkillRing({ value, color }: { value: number; color: string }) {
  const size = 84
  const stroke = 9
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <span className='relative inline-flex' style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden='true'>
        <circle cx={size / 2} cy={size / 2} r={r} fill='none' stroke='var(--muted)' strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill='none'
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className='absolute inset-0 flex items-center justify-center text-lg font-black tabular-nums'>
        {Math.round(pct)}
        <span className='text-xs font-extrabold text-muted-foreground'>%</span>
      </span>
    </span>
  )
}
