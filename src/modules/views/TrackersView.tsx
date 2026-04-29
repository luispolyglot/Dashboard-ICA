import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, SearchIcon, Trash2Icon, TrendingUpIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  pronunciation: '#16a34a',
  fluency: '#2563eb',
  improvisation: '#f97316',
} as const

function monthLabelShort(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-ES', {
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
        if (mounted) setError('No pudimos cargar tu histórico de trackers.')
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
      setError('No pudimos eliminar el tracker. Inténtalo de nuevo.')
    } finally {
      setDeletingTrackerId(null)
    }
  }

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Trackers de mejora</h2>
          <p className='text-sm text-muted-foreground'>
            Revisa tu progreso mensual en pronunciación, fluidez e improvisación.
          </p>
        </div>
        <Button asChild>
          <Link to={DASHBOARD_ROUTES.trackersNew}>
            <PlusIcon data-icon='inline-start' />
            Nuevo tracker
          </Link>
        </Button>
      </div>

      {isLoading && <p className='text-sm text-muted-foreground'>Cargando trackers...</p>}
      {error && <p className='text-sm text-destructive'>{error}</p>}

      {!isLoading && !error && trackers.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aun no tienes trackers</CardTitle>
            <CardDescription>
              Crea el primero para empezar a registrar tu evolución mensual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={DASHBOARD_ROUTES.trackersNew}>
                <PlusIcon data-icon='inline-start' />
                Crear tracker
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && trackers.length > 0 && (
        <div className='flex flex-col gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Histórico mensual</CardTitle>
              <CardDescription>
                Cada ítem te permite abrir, editar o eliminar el tracker mensual.
              </CardDescription>
            </CardHeader>
            <CardContent className='flex max-h-100 flex-col gap-3 overflow-y-auto'>
              {trackers.map((tracker) => (
                <div
                  key={tracker.id}
                  className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3'
                >
                  <div>
                    <p className='font-medium capitalize'>{getTrackerMonthLabel(tracker.trackerMonth)}</p>
                    <p className='text-sm text-muted-foreground'>
                      Pronunciación {tracker.pronunciationPct.toFixed(1)}% · Fluidez{' '}
                      {tracker.fluencyPct.toFixed(1)}% · Improvisación{' '}
                      {tracker.improvisationPct.toFixed(1)}%
                    </p>
                  </div>

                  <div className='flex items-center gap-2'>
                    <Button type='button' variant='outline' size='icon' asChild>
                      <Link
                        to={`${DASHBOARD_ROUTES.trackers}/${tracker.id}`}
                        aria-label='Ver o editar tracker'
                      >
                        <SearchIcon />
                      </Link>
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      aria-label='Eliminar tracker'
                      disabled={deletingTrackerId === tracker.id}
                      onClick={() => setTrackerToDelete(tracker)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {trackers.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <TrendingUpIcon />
                  Evolución en el tiempo
                </CardTitle>
                <CardDescription>
                  Incluye todos los meses intermedios, incluso los que aún no tienen tracker.
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                <div className='h-80 w-full'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart data={trendData} margin={{ top: 10, right: 20, left: 8, bottom: 8 }}>
                      <XAxis dataKey='monthLabel' />
                      <YAxis domain={[0, 100]} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                      <Line
                        type='monotone'
                        dataKey='pronunciation'
                        name='Pronunciación'
                        stroke={TREND_COLORS.pronunciation}
                        strokeWidth={2.25}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type='monotone'
                        dataKey='fluency'
                        name='Fluidez'
                        stroke={TREND_COLORS.fluency}
                        strokeWidth={2.25}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type='monotone'
                        dataKey='improvisation'
                        name='Improvisación'
                        stroke={TREND_COLORS.improvisation}
                        strokeWidth={2.25}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className='flex flex-wrap items-center gap-4 text-sm'>
                  <div className='flex items-center gap-2'>
                    <span
                      className='inline-block size-3 rounded-full'
                      style={{ backgroundColor: TREND_COLORS.pronunciation }}
                    />
                    <span>Pronunciación</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span
                      className='inline-block size-3 rounded-full'
                      style={{ backgroundColor: TREND_COLORS.fluency }}
                    />
                    <span>Fluidez</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span
                      className='inline-block size-3 rounded-full'
                      style={{ backgroundColor: TREND_COLORS.improvisation }}
                    />
                    <span>Improvisación</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={trackerToDelete !== null} onOpenChange={(open) => !open && setTrackerToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar tracker mensual</DialogTitle>
            <DialogDescription>
              {trackerToDelete
                ? `Se eliminará el tracker de ${getTrackerMonthLabel(trackerToDelete.trackerMonth)}. Esta acción no se puede deshacer.`
                : 'Esta acción no se puede deshacer.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setTrackerToDelete(null)}
              disabled={Boolean(deletingTrackerId)}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => void handleDelete()}
              disabled={Boolean(deletingTrackerId)}
            >
              {deletingTrackerId ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
