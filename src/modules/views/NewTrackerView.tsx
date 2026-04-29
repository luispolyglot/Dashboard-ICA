import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  TRACKERS_MIN_MONTH_DATE,
  TRACKERS_MIN_YEAR,
  buildTrackerMonthDate,
  createImprovementTracker,
  getCurrentMonthDate,
  getTrackerInsertErrorMessage,
  getTrackerMonthLabel,
  isTrackerMonthWithinRange,
  listImprovementTrackers,
} from '../services/trackers'

type NewTrackerViewProps = {
  targetLang: string
  nativeLang: string
}

type MetricField = 'pronunciation' | 'fluency' | 'improvisation'

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

export function NewTrackerView({
  targetLang,
  nativeLang,
}: NewTrackerViewProps) {
  const { user } = useAuth()
  const currentDate = useMemo(() => new Date(), [])
  const currentYear = currentDate.getUTCFullYear()
  const currentMonth = currentDate.getUTCMonth() + 1

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [pronunciationPct, setPronunciationPct] = useState(96.9)
  const [fluencyPct, setFluencyPct] = useState(73.2)
  const [improvisationPct, setImprovisationPct] = useState(8.9)
  const [usedMonths, setUsedMonths] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const ownerName =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuario'

  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: currentYear - TRACKERS_MIN_YEAR + 1 },
        (_, index) => TRACKERS_MIN_YEAR + index,
      ),
    [currentYear],
  )

  const monthOptions = useMemo(() => {
    const startMonth =
      selectedYear === TRACKERS_MIN_YEAR ? TRACKERS_MIN_MONTH : 1
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

  const trackerMonthLabel = useMemo(
    () => getTrackerMonthLabel(trackerMonth),
    [trackerMonth],
  )

  const isMonthTaken = useMemo(
    () => usedMonths.has(trackerMonth),
    [trackerMonth, usedMonths],
  )
  const showMonthTakenWarning = isMonthTaken && !success

  useEffect(() => {
    if (!monthOptions.some((option) => option.value === selectedMonth)) {
      setSelectedMonth(monthOptions[0]?.value ?? TRACKERS_MIN_MONTH)
    }
  }, [monthOptions, selectedMonth])

  useEffect(() => {
    let mounted = true

    const loadUsedMonths = async () => {
      try {
        const rows = await listImprovementTrackers(targetLang, nativeLang)
        if (mounted) {
          setUsedMonths(new Set(rows.map((row) => row.trackerMonth)))
        }
      } catch {
        if (mounted) {
          setError('No pudimos validar los meses ya cargados.')
        }
      }
    }

    void loadUsedMonths()

    return () => {
      mounted = false
    }
  }, [nativeLang, targetLang])

  const handleMetricInput = (
    setter: (value: number) => void,
    eventValue: string,
    field: MetricField,
  ) => {
    const parsed = Number(eventValue)
    if (Number.isNaN(parsed)) {
      setter(0)
      return
    }

    const clamped = clampPercent(parsed)
    setter(clamped)
    if (field) {
      setError(null)
      setSuccess(null)
    }
  }

  const handleSubmit = async () => {
    setError(null)
    setSuccess(null)

    if (!isTrackerMonthWithinRange(selectedYear, selectedMonth, currentDate)) {
      setError('El mes elegido esta fuera del rango permitido.')
      return
    }

    if (
      trackerMonth < TRACKERS_MIN_MONTH_DATE ||
      trackerMonth > getCurrentMonthDate(currentDate)
    ) {
      setError('El mes elegido esta fuera de rango.')
      return
    }

    if (isMonthTaken) {
      setError('Ya existe un tracker para ese mes.')
      return
    }

    setIsSaving(true)

    try {
      const row = await createImprovementTracker({
        targetLang,
        nativeLang,
        trackerMonth,
        pronunciationPct,
        fluencyPct,
        improvisationPct,
      })
      setUsedMonths((prev) => new Set(prev).add(row.trackerMonth))
      setSuccess('Tracker guardado correctamente.')
    } catch (insertError) {
      setError(getTrackerInsertErrorMessage(insertError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 p-4 pb-24'>
      <div className='mb-6'>
        <h2 className='font-serif text-3xl font-bold'>
          Nuevo tracker de mejora
        </h2>
        <p className='text-sm text-muted-foreground'>
          Puedes cargar un solo tracker por mes, desde septiembre de 2025 hasta el mes
          actual.
        </p>
      </div>

      <div className='grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>Datos del tracker</CardTitle>
            <CardDescription>
              Selecciona mes, año y carga los tres porcentajes.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='tracker-year'>Año</Label>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(value) => {
                    setSelectedYear(Number(value))
                    setError(null)
                    setSuccess(null)
                  }}
                >
                  <SelectTrigger id='tracker-year'>
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
                <Label htmlFor='tracker-month'>Mes</Label>
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(value) => {
                    setSelectedMonth(Number(value))
                    setError(null)
                    setSuccess(null)
                  }}
                >
                  <SelectTrigger id='tracker-month'>
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
              <Label htmlFor='pronunciation-pct'>Pronunciación (%)</Label>
              <Input
                id='pronunciation-pct'
                type='number'
                min={0}
                max={100}
                step='0.1'
                value={pronunciationPct}
                onChange={(event) => {
                  handleMetricInput(
                    setPronunciationPct,
                    event.target.value,
                    'pronunciation',
                  )
                }}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='fluency-pct'>Fluidez (%)</Label>
              <Input
                id='fluency-pct'
                type='number'
                min={0}
                max={100}
                step='0.1'
                value={fluencyPct}
                onChange={(event) => {
                  handleMetricInput(
                    setFluencyPct,
                    event.target.value,
                    'fluency',
                  )
                }}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='improvisation-pct'>Improvisación (%)</Label>
              <Input
                id='improvisation-pct'
                type='number'
                min={0}
                max={100}
                step='0.1'
                value={improvisationPct}
                onChange={(event) => {
                  handleMetricInput(
                    setImprovisationPct,
                    event.target.value,
                    'improvisation',
                  )
                }}
              />
            </div>

            {showMonthTakenWarning && (
              <p className='text-sm text-amber-600'>
                Ya existe un tracker para {trackerMonthLabel}. Elige otro mes.
              </p>
            )}

            {error && <p className='text-sm text-destructive'>{error}</p>}
            {success && <p className='text-sm text-emerald-600'>{success}</p>}

            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                onClick={() => void handleSubmit()}
                disabled={isSaving || isMonthTaken}
              >
                {isSaving ? 'Guardando...' : 'Guardar tracker'}
              </Button>
              <Button type='button' variant='outline' asChild>
                <Link to={DASHBOARD_ROUTES.trackers}>Ir al histórico</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              Esta gráfica se puede descargar y será igual a la que verás en el
              histórico.
            </CardDescription>
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
    </section>
  )
}
