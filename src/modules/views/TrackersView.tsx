import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, SearchIcon, TrendingUpIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/auth/AuthContext'
import { TrackerChartPreview } from '../components/Trackers/TrackerChartPreview'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  getTrackerMonthLabel,
  listImprovementTrackers,
} from '../services/trackers'
import type { ImprovementTracker } from '../types'

type TrackersViewProps = {
  targetLang: string
  nativeLang: string
}

function monthLabelShort(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-ES', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

export function TrackersView({ targetLang, nativeLang }: TrackersViewProps) {
  const { user } = useAuth()
  const [trackers, setTrackers] = useState<ImprovementTracker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTracker, setSelectedTracker] =
    useState<ImprovementTracker | null>(null)

  const displayName =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuario'

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

  const trendData = useMemo(
    () =>
      trackers
        .slice()
        .sort((a, b) => a.trackerMonth.localeCompare(b.trackerMonth))
        .map((tracker) => ({
          month: monthLabelShort(tracker.trackerMonth),
          pronunciation: tracker.pronunciationPct,
          fluency: tracker.fluencyPct,
          improvisation: tracker.improvisationPct,
        })),
    [trackers],
  )

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Trackers de mejora</h2>
          <p className='text-sm text-muted-foreground'>
            Revisa tu progreso mensual en pronunciación, fluidez e
            improvisación.
          </p>
        </div>
        <Button asChild>
          <Link to={DASHBOARD_ROUTES.trackersNew}>
            <PlusIcon data-icon='inline-start' />
            Nuevo tracker
          </Link>
        </Button>
      </div>

      {isLoading && (
        <p className='text-sm text-muted-foreground'>Cargando trackers...</p>
      )}
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

      {!isLoading && !error && trackers.length > 0 && (
        <div className='flex flex-col gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Histórico mensual</CardTitle>
              <CardDescription>
                Un item por cada mes cargado. Usa la lupa para ver la gráfica
                completa.
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 overflow-y-auto max-h-100'>
              {trackers.map((tracker) => (
                <div
                  key={tracker.id}
                  className='relative flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3'
                >
                  <div>
                    <p className='font-medium capitalize'>
                      {getTrackerMonthLabel(tracker.trackerMonth)}
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      Pronunciación {tracker.pronunciationPct.toFixed(1)}% ·
                      Fluidez {tracker.fluencyPct.toFixed(1)}% · Improvisación{' '}
                      {tracker.improvisationPct.toFixed(1)}%
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='absolute top-1 lg:top-4 right-1 lg:right-4'
                    onClick={() => setSelectedTracker(tracker)}
                    aria-label='Ver gráfica del tracker'
                  >
                    <SearchIcon />
                  </Button>
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
                  Compara mes a mes las tres dimensiones de tu mejora.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-80 w-full'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart
                      data={trendData}
                      margin={{ top: 10, right: 20, left: 8, bottom: 8 }}
                    >
                      <XAxis dataKey='month' />
                      <YAxis domain={[0, 100]} />
                      <Tooltip
                        formatter={(value) => `${Number(value).toFixed(1)}%`}
                      />
                      <Line
                        type='monotone'
                        dataKey='pronunciation'
                        name='Pronunciación'
                        stroke='#16a34a'
                        strokeWidth={2.25}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type='monotone'
                        dataKey='fluency'
                        name='Fluidez'
                        stroke='#2563eb'
                        strokeWidth={2.25}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type='monotone'
                        dataKey='improvisation'
                        name='Improvisación'
                        stroke='#f97316'
                        strokeWidth={2.25}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={selectedTracker !== null}
        onOpenChange={(open) => !open && setSelectedTracker(null)}
      >
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Gráfica del tracker</DialogTitle>
            <DialogDescription>
              {selectedTracker
                ? `Detalle de ${getTrackerMonthLabel(selectedTracker.trackerMonth)}.`
                : 'Detalle del tracker.'}
            </DialogDescription>
          </DialogHeader>

          {selectedTracker && (
            <TrackerChartPreview
              ownerName={displayName}
              monthLabel={getTrackerMonthLabel(selectedTracker.trackerMonth)}
              pronunciationPct={selectedTracker.pronunciationPct}
              fluencyPct={selectedTracker.fluencyPct}
              improvisationPct={selectedTracker.improvisationPct}
              downloadFileName={`tracker-${selectedTracker.trackerMonth}.png`}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
