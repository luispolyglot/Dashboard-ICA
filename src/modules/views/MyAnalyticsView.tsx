import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3Icon,
  BookOpenTextIcon,
  CheckCheckIcon,
  MessageSquareQuoteIcon,
  Volume2Icon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchMyMonthlyAnalytics,
  type MonthlyAnalyticsKpis,
} from '../services/myAnalytics'
import { LISTENING_METRICS_CHANGED_EVENT } from '../services/creationMetricsSync'
import { useDashboardContext } from '../context/DashboardContext'

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

const EMPTY_KPIS: MonthlyAnalyticsKpis = {
  wordsAdded: 0,
  phrasesCreated: 0,
  masterNotesClosed: 0,
  masterNotesListenedMinutes: 0,
  flashcardsCorrect: 0,
}

function toMonthCode(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}${year}`
}

function parseSafeDate(value: string | undefined): Date {
  const fallback = new Date()
  if (!value) return fallback

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function getPreviousPeriod(
  month: number,
  year: number,
): { month: number; year: number } {
  if (month === 1) {
    return { month: 12, year: year - 1 }
  }

  return { month: month - 1, year }
}

function isPeriodBefore(
  month: number,
  year: number,
  minMonth: number,
  minYear: number,
): boolean {
  if (year < minYear) return true
  if (year > minYear) return false
  return month < minMonth
}

function formatDeltaLabel(current: number, previous: number | null): string {
  if (previous === null) return 'Sin mes anterior disponible'
  const delta = current - previous
  if (delta === 0) return 'Sin cambios vs mes anterior'
  return `${delta > 0 ? '+' : ''}${delta} vs mes anterior`
}

export function MyAnalyticsView() {
  const { user } = useAuth()
  const { config } = useDashboardContext()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kpis, setKpis] = useState<MonthlyAnalyticsKpis>(EMPTY_KPIS)
  const [previousKpis, setPreviousKpis] = useState<MonthlyAnalyticsKpis | null>(
    null,
  )
  const [refreshTick, setRefreshTick] = useState(0)

  const createdAt = useMemo(
    () => parseSafeDate(user?.created_at),
    [user?.created_at],
  )
  const currentDate = useMemo(() => new Date(), [])

  const createdYear = createdAt.getUTCFullYear()
  const createdMonth = createdAt.getUTCMonth() + 1
  const currentYear = currentDate.getUTCFullYear()
  const currentMonth = currentDate.getUTCMonth() + 1

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: currentYear - createdYear + 1 },
        (_, index) => createdYear + index,
      ),
    [createdYear, currentYear],
  )

  const monthOptions = useMemo(() => {
    const minMonth = selectedYear === createdYear ? createdMonth : 1
    const maxMonth = selectedYear === currentYear ? currentMonth : 12

    return Array.from({ length: maxMonth - minMonth + 1 }, (_, index) => {
      const month = minMonth + index
      return {
        value: month,
        label: MONTH_LABELS[month - 1],
      }
    })
  }, [createdMonth, createdYear, currentMonth, currentYear, selectedYear])

  useEffect(() => {
    if (!monthOptions.some((option) => option.value === selectedMonth)) {
      setSelectedMonth(monthOptions[0]?.value || currentMonth)
    }
  }, [currentMonth, monthOptions, selectedMonth])

  const selectedMonthCode = useMemo(
    () => toMonthCode(selectedMonth, selectedYear),
    [selectedMonth, selectedYear],
  )

  const previousPeriod = useMemo(
    () => getPreviousPeriod(selectedMonth, selectedYear),
    [selectedMonth, selectedYear],
  )

  const hasPreviousPeriod = useMemo(
    () =>
      !isPeriodBefore(
        previousPeriod.month,
        previousPeriod.year,
        createdMonth,
        createdYear,
      ),
    [createdMonth, createdYear, previousPeriod.month, previousPeriod.year],
  )

  const previousMonthCode = useMemo(
    () => toMonthCode(previousPeriod.month, previousPeriod.year),
    [previousPeriod.month, previousPeriod.year],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onListeningMetricsChanged = () => {
      setRefreshTick((value) => value + 1)
    }

    window.addEventListener(
      LISTENING_METRICS_CHANGED_EVENT,
      onListeningMetricsChanged,
    )

    return () => {
      window.removeEventListener(
        LISTENING_METRICS_CHANGED_EVENT,
        onListeningMetricsChanged,
      )
    }
  }, [])

  useEffect(() => {
    if (!user?.id || !config) return

    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const [currentData, previousData] = await Promise.all([
          fetchMyMonthlyAnalytics(
            selectedMonthCode,
            user.id,
            config.targetLang,
            config.nativeLang,
          ),
          hasPreviousPeriod
            ? fetchMyMonthlyAnalytics(
                previousMonthCode,
                user.id,
                config.targetLang,
                config.nativeLang,
              )
            : Promise.resolve(null),
        ])

        if (!active) return
        setKpis(currentData)
        setPreviousKpis(previousData)
      } catch (err) {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar tus estadísticas del mes.',
        )
        setKpis(EMPTY_KPIS)
        setPreviousKpis(null)
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [
    config,
    hasPreviousPeriod,
    previousMonthCode,
    refreshTick,
    selectedMonthCode,
    user?.id,
  ])

  if (!config) {
    return (
      <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>
          Mis estadísticas mensuales
        </h2>
        <p className='text-sm text-muted-foreground'>
          Configura tu idioma actual para ver tus métricas por idioma.
        </p>
      </section>
    )
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>
          Mis estadísticas mensuales
        </h2>
        <p className='text-sm text-muted-foreground'>
          Selecciona mes y año para ver tus KPI de actividad ICA.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <BarChart3Icon className='h-4 w-4' />
            Período
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2'>
          <div className='space-y-1.5'>
            <p className='text-xs uppercase tracking-wider text-muted-foreground'>
              Año
            </p>
            <Select
              value={String(selectedYear)}
              onValueChange={(value) => setSelectedYear(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder='Selecciona año' />
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

          <div className='space-y-1.5'>
            <p className='text-xs uppercase tracking-wider text-muted-foreground'>
              Mes
            </p>
            <Select
              value={String(selectedMonth)}
              onValueChange={(value) => setSelectedMonth(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder='Selecciona mes' />
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
        </CardContent>
      </Card>

      {error && <p className='mt-4 text-sm text-destructive'>{error}</p>}

      <div className='mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <BookOpenTextIcon className='h-4 w-4' />
              Palabras añadidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {loading ? '...' : kpis.wordsAdded}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {loading
                ? '...'
                : formatDeltaLabel(
                    kpis.wordsAdded,
                    previousKpis?.wordsAdded ?? null,
                  )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <MessageSquareQuoteIcon className='h-4 w-4' />
              Frases creadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {loading ? '...' : kpis.phrasesCreated}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {loading
                ? '...'
                : formatDeltaLabel(
                    kpis.phrasesCreated,
                    previousKpis?.phrasesCreated ?? null,
                  )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Volume2Icon className='h-4 w-4' />
              Notas maestras cerradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {loading ? '...' : kpis.masterNotesClosed}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {loading
                ? '...'
                : formatDeltaLabel(
                    kpis.masterNotesClosed,
                    previousKpis?.masterNotesClosed ?? null,
                  )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Volume2Icon className='h-4 w-4' />
              Minutos escuchados NM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {loading ? '...' : kpis.masterNotesListenedMinutes}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {loading
                ? '...'
                : formatDeltaLabel(
                    kpis.masterNotesListenedMinutes,
                    previousKpis?.masterNotesListenedMinutes ?? null,
                  )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <CheckCheckIcon className='h-4 w-4' />
              Flashcards correctas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {loading ? '...' : kpis.flashcardsCorrect}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {loading
                ? '...'
                : formatDeltaLabel(
                    kpis.flashcardsCorrect,
                    previousKpis?.flashcardsCorrect ?? null,
                  )}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
