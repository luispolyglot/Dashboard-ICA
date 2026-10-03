import { t } from '@/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'
import { TrackerChartPreview } from '../components/Trackers/TrackerChartPreview'
import { TRACKER_SKILLS, TrackerMetricField, TrackerMonthPicker, TrackerNotice } from '../components/Trackers/TrackerFormParts'
import { GamePage, IconTile, PageTitle, SectionLabel } from '../game/ui'
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
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || t('Usuario')

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
        label: t(MONTH_LABELS[month - 1]),
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
          setError(t('No pudimos validar los meses ya cargados.'))
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
      setError(t('El mes elegido esta fuera del rango permitido.'))
      return
    }

    if (
      trackerMonth < TRACKERS_MIN_MONTH_DATE ||
      trackerMonth > getCurrentMonthDate(currentDate)
    ) {
      setError(t('El mes elegido esta fuera de rango.'))
      return
    }

    if (isMonthTaken) {
      setError(t('Ya existe un tracker para ese mes.'))
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
      setSuccess(t('Tracker guardado correctamente.'))
    } catch (insertError) {
      setError(getTrackerInsertErrorMessage(insertError))
    } finally {
      setIsSaving(false)
    }
  }

  const metricValues = {
    pronunciation: pronunciationPct,
    fluency: fluencyPct,
    improvisation: improvisationPct,
  }
  const metricSetters = {
    pronunciation: setPronunciationPct,
    fluency: setFluencyPct,
    improvisation: setImprovisationPct,
  }

  return (
    <GamePage wide className='gap-6 lg:max-w-4xl'>
      <PageTitle
        icon={
          <IconTile tone='i' size={48} solid>
            <PlusIcon className='size-6' strokeWidth={3} aria-hidden='true' />
          </IconTile>
        }
        subtitle={t('Un tracker por mes, desde septiembre de 2025.')}
      >
        {t('Nuevo tracker')}
      </PageTitle>

      <div className='grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'>
        <div className='ica-panel flex flex-col gap-4 px-4 py-4'>
          <TrackerMonthPicker
            idPrefix='tracker'
            year={selectedYear}
            month={selectedMonth}
            yearOptions={yearOptions}
            monthOptions={monthOptions}
            onYearChange={(year) => {
              setSelectedYear(year)
              setError(null)
              setSuccess(null)
            }}
            onMonthChange={(month) => {
              setSelectedMonth(month)
              setError(null)
              setSuccess(null)
            }}
          />

          {TRACKER_SKILLS.map((skill) => (
            <TrackerMetricField
              key={skill.key}
              id={`${skill.key}-pct`}
              label={t(skill.label)}
              toneKey={skill.tone}
              value={metricValues[skill.key]}
              onChange={(value) => handleMetricInput(metricSetters[skill.key], String(value), skill.key)}
            />
          ))}

          {showMonthTakenWarning ? (
            <TrackerNotice kind='gold'>
              {t('Ya existe un tracker para {month}. Elige otro mes.', { month: trackerMonthLabel })}
            </TrackerNotice>
          ) : null}
          {error ? <TrackerNotice kind='bad'>{error}</TrackerNotice> : null}
          {success ? <TrackerNotice kind='ok'>{success}</TrackerNotice> : null}

          <Button
            type='button'
            variant='i'
            size='xl'
            className='w-full'
            onClick={() => void handleSubmit()}
            disabled={isSaving || isMonthTaken}
          >
            {isSaving ? t('Guardando...') : t('Guardar tracker')}
          </Button>
          {success ? (
            <Button type='button' variant='outline' className='h-11 w-full rounded-2xl font-extrabold' asChild>
              <Link to={DASHBOARD_ROUTES.trackers}>{t('Ver todos mis trackers')}</Link>
            </Button>
          ) : null}
        </div>

        <div>
          <SectionLabel>{t('Tu imagen para compartir')}</SectionLabel>
          <div className='ica-panel px-3 py-3'>
            <TrackerChartPreview
              ownerName={ownerName}
              monthLabel={trackerMonthLabel}
              pronunciationPct={pronunciationPct}
              fluencyPct={fluencyPct}
              improvisationPct={improvisationPct}
              downloadFileName={`tracker-${trackerMonth}.png`}
            />
          </div>
        </div>
      </div>
    </GamePage>
  )
}
