import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trash2Icon } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/auth/AuthContext'
import { TrackerChartPreview } from '../components/Trackers/TrackerChartPreview'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  TRACKERS_MIN_MONTH,
  TRACKERS_MIN_YEAR,
  buildTrackerMonthDate,
  deleteImprovementTracker,
  getImprovementTrackerById,
  getTrackerMonthLabel,
  getTrackerUpdateErrorMessage,
  isTrackerMonthWithinRange,
  listImprovementTrackers,
  updateImprovementTracker,
} from '../services/trackers'

type TrackerDetailViewProps = {
  trackerId: string
  targetLang: string
  nativeLang: string
}

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function TrackerDetailView({ trackerId, targetLang, nativeLang }: TrackerDetailViewProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const currentDate = useMemo(() => new Date(), [])
  const currentYear = currentDate.getUTCFullYear()
  const currentMonth = currentDate.getUTCMonth() + 1

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [pronunciationPct, setPronunciationPct] = useState(0)
  const [fluencyPct, setFluencyPct] = useState(0)
  const [improvisationPct, setImprovisationPct] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [trackerMonthSource, setTrackerMonthSource] = useState('')
  const [usedMonths, setUsedMonths] = useState<Set<string>>(new Set())
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const ownerName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuario'

  const yearOptions = useMemo(
    () => Array.from({ length: currentYear - TRACKERS_MIN_YEAR + 1 }, (_, index) => TRACKERS_MIN_YEAR + index),
    [currentYear],
  )

  const monthOptions = useMemo(() => {
    const startMonth = selectedYear === TRACKERS_MIN_YEAR ? TRACKERS_MIN_MONTH : 1
    const endMonth = selectedYear === currentYear ? currentMonth : 12

    return Array.from({ length: endMonth - startMonth + 1 }, (_, index) => {
      const month = startMonth + index
      return {
        value: month,
        label: MONTH_LABELS[month - 1],
      }
    })
  }, [currentMonth, currentYear, selectedYear])

  const trackerMonth = useMemo(
    () => buildTrackerMonthDate(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  )

  const trackerMonthLabel = useMemo(() => getTrackerMonthLabel(trackerMonth), [trackerMonth])

  const isMonthTakenByOtherTracker = useMemo(() => {
    if (trackerMonth === trackerMonthSource) return false
    return usedMonths.has(trackerMonth)
  }, [trackerMonth, trackerMonthSource, usedMonths])

  useEffect(() => {
    if (!monthOptions.some((option) => option.value === selectedMonth)) {
      setSelectedMonth(monthOptions[0]?.value ?? TRACKERS_MIN_MONTH)
    }
  }, [monthOptions, selectedMonth])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [tracker, allTrackers] = await Promise.all([
          getImprovementTrackerById(trackerId, targetLang, nativeLang),
          listImprovementTrackers(targetLang, nativeLang),
        ])

        if (!mounted) return
        if (!tracker) {
          setError('No encontramos el tracker solicitado.')
          setIsLoading(false)
          return
        }

        const [year, month] = tracker.trackerMonth.split('-').map((part) => Number(part))
        setSelectedYear(year)
        setSelectedMonth(month)
        setPronunciationPct(tracker.pronunciationPct)
        setFluencyPct(tracker.fluencyPct)
        setImprovisationPct(tracker.improvisationPct)
        setTrackerMonthSource(tracker.trackerMonth)
        setUsedMonths(new Set(allTrackers.map((entry) => entry.trackerMonth)))
      } catch {
        if (mounted) setError('No pudimos cargar el tracker.')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [nativeLang, targetLang, trackerId])

  const handleSave = async () => {
    if (isSaving || isDeleting) return
    setError(null)
    setSuccess(null)

    if (!isTrackerMonthWithinRange(selectedYear, selectedMonth, currentDate)) {
      setError('El mes elegido está fuera del rango permitido.')
      return
    }

    if (isMonthTakenByOtherTracker) {
      setError('Ya existe otro tracker para ese mes.')
      return
    }

    setIsSaving(true)
    try {
      const previousMonth = trackerMonthSource
      const updated = await updateImprovementTracker(trackerId, {
        targetLang,
        nativeLang,
        trackerMonth,
        pronunciationPct,
        fluencyPct,
        improvisationPct,
      })
      setUsedMonths((prev) => {
        const next = new Set(prev)
        if (previousMonth) next.delete(previousMonth)
        next.add(updated.trackerMonth)
        return next
      })
      setTrackerMonthSource(updated.trackerMonth)
      setSuccess('Tracker actualizado correctamente.')
    } catch (updateError) {
      setError(getTrackerUpdateErrorMessage(updateError))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (isDeleting || isSaving) return

    setError(null)
    setSuccess(null)
    setIsDeleting(true)

    try {
      await deleteImprovementTracker(trackerId, targetLang, nativeLang)
      navigate(DASHBOARD_ROUTES.trackers)
    } catch {
      setError('No pudimos eliminar el tracker. Inténtalo de nuevo.')
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <p className='text-sm text-muted-foreground'>Cargando tracker...</p>
  }

  if (error && !trackerMonthSource) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tracker no disponible</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to={DASHBOARD_ROUTES.trackers}>Volver al histórico</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Editar tracker</h2>
          <p className='text-sm text-muted-foreground'>Ajusta porcentajes, mes y descarga la gráfica.</p>
        </div>
        <Button type='button' variant='outline' asChild>
          <Link to={DASHBOARD_ROUTES.trackers}>Volver al histórico</Link>
        </Button>
      </div>

      <div className='grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
            <CardDescription>Edita el tracker mensual seleccionado.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='edit-tracker-year'>Año</Label>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(value) => {
                    setSelectedYear(Number(value))
                    setError(null)
                    setSuccess(null)
                  }}
                >
                  <SelectTrigger id='edit-tracker-year'>
                    <SelectValue placeholder='Año' />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='flex flex-col gap-2'>
                <Label htmlFor='edit-tracker-month'>Mes</Label>
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(value) => {
                    setSelectedMonth(Number(value))
                    setError(null)
                    setSuccess(null)
                  }}
                >
                  <SelectTrigger id='edit-tracker-month'>
                    <SelectValue placeholder='Mes' />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((month) => (
                      <SelectItem key={month.value} value={String(month.value)}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='edit-pronunciation-pct'>Pronunciación (%)</Label>
              <Input
                id='edit-pronunciation-pct'
                type='number'
                min={0}
                max={100}
                step='0.1'
                value={pronunciationPct}
                onChange={(event) => {
                  setPronunciationPct(clampPercent(Number(event.target.value) || 0))
                  setError(null)
                  setSuccess(null)
                }}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='edit-fluency-pct'>Fluidez (%)</Label>
              <Input
                id='edit-fluency-pct'
                type='number'
                min={0}
                max={100}
                step='0.1'
                value={fluencyPct}
                onChange={(event) => {
                  setFluencyPct(clampPercent(Number(event.target.value) || 0))
                  setError(null)
                  setSuccess(null)
                }}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='edit-improvisation-pct'>Improvisación (%)</Label>
              <Input
                id='edit-improvisation-pct'
                type='number'
                min={0}
                max={100}
                step='0.1'
                value={improvisationPct}
                onChange={(event) => {
                  setImprovisationPct(clampPercent(Number(event.target.value) || 0))
                  setError(null)
                  setSuccess(null)
                }}
              />
            </div>

            {isMonthTakenByOtherTracker && (
              <p className='text-sm text-amber-600'>Ya existe otro tracker para {trackerMonthLabel}.</p>
            )}
            {error && <p className='text-sm text-destructive'>{error}</p>}
            {success && <p className='text-sm text-emerald-600'>{success}</p>}

            <div className='flex flex-wrap gap-2'>
              <Button type='button' onClick={() => void handleSave()} disabled={isSaving || isDeleting}>
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isSaving || isDeleting}
              >
                <Trash2Icon data-icon='inline-start' />
                {isDeleting ? 'Eliminando...' : 'Eliminar tracker'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gráfica del tracker</CardTitle>
            <CardDescription>Vista previa y descarga del estado actual.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrackerChartPreview
              ownerName={ownerName}
              monthLabel={trackerMonthLabel}
              pronunciationPct={pronunciationPct}
              fluencyPct={fluencyPct}
              improvisationPct={improvisationPct}
              downloadFileName={`tracker-${trackerMonth}.png`}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar tracker mensual</DialogTitle>
            <DialogDescription>
              Se eliminará el tracker de {getTrackerMonthLabel(trackerMonthSource || trackerMonth)}. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
