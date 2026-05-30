import { useEffect, useState } from 'react'
import { BellIcon, CheckIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { CalendarIcademyBoard } from '../components/calendar-icademy/CalendarIcademyBoard'
import { fetchCalendarIcademyEntries } from '../services/calendarIcademy'
import {
  fetchCalendarIcademyPreferences,
  upsertCalendarIcademyPreference,
} from '../services/calendarIcademyPreferences'
import type {
  CalendarIcademyEntry,
  CalendarIcademyPreference,
  CalendarIcademyPreferenceInput,
} from '../types'

const REMINDER_OPTIONS = [10, 15, 30, 60, 120]
const MAX_ACTIVE_REMINDERS = 2

const LANGUAGE_FLAGS: Record<string, string> = {
  pl: '🇵🇱',
  fr: '🇫🇷',
  en: '🇬🇧',
  it: '🇮🇹',
  de: '🇩🇪',
}

export function CalendarIcademyView() {
  const [entries, setEntries] = useState<CalendarIcademyEntry[]>([])
  const [preferences, setPreferences] = useState<CalendarIcademyPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false)
  const [updatingClassKey, setUpdatingClassKey] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const [calendarEntries, preferenceEntries] = await Promise.all([
          fetchCalendarIcademyEntries(),
          fetchCalendarIcademyPreferences().catch(() => []),
        ])
        if (!mounted) return
        setEntries(calendarEntries)
        setPreferences(preferenceEntries)
      } catch (err) {
        if (!mounted) return
        const message =
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el calendario de clases.'
        setError(message)
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }

    void run()

    return () => {
      mounted = false
    }
  }, [])

  const classOptions = Array.from(
    entries
      .reduce((acc, entry) => {
        if (!acc.has(entry.classKey)) {
          acc.set(entry.classKey, {
            classKey: entry.classKey,
            className: entry.className,
            languageCode: entry.languageCode,
          })
        }
        return acc
      }, new Map<string, { classKey: string; className: string; languageCode: string }>())
      .values(),
  ).sort((a, b) => a.className.localeCompare(b.className))

  const preferencesByClass = preferences.reduce(
    (acc, preference) => {
      acc.set(preference.classKey, preference)
      return acc
    },
    new Map<string, CalendarIcademyPreference>(),
  )

  const activeReminderCount = preferences.filter(
    (item) => item.notificationsEnabled,
  ).length
  const hasReachedReminderLimit = activeReminderCount >= MAX_ACTIVE_REMINDERS

  const savePreference = async (input: CalendarIcademyPreferenceInput) => {
    setUpdatingClassKey(input.classKey)

    try {
      const saved = await upsertCalendarIcademyPreference(input)
      setPreferences((prev) => {
        const withoutCurrent = prev.filter((item) => item.classKey !== saved.classKey)
        return [...withoutCurrent, saved]
      })
      return saved
    } finally {
      setUpdatingClassKey(null)
    }
  }

  const handleToggleNotifications = async (
    classKey: string,
    className: string,
    languageCode: string,
    enabled: boolean,
  ) => {
    const existing = preferencesByClass.get(classKey)

    try {
      const saved = await savePreference({
        classKey,
        languageCode,
        notificationsEnabled: enabled,
        minutesBefore: existing?.minutesBefore || 30,
      })

      if (saved.notificationsEnabled) {
        toast.success(`Recordatorio activado para ${className}.`, {
          description: `${saved.minutesBefore} min antes de cada clase.`,
        })
      } else {
        toast('Recordatorio desactivado.', {
          description: className,
        })
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la preferencia de notificacion.'
      setError(message)
      toast.error(message)
    }
  }

  const handleChangeMinutesBefore = async (
    classKey: string,
    className: string,
    languageCode: string,
    minutesBefore: number,
  ) => {
    const existing = preferencesByClass.get(classKey)

    try {
      await savePreference({
        classKey,
        languageCode,
        notificationsEnabled: existing?.notificationsEnabled ?? true,
        minutesBefore,
      })

      toast.success('Preferencia guardada.', {
        description: `${className}: ${minutesBefore} min antes.`,
      })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el tiempo de recordatorio.'
      setError(message)
      toast.error(message)
    }
  }

  return (
    <>
      <CalendarIcademyBoard
        title='Calendario ICADEMY'
        description='Consulta las clases por idioma y filtra las que te interesan.'
        entries={entries}
        loading={loading}
        error={error}
        emptyMessage='Aun no hay clases cargadas para este calendario.'
        topActions={
          <Button
            type='button'
            variant='outline'
            onClick={() => setIsPrefsModalOpen(true)}
          >
            <BellIcon data-icon='inline-start' />
            Preferencias de recordatorios
          </Button>
        }
      />

      <Dialog open={isPrefsModalOpen} onOpenChange={setIsPrefsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recordatorios de clases</DialogTitle>
            <DialogDescription>
              Configura que clases quieres seguir con notificaciones al entrar a la app.
            </DialogDescription>
          </DialogHeader>

          <div
            className={
              hasReachedReminderLimit
                ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
                : 'rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground'
            }
          >
            Maximo {MAX_ACTIVE_REMINDERS} recordatorios activos a la vez.
            {hasReachedReminderLimit &&
              ' Ya llegaste al limite, desactiva uno para activar otro.'}
          </div>

          <div className='max-h-[55dvh] overflow-y-auto pr-1'>
            <div className='flex flex-col gap-3'>
            {classOptions.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                No hay clases disponibles para configurar por ahora.
              </p>
            )}

            {classOptions.map((option) => {
              const preference = preferencesByClass.get(option.classKey)
              const enabled = preference?.notificationsEnabled ?? false
              const minutesBefore = preference?.minutesBefore ?? 30
              const isUpdating = updatingClassKey === option.classKey
              const canEnable = enabled || !hasReachedReminderLimit
              const flag = LANGUAGE_FLAGS[option.languageCode] || '🌐'

              return (
                <div key={option.classKey} className='rounded-lg border p-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='text-sm font-semibold'>
                        {flag} {option.className}
                      </p>
                    </div>

                    <div className='flex items-center gap-2'>
                      <Label htmlFor={`notification-${option.classKey}`}>Avisar</Label>
                      <Switch
                        id={`notification-${option.classKey}`}
                        checked={enabled}
                        disabled={isUpdating || !canEnable}
                        onCheckedChange={(checked) =>
                          void handleToggleNotifications(
                            option.classKey,
                            option.className,
                            option.languageCode,
                            checked,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className='mt-3 flex items-center gap-2'>
                    <Label htmlFor={`notification-minutes-${option.classKey}`}>Avisar</Label>
                    <Select
                      value={String(minutesBefore)}
                      onValueChange={(value) =>
                        void handleChangeMinutesBefore(
                          option.classKey,
                          option.className,
                          option.languageCode,
                          Number(value),
                        )
                      }
                      disabled={isUpdating || !enabled}
                    >
                      <SelectTrigger id={`notification-minutes-${option.classKey}`}>
                        <SelectValue placeholder='Tiempo' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Anticipacion</SelectLabel>
                          {REMINDER_OPTIONS.map((optionMinutes) => (
                            <SelectItem key={optionMinutes} value={String(optionMinutes)}>
                              {optionMinutes} min antes
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )
            })}
            </div>
          </div>

          <DialogFooter>
            <Button type='button' onClick={() => setIsPrefsModalOpen(false)}>
              <CheckIcon data-icon='inline-start' />
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
