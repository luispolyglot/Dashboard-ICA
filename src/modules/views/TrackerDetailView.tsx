import { t } from '@/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LineChartIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/auth/AuthContext'
import { TrackerChartPreview } from '../components/Trackers/TrackerChartPreview'
import { TRACKER_SKILLS, TrackerMetricField, TrackerMonthPicker, TrackerNotice } from '../components/Trackers/TrackerFormParts'
import { EmptyState, GamePage, IconTile, PageTitle, SectionLabel } from '../game/ui'
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

  const ownerName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || t('Usuario')

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
        label: t(MONTH_LABELS[month - 1]),
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
          setError(t('No encontramos el tracker solicitado.'))
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
        if (mounted) setError(t('No pudimos cargar el tracker.'))
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
      setError(t('El mes elegido está fuera del rango permitido.'))
      return
    }

    if (isMonthTakenByOtherTracker) {
      setError(t('Ya existe otro tracker para ese mes.'))
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
      setSuccess(t('Tracker actualizado correctamente.'))
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
      setError(t('No pudimos eliminar el tracker. Inténtalo de nuevo.'))
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <GamePage>
        <div className='h-64 animate-pulse rounded-3xl bg-muted' aria-hidden='true' />
      </GamePage>
    )
  }

  if (error && !trackerMonthSource) {
    return (
      <GamePage className='justify-center'>
        <EmptyState
          icon={
            <IconTile tone='neutral' size={64}>
              <LineChartIcon className='size-8' strokeWidth={2.4} aria-hidden='true' />
            </IconTile>
          }
          title={t('Tracker no disponible')}
          text={error}
          action={
            <Button asChild variant='i'>
              <Link to={DASHBOARD_ROUTES.trackers}>{t('Ver todos mis trackers')}</Link>
            </Button>
          }
        />
      </GamePage>
    )
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
            <LineChartIcon className='size-6' strokeWidth={2.6} aria-hidden='true' />
          </IconTile>
        }
        subtitle={t('Cambia los porcentajes o el mes y descarga tu imagen.')}
        right={
          <button
            type='button'
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={isSaving || isDeleting}
            aria-label={t('Eliminar tracker')}
            className='flex size-11 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground transition-colors hover:text-[var(--ica-bad-ink)] disabled:opacity-50'
          >
            <Trash2Icon className='size-5' strokeWidth={2.4} />
          </button>
        }
      >
        {trackerMonthLabel}
      </PageTitle>

      <div className='grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'>
        <div className='ica-panel flex flex-col gap-4 px-4 py-4'>
          <TrackerMonthPicker
            idPrefix='edit-tracker'
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
              id={`edit-${skill.key}-pct`}
              label={t(skill.label)}
              toneKey={skill.tone}
              value={metricValues[skill.key]}
              onChange={(value) => {
                metricSetters[skill.key](clampPercent(value))
                setError(null)
                setSuccess(null)
              }}
            />
          ))}

          {isMonthTakenByOtherTracker ? (
            <TrackerNotice kind='gold'>{t('Ya existe otro tracker para {month}.', { month: trackerMonthLabel })}</TrackerNotice>
          ) : null}
          {error ? <TrackerNotice kind='bad'>{error}</TrackerNotice> : null}
          {success ? <TrackerNotice kind='ok'>{success}</TrackerNotice> : null}

          <Button
            type='button'
            variant='i'
            size='xl'
            className='w-full'
            onClick={() => void handleSave()}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? t('Guardando...') : t('Guardar cambios')}
          </Button>
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

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Eliminar tracker mensual')}</DialogTitle>
            <DialogDescription>
              {t('Se eliminará el tracker de {month}. Esta acción no se puede deshacer.', {
                month: getTrackerMonthLabel(trackerMonthSource || trackerMonth),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              {t('Cancelar')}
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? t('Eliminando...') : t('Eliminar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GamePage>
  )
}
