import { type ComponentProps, useEffect, useMemo, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type InstagramTrackPostsViewProps = {
  targetLang: string
  nativeLang: string
}

const DAYS_LIMIT = 28

function formatDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return 'No disponible'
  return value.toLocaleString('es-ES', {
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
        if (mounted) toast.error('No pudimos cargar los meses del track.')
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
        if (mounted) toast.error('No pudimos cargar la tabla del mes seleccionado.')
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
    const baseLabel = hasExistingContent ? 'Editar' : 'Guardar'
    const buttonLabel = isWindowClosed ? 'Ventana cerrada' : baseLabel
    const buttonVariant: ComponentProps<typeof Button>['variant'] = isWindowClosed
      ? 'ghost'
      : isFutureLocked
        ? 'outline'
        : 'default'
    const isRowSaving = savingDay === dayIndex

    const stateText = !windowState.isUnlocked
      ? `Se desbloquea ${formatDate(windowState.unlockAt)}`
      : windowState.isEditable
        ? `Editable hasta ${formatDate(windowState.closeAt)}`
        : 'Ventana cerrada'

    const stateBadgeLabel = !windowState.isUnlocked
      ? 'Bloqueado'
      : windowState.isEditable
        ? 'Editable'
        : 'Cerrado'

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
      toast.error('La ventana de 48 horas para ese día no está disponible.')
      return
    }

    if (trimmed.length === 0 && !rowsByDay[dayIndex]) {
      toast.error('Ingresa un link de Instagram para guardar este día.')
      return
    }

    if (trimmed.length > 0 && !isInstagramUrl(trimmed)) {
      toast.error('El link debe empezar con https://instagram.com o https://www.instagram.com')
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
      toast.success(`Día ${dayIndex} guardado correctamente.`)
    } catch (saveError) {
      toast.error(getTrackPostErrorMessage(saveError))
    } finally {
      setSavingDay(null)
    }
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 p-4 pb-24 lg:pb-4'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h2 className='font-serif text-3xl font-bold'>Track post Instagram</h2>
          <p className='text-sm text-muted-foreground'>
            Tabla mensual de 28 días. Cada día se desbloquea de forma progresiva y tiene 48 horas para editarse.
          </p>
        </div>

        <div className='w-full max-w-xs'>
          <Label htmlFor='instagram-track-month'>Mes</Label>
          <Select
            value={selectedMonth}
            onValueChange={setSelectedMonth}
            disabled={isLoadingMonths || availableMonths.length === 0}
          >
            <SelectTrigger id='instagram-track-month'>
              <SelectValue placeholder='Selecciona un mes' />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((month) => (
                <SelectItem key={month} value={month}>
                  {getMonthLabel(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(isLoadingMonths || isLoadingRows) && (
        <p className='mb-3 text-sm text-muted-foreground'>Cargando track de Instagram...</p>
      )}

      {!!selectedMonth && (
        <Card>
          <CardHeader>
            <CardTitle>{getMonthLabel(selectedMonth)}</CardTitle>
            <CardDescription>
              Solo se pueden guardar cambios mientras el día esté dentro de su ventana de 48 horas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='hidden md:block'>
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[720px] border-separate border-spacing-y-2'>
                  <thead>
                    <tr className='text-left text-sm text-muted-foreground'>
                      <th className='px-3'>Día</th>
                      <th className='px-3'>Fecha (UTC)</th>
                      <th className='px-3'>Link de Instagram</th>
                      <th className='px-3'>Estado</th>
                      <th className='px-3 text-right'>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map((dayIndex) => {
                      const rowViewModel = getDayRowViewModel(dayIndex)

                      return (
                        <tr key={dayIndex} className='rounded-lg border bg-card'>
                          <td className='px-3 py-2 font-medium'>{dayIndex}</td>
                          <td className='px-3 py-2 text-sm text-muted-foreground'>{rowViewModel.dayDate}</td>
                          <td className='px-3 py-2'>
                            <Input
                              value={rowViewModel.draftValue}
                              placeholder='https://www.instagram.com/...'
                              disabled={!rowViewModel.isEditable || savingDay !== null}
                              onChange={(event) => {
                                const value = event.target.value
                                setDraftsByDay((prev) => ({ ...prev, [dayIndex]: value }))
                              }}
                            />
                          </td>
                          <td className='px-3 py-2 text-xs text-muted-foreground'>{rowViewModel.stateText}</td>
                          <td className='px-3 py-2 text-right'>
                            <Button
                              type='button'
                              size='sm'
                              variant={rowViewModel.buttonVariant}
                              onClick={() => void handleSave(dayIndex)}
                              disabled={!rowViewModel.isEditable || savingDay !== null}
                            >
                              {rowViewModel.isRowSaving ? (
                                <>
                                  <Loader2Icon className='animate-spin' data-icon='inline-start' />
                                  Guardando...
                                </>
                              ) : (
                                rowViewModel.buttonLabel
                              )}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className='grid gap-3 md:hidden'>
              <p className='text-xs text-muted-foreground'>
                En mobile, cada día se muestra en tarjeta para que puedas ver estado, pegar link y guardar sin scroll
                horizontal.
              </p>
              {dayRows.map((dayIndex) => {
                const rowViewModel = getDayRowViewModel(dayIndex)

                return (
                  <div key={dayIndex} className='rounded-xl border bg-card p-3'>
                    <div className='mb-3 flex items-start justify-between gap-3'>
                      <div>
                        <p className='text-sm font-semibold'>Día {dayIndex}</p>
                        <p className='text-xs text-muted-foreground'>{rowViewModel.dayDate}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${rowViewModel.stateBadgeClass}`}>
                        {rowViewModel.stateBadgeLabel}
                      </span>
                    </div>

                    <p className='mb-2 text-xs text-muted-foreground'>{rowViewModel.stateText}</p>

                    <div className='space-y-2'>
                      <Input
                        value={rowViewModel.draftValue}
                        placeholder='https://www.instagram.com/...'
                        disabled={!rowViewModel.isEditable || savingDay !== null}
                        onChange={(event) => {
                          const value = event.target.value
                          setDraftsByDay((prev) => ({ ...prev, [dayIndex]: value }))
                        }}
                      />

                      <Button
                        type='button'
                        size='sm'
                        variant={rowViewModel.buttonVariant}
                        className='w-full'
                        onClick={() => void handleSave(dayIndex)}
                        disabled={!rowViewModel.isEditable || savingDay !== null}
                      >
                        {rowViewModel.isRowSaving ? (
                          <>
                            <Loader2Icon className='animate-spin' data-icon='inline-start' />
                            Guardando...
                          </>
                        ) : (
                          rowViewModel.buttonLabel
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
