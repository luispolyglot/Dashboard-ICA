import { t, uiLocale } from '@/i18n'
import { type ComponentProps, type CSSProperties, useEffect, useMemo, useState } from 'react'
import { CameraIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, GameProgress, GamePage, HeroBlock, IconTile, PageTitle, Panel, Pill, SectionLabel } from '../game/ui'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  buildTrackPostDayDate,
  getDayUnlockWindow,
  getMonthLabel,
  getTrackPostErrorMessage,
  listInstagramTrackMonths,
  listInstagramTrackPostsByMonth,
  upsertInstagramTrackPost,
} from '../services/instagramTrackPosts'
import type { InstagramTrackPostEntry } from '../types'
import { ListLoading } from '@/components/ui/loading-state'

type InstagramTrackPostsViewProps = {
  targetLang: string
  nativeLang: string
}

const DAYS_LIMIT = 28

function formatDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return t('No disponible')
  return value.toLocaleString(uiLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  })
}

function isInstagramUrl(value: string): boolean {
  return /^https?:\/\/(www\.)?instagram\.com\/.+/i.test(value)
}

export function InstagramTrackPostsView({ targetLang, nativeLang }: InstagramTrackPostsViewProps) {
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [rowsByDay, setRowsByDay] = useState<Record<number, InstagramTrackPostEntry>>({})
  const [draftsByDay, setDraftsByDay] = useState<Record<number, string>>({})
  const [isLoadingMonths, setIsLoadingMonths] = useState(true)
  const [isLoadingRows, setIsLoadingRows] = useState(false)
  const [savingDay, setSavingDay] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true

    const loadMonths = async () => {
      setIsLoadingMonths(true)

      try {
        const months = await listInstagramTrackMonths(targetLang, nativeLang)
        if (!mounted) return

        setAvailableMonths(months)
        setSelectedMonth((prev) => (prev && months.includes(prev) ? prev : months[0] || ''))
      } catch {
        if (mounted) toast.error(t('No pudimos cargar los meses del track.'))
      } finally {
        if (mounted) setIsLoadingMonths(false)
      }
    }

    void loadMonths()

    return () => {
      mounted = false
    }
  }, [nativeLang, targetLang])

  useEffect(() => {
    if (!selectedMonth) return
    let mounted = true

    const loadRows = async () => {
      setIsLoadingRows(true)

      try {
        const rows = await listInstagramTrackPostsByMonth(targetLang, nativeLang, selectedMonth)
        if (!mounted) return

        const byDay: Record<number, InstagramTrackPostEntry> = {}
        const drafts: Record<number, string> = {}

        for (const row of rows) {
          byDay[row.dayIndex] = row
          drafts[row.dayIndex] = row.postUrl || ''
        }

        setRowsByDay(byDay)
        setDraftsByDay(drafts)
      } catch {
        if (mounted) toast.error(t('No pudimos cargar la tabla del mes seleccionado.'))
      } finally {
        if (mounted) setIsLoadingRows(false)
      }
    }

    void loadRows()

    return () => {
      mounted = false
    }
  }, [nativeLang, selectedMonth, targetLang])

  const dayRows = useMemo(
    () => Array.from({ length: DAYS_LIMIT }, (_, index) => index + 1),
    [],
  )

  const getDayRowViewModel = (dayIndex: number) => {
    const current = rowsByDay[dayIndex]
    const draftValue = draftsByDay[dayIndex] ?? current?.postUrl ?? ''
    const windowState = getDayUnlockWindow(selectedMonth, dayIndex)
    const dayDate = buildTrackPostDayDate(selectedMonth, dayIndex)
    const isWindowClosed = windowState.isUnlocked && !windowState.isEditable
    const isFutureLocked = !windowState.isUnlocked
    const hasExistingContent = Boolean(current?.postUrl && current.postUrl.trim().length > 0)
    const baseLabel = hasExistingContent ? t('Editar') : t('Guardar')
    const buttonLabel = isWindowClosed ? t('Ventana cerrada') : baseLabel
    const buttonVariant: ComponentProps<typeof Button>['variant'] = isWindowClosed
      ? 'ghost'
      : isFutureLocked
        ? 'outline'
        : 'default'
    const isRowSaving = savingDay === dayIndex

    const stateText = !windowState.isUnlocked
      ? t('Se desbloquea {date}', { date: formatDate(windowState.unlockAt) })
      : windowState.isEditable
        ? t('Editable hasta {date}', { date: formatDate(windowState.closeAt) })
        : t('Ventana cerrada')

    const stateBadgeLabel = !windowState.isUnlocked
      ? t('Bloqueado')
      : windowState.isEditable
        ? t('Editable')
        : t('Cerrado')

    const stateBadgeClass = !windowState.isUnlocked
      ? 'bg-muted text-muted-foreground'
      : windowState.isEditable
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-amber-100 text-amber-700'

    return {
      draftValue,
      dayDate,
      buttonLabel,
      buttonVariant,
      isRowSaving,
      isEditable: windowState.isEditable,
      stateText,
      stateBadgeLabel,
      stateBadgeClass,
    }
  }

  const handleSave = async (dayIndex: number) => {
    if (!selectedMonth) return
    if (savingDay) return

    const rawValue = draftsByDay[dayIndex] || ''
    const trimmed = rawValue.trim()
    const windowState = getDayUnlockWindow(selectedMonth, dayIndex)

    if (!windowState.isEditable) {
      toast.error(t('La ventana de 48 horas para ese día no está disponible.'))
      return
    }

    if (trimmed.length === 0 && !rowsByDay[dayIndex]) {
      toast.error(t('Ingresa un link de Instagram para guardar este día.'))
      return
    }

    if (trimmed.length > 0 && !isInstagramUrl(trimmed)) {
      toast.error(t('El link debe empezar con https://instagram.com o https://www.instagram.com'))
      return
    }

    setSavingDay(dayIndex)
    try {
      const saved = await upsertInstagramTrackPost({
        targetLang,
        nativeLang,
        trackMonth: selectedMonth,
        dayIndex,
        postUrl: trimmed.length > 0 ? trimmed : null,
      })

      setRowsByDay((prev) => ({ ...prev, [dayIndex]: saved }))
      setDraftsByDay((prev) => ({ ...prev, [dayIndex]: saved.postUrl || '' }))
      toast.success(t('Día {n} guardado correctamente.', { n: dayIndex }))
    } catch (saveError) {
      toast.error(getTrackPostErrorMessage(saveError))
    } finally {
      setSavingDay(null)
    }
  }

  const postedDays = dayRows.filter((day) => Boolean(rowsByDay[day]?.postUrl?.trim()))
  // Día elegido: el que toques; si no, el último que aún se puede editar.
  const editableDays = selectedMonth ? dayRows.filter((day) => getDayUnlockWindow(selectedMonth, day).isEditable) : []
  const activeDay = selectedDay ?? editableDays[editableDays.length - 1] ?? null
  const active = activeDay && selectedMonth ? getDayRowViewModel(activeDay) : null

  return (
    <GamePage>
      <PageTitle
        icon={
          <IconTile tone='a' size={48}>
            <CameraIcon className='size-6' strokeWidth={2.6} />
          </IconTile>
        }
        subtitle={t('Cada día con post suma puntos al ranking.')}
        right={
          availableMonths.length > 1 ? (
            <Select value={selectedMonth} onValueChange={(value) => { setSelectedMonth(value); setSelectedDay(null) }}>
              <SelectTrigger className='w-36' aria-label={t('Mes')}>
                <SelectValue placeholder={t('Selecciona un mes')} />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((month) => (
                  <SelectItem key={month} value={month}>
                    {getMonthLabel(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      >
        {t('Track Instagram')}
      </PageTitle>

      {isLoadingMonths || (isLoadingRows && postedDays.length === 0) ? (
        <ListLoading label={t('Cargando track de Instagram...')} rows={3} className='mb-3' />
      ) : null}

      {selectedMonth ? (
        <>
          {/* El mes en un vistazo */}
          <HeroBlock
            tone='a'
            icon={<CameraIcon className='size-12' strokeWidth={2.2} style={{ color: 'var(--ica-a)' }} />}
            eyebrow={getMonthLabel(selectedMonth)}
            title={t('{n} de {total} días con post', { n: postedDays.length, total: DAYS_LIMIT })}
            text={t('+{points} puntos en el ranking', { points: (postedDays.length * 0.5).toLocaleString(uiLocale()) })}
          >
            <GameProgress value={postedDays.length / DAYS_LIMIT} color='var(--ica-a)' />
          </HeroBlock>

          {/* Los 28 días como círculos (como en Rachas) */}
          <div>
            <SectionLabel>{t('Toca un día')}</SectionLabel>
            <div className='grid grid-cols-7 gap-2'>
              {dayRows.map((day) => {
                const posted = Boolean(rowsByDay[day]?.postUrl?.trim())
                const windowState = getDayUnlockWindow(selectedMonth, day)
                const isActive = day === activeDay
                return (
                  <button
                    key={day}
                    type='button'
                    onClick={() => setSelectedDay(day)}
                    aria-label={t('Día {n}', { n: day })}
                    aria-pressed={isActive}
                    className={cn(
                      'relative flex aspect-square items-center justify-center rounded-full text-sm font-extrabold tabular-nums transition-transform active:scale-90',
                      isActive && 'ring-3 ring-offset-2 ring-offset-background',
                    )}
                    style={{
                      ...(posted
                        ? { background: 'var(--ica-a)', color: '#fff', boxShadow: '0 3px 0 var(--ica-a-edge)' }
                        : windowState.isEditable
                          ? { background: 'var(--ica-a-soft)', color: 'var(--ica-a-ink)', border: '2px dashed var(--ica-a)' }
                          : { background: 'var(--muted)', color: 'var(--muted-foreground)', opacity: windowState.isUnlocked ? 1 : 0.55 }),
                      ...(isActive ? ({ '--tw-ring-color': 'var(--ica-a)' } as CSSProperties) : {}),
                    }}
                  >
                    {posted ? <CheckIcon className='size-4' strokeWidth={3.2} /> : day}
                  </button>
                )
              })}
            </div>
            <div className='mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-muted-foreground'>
              <span className='flex items-center gap-1.5'><span className='size-3 rounded-full' style={{ background: 'var(--ica-a)' }} />{t('Con post')}</span>
              <span className='flex items-center gap-1.5'><span className='size-3 rounded-full border-2 border-dashed' style={{ borderColor: 'var(--ica-a)' }} />{t('Puedes subirlo')}</span>
              <span className='flex items-center gap-1.5'><span className='size-3 rounded-full bg-muted' />{t('Cerrado o aún no')}</span>
            </div>
          </div>

          {/* El día elegido */}
          {active && activeDay ? (
            <Panel className='flex flex-col gap-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='m-0 text-lg font-extrabold'>{t('Día {n}', { n: activeDay })}</p>
                  <p className='m-0 text-xs font-semibold text-muted-foreground'>{active.stateText}</p>
                </div>
                <Pill tone={active.isEditable ? 'ok' : 'neutral'}>{active.stateBadgeLabel}</Pill>
              </div>
              <Input
                value={active.draftValue}
                placeholder='https://www.instagram.com/...'
                disabled={!active.isEditable || savingDay !== null}
                onChange={(event) => {
                  const value = event.target.value
                  setDraftsByDay((prev) => ({ ...prev, [activeDay]: value }))
                }}
                aria-label={t('Link de Instagram')}
              />
              <Button
                type='button'
                size='lg'
                variant={active.isEditable ? 'a' : 'outline'}
                className='w-full'
                onClick={() => void handleSave(activeDay)}
                disabled={!active.isEditable || savingDay !== null}
              >
                {active.isRowSaving ? (
                  <>
                    <Loader2Icon className='animate-spin' data-icon='inline-start' />
                    {t('Guardando...')}
                  </>
                ) : (
                  active.buttonLabel
                )}
              </Button>
            </Panel>
          ) : (
            <EmptyState
              icon={<CameraIcon className='size-10 text-muted-foreground' strokeWidth={2.2} />}
              title={t('Toca un día')}
              text={t('Cada día se abre a su hora y tienes 48 horas para pegar el link de tu post.')}
            />
          )}
        </>
      ) : null}
    </GamePage>
  )
}
