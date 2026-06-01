import { useEffect, useState } from 'react'
import {
  BellIcon,
  CheckIcon,
  SmartphoneIcon,
  Volume1,
  VolumeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { getCalendarIcademyCatalogEntry } from '../constants/calendarIcademyCatalog'
import { fetchCalendarIcademyEntries } from '../services/calendarIcademy'
import {
  fetchCalendarIcademyPreferences,
  upsertCalendarIcademyPreference,
} from '../services/calendarIcademyPreferences'
import {
  fetchCalendarIcademySessionBlacklist,
  silenceCalendarIcademySession,
  unsilenceCalendarIcademySession,
} from '../services/calendarIcademySessionBlacklist'
import {
  disablePushOnCurrentDevice,
  enablePushOnCurrentDevice,
  getCurrentPushSubscriptionEndpoint,
  getPushPermissionState,
  listMyPushDevices,
} from '../services/pushNotifications'
import {
  CALENDAR_ICADEMY_TIMEZONE,
  getCalendarIcademyTodayKey,
  parseCalendarIcademySessionDateTime,
} from '../utils/calendarIcademyTime'
import type {
  CalendarIcademyEntry,
  CalendarIcademyPreference,
  CalendarIcademyPreferenceInput,
  CalendarIcademySessionBlacklistItem,
  PushSubscriptionDevice,
} from '../types'

const REMINDER_OPTIONS = [10, 20, 30, 60, 120]
const MAX_NON_SPECIAL_ACTIVE_REMINDERS = 2
const SPECIAL_CLASS_KEY = 'destripando_niveles'
const LOCAL_TIME_STORAGE_KEY = 'calendar-icademy-show-local-time'

function formatDateLabelByTimezone(date: Date, timeZone: string): string {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  })
}

function formatTimeLabelByTimezone(date: Date, timeZone: string): string {
  const label = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
  return label.endsWith(':00')
    ? `${label.slice(0, 2)}h`
    : label.replace(':', 'h')
}

export function CalendarIcademyView() {
  const [entries, setEntries] = useState<CalendarIcademyEntry[]>([])
  const [preferences, setPreferences] = useState<CalendarIcademyPreference[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLocalTime, setShowLocalTime] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(LOCAL_TIME_STORAGE_KEY) === '1'
  })
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] =
    useState<CalendarIcademyEntry | null>(null)
  const [updatingClassKey, setUpdatingClassKey] = useState<string | null>(null)
  const [pushDevices, setPushDevices] = useState<PushSubscriptionDevice[]>([])
  const [currentPushEndpoint, setCurrentPushEndpoint] = useState<string | null>(
    null,
  )
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported')
  const [isUpdatingPushDevice, setIsUpdatingPushDevice] = useState(false)
  const [mutedSessions, setMutedSessions] = useState<
    CalendarIcademySessionBlacklistItem[]
  >([])
  const [isUpdatingSessionMute, setIsUpdatingSessionMute] = useState(false)
  const localTimezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined
  const canUseLocalTime =
    Boolean(localTimezone) && localTimezone !== CALENDAR_ICADEMY_TIMEZONE

  useEffect(() => {
    let mounted = true

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const [calendarEntries, preferenceEntries, mutedSessionEntries] =
          await Promise.all([
            fetchCalendarIcademyEntries(),
            fetchCalendarIcademyPreferences().catch(() => []),
            fetchCalendarIcademySessionBlacklist().catch(() => []),
          ])
        if (!mounted) return
        setEntries(calendarEntries)
        setPreferences(preferenceEntries)
        setMutedSessions(mutedSessionEntries)
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

  const refreshPushStatus = async () => {
    const permission = getPushPermissionState()
    setPushPermission(permission)

    if (permission === 'unsupported') {
      setPushDevices([])
      setCurrentPushEndpoint(null)
      return
    }

    try {
      const [devices, endpoint] = await Promise.all([
        listMyPushDevices().catch(() => []),
        getCurrentPushSubscriptionEndpoint(),
      ])
      setPushDevices(devices)
      setCurrentPushEndpoint(endpoint)
    } catch {
      setPushDevices([])
      setCurrentPushEndpoint(null)
    }
  }

  useEffect(() => {
    void refreshPushStatus()
  }, [])

  const classOptions = Array.from(
    entries
      .reduce((acc, entry) => {
        if (!acc.has(entry.classKey)) {
          const catalogEntry = getCalendarIcademyCatalogEntry(entry.classKey)
          acc.set(entry.classKey, {
            classKey: entry.classKey,
            className: catalogEntry?.className || entry.className,
            languageCode: catalogEntry?.languageCode || entry.languageCode,
            flag: catalogEntry?.flag || '🌐',
          })
        }
        return acc
      }, new Map<string, { classKey: string; className: string; languageCode: string; flag: string }>())
      .values(),
  ).sort((a, b) => a.className.localeCompare(b.className))

  const preferencesByClass = preferences.reduce((acc, preference) => {
    acc.set(preference.classKey, preference)
    return acc
  }, new Map<string, CalendarIcademyPreference>())

  const activeReminderPreferences = preferences.filter(
    (item) => item.notificationsEnabled,
  )
  const activeSpecialReminder = activeReminderPreferences.some(
    (item) => item.classKey === SPECIAL_CLASS_KEY,
  )
  const activeNonSpecialReminderCount = activeReminderPreferences.filter(
    (item) => item.classKey !== SPECIAL_CLASS_KEY,
  ).length
  const hasReachedNonSpecialReminderLimit =
    activeNonSpecialReminderCount >= MAX_NON_SPECIAL_ACTIVE_REMINDERS
  const activePushDevicesCount = pushDevices.filter(
    (device) => device.isActive,
  ).length
  const isCurrentDeviceActive = Boolean(
    currentPushEndpoint &&
    pushDevices.some(
      (device) => device.endpoint === currentPushEndpoint && device.isActive,
    ),
  )
  const todayKey = getCalendarIcademyTodayKey()
  const mutedSessionIds = new Set(
    mutedSessions.map((item) => item.calendarEntryId),
  )
  const selectedEntryPreference = selectedEntry
    ? preferencesByClass.get(selectedEntry.classKey)
    : null
  const canManageSelectedEntryMute = Boolean(
    selectedEntryPreference?.notificationsEnabled,
  )
  const isSelectedEntryMuted = selectedEntry
    ? mutedSessionIds.has(selectedEntry.id)
    : false

  const canMuteEntry = (entry: CalendarIcademyEntry): boolean => {
    const preference = preferencesByClass.get(entry.classKey)
    return Boolean(preference?.notificationsEnabled)
  }

  const getEntryDateTimeDescription = (entry: CalendarIcademyEntry): string => {
    const sessionDateTime = parseCalendarIcademySessionDateTime({
      sessionDate: entry.sessionDate,
      sessionTime: entry.sessionTime,
    })
    if (!sessionDateTime) return `${entry.sessionDate} · ${entry.sessionTime}`

    if (showLocalTime && canUseLocalTime && localTimezone) {
      const localDate = formatDateLabelByTimezone(
        sessionDateTime,
        localTimezone,
      )
      const localTime = formatTimeLabelByTimezone(
        sessionDateTime,
        localTimezone,
      )
      const spainTime = formatTimeLabelByTimezone(
        sessionDateTime,
        CALENDAR_ICADEMY_TIMEZONE,
      )
      return `${localDate} · ${localTime} (${spainTime} 🇪🇸)`
    }

    const spainDate = formatDateLabelByTimezone(
      sessionDateTime,
      CALENDAR_ICADEMY_TIMEZONE,
    )
    const spainTime = formatTimeLabelByTimezone(
      sessionDateTime,
      CALENDAR_ICADEMY_TIMEZONE,
    )
    return `${spainDate} · ${spainTime}`
  }

  const savePreference = async (input: CalendarIcademyPreferenceInput) => {
    setUpdatingClassKey(input.classKey)

    try {
      const saved = await upsertCalendarIcademyPreference(input)
      setPreferences((prev) => {
        const withoutCurrent = prev.filter(
          (item) => item.classKey !== saved.classKey,
        )
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

  const handleEnablePushOnDevice = async () => {
    setIsUpdatingPushDevice(true)
    try {
      await enablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success('Notificaciones push activadas en este dispositivo.')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo activar push en este dispositivo.'
      toast.error(message)
    } finally {
      setIsUpdatingPushDevice(false)
    }
  }

  const handleDisablePushOnDevice = async () => {
    setIsUpdatingPushDevice(true)
    try {
      await disablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success('Notificaciones push desactivadas en este dispositivo.')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo desactivar push en este dispositivo.'
      toast.error(message)
    } finally {
      setIsUpdatingPushDevice(false)
    }
  }

  const handleToggleEntrySilence = async (entry: CalendarIcademyEntry) => {
    if (!canMuteEntry(entry)) return

    const entryMuted = mutedSessionIds.has(entry.id)

    setIsUpdatingSessionMute(true)
    try {
      if (entryMuted) {
        await unsilenceCalendarIcademySession(entry.id)
        setMutedSessions((prev) =>
          prev.filter((item) => item.calendarEntryId !== entry.id),
        )
        toast.success('Sesión reactivada para notificaciones.', {
          description: `${entry.className} · ${entry.sessionTime}`,
        })
      } else {
        const mutedItem = await silenceCalendarIcademySession({
          calendarEntryId: entry.id,
          classKey: entry.classKey,
        })
        setMutedSessions((prev) => {
          const withoutCurrent = prev.filter(
            (item) => item.calendarEntryId !== mutedItem.calendarEntryId,
          )
          return [mutedItem, ...withoutCurrent]
        })
        toast.success('Sesión silenciada.', {
          description: 'No enviaremos recordatorio para esta clase puntual.',
        })
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el silencio de la sesion.'
      toast.error(message)
    } finally {
      setIsUpdatingSessionMute(false)
    }
  }

  const handleToggleSessionSilence = async () => {
    if (!selectedEntry || !canManageSelectedEntryMute) return
    await handleToggleEntrySilence(selectedEntry)
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
        lockToCurrentMonth
        onEntryClick={(entry) => setSelectedEntry(entry)}
        onLocalTimePreferenceChange={setShowLocalTime}
        canMuteEntry={canMuteEntry}
        isEntryMuted={(entry) => mutedSessionIds.has(entry.id)}
        onToggleEntryMute={(entry) => {
          void handleToggleEntrySilence(entry)
        }}
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

      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedEntry(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className='flex items-center gap-2'>
              <DialogTitle>
                {selectedEntry
                  ? `${getCalendarIcademyCatalogEntry(selectedEntry.classKey)?.flag || '🌐'} ${getCalendarIcademyCatalogEntry(selectedEntry.classKey)?.className || selectedEntry.className}`
                  : 'Clase'}
              </DialogTitle>
              {selectedEntry && selectedEntry.sessionDate === todayKey && (
                <Badge className='h-auto px-2 py-0 text-[10px]'>Hoy</Badge>
              )}
            </div>
            <DialogDescription>
              {selectedEntry ? getEntryDateTimeDescription(selectedEntry) : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className='space-y-2 text-sm'>
              <p>
                <span className='font-medium'>Profesor:</span>{' '}
                {selectedEntry.teacher}
              </p>

              {canManageSelectedEntryMute ? (
                <div className='pt-2'>
                  <Button
                    type='button'
                    variant={isSelectedEntryMuted ? 'outline' : 'secondary'}
                    size='sm'
                    disabled={isUpdatingSessionMute}
                    onClick={() => void handleToggleSessionSilence()}
                  >
                    {isSelectedEntryMuted ? <Volume1 /> : <VolumeOff />}
                    {isSelectedEntryMuted
                      ? 'Cancelar silencio de esta sesión'
                      : 'Silenciar esta sesión'}
                  </Button>
                </div>
              ) : (
                <p className='pt-2 text-xs text-muted-foreground'>
                  Para silenciar esta sesión, primero activa recordatorios para
                  esta clase en "Preferencias de recordatorios".
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPrefsModalOpen} onOpenChange={setIsPrefsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recordatorios de clases</DialogTitle>
            <DialogDescription>
              Configura que clases quieres seguir con notificaciones al entrar a
              la app.
            </DialogDescription>
          </DialogHeader>

          <div className='rounded-lg border border-border bg-muted/30 px-3 py-2'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <p className='text-sm font-medium'>
                Notificaciones push en este dispositivo
              </p>
              <p className='text-xs text-muted-foreground'>
                Dispositivos activos: {activePushDevicesCount}
              </p>
            </div>

            {pushPermission === 'unsupported' ? (
              <p className='text-sm text-muted-foreground'>
                Este navegador no soporta notificaciones push.
              </p>
            ) : (
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  variant={isCurrentDeviceActive ? 'outline' : 'default'}
                  onClick={() => void handleEnablePushOnDevice()}
                  disabled={isUpdatingPushDevice}
                >
                  <SmartphoneIcon data-icon='inline-start' />
                  {isCurrentDeviceActive
                    ? 'Push activo'
                    : 'Activar en este dispositivo'}
                </Button>

                {isCurrentDeviceActive && (
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void handleDisablePushOnDevice()}
                    disabled={isUpdatingPushDevice}
                  >
                    Desactivar en este dispositivo
                  </Button>
                )}

                {pushPermission === 'denied' && (
                  <p className='text-xs text-amber-600'>
                    El navegador bloqueo permisos. Debes habilitarlos
                    manualmente.
                  </p>
                )}
              </div>
            )}
          </div>

          <div
            className={
              hasReachedNonSpecialReminderLimit
                ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
                : 'rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground'
            }
          >
            Puedes activar hasta {MAX_NON_SPECIAL_ACTIVE_REMINDERS} clases +
            Destripando Niveles opcional.
            {hasReachedNonSpecialReminderLimit &&
              (activeSpecialReminder
                ? ' Ya llegaste al limite total de recordatorios activos.'
                : ' Ya activaste 2 clases. Aun puedes activar Destripando Niveles.')}
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
                const isSpecialClass = option.classKey === SPECIAL_CLASS_KEY
                const canEnable =
                  enabled ||
                  (isSpecialClass
                    ? !activeSpecialReminder
                    : activeNonSpecialReminderCount <
                      MAX_NON_SPECIAL_ACTIVE_REMINDERS)
                const flag = option.flag

                return (
                  <div key={option.classKey} className='rounded-lg border p-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <div>
                        <p className='text-sm font-semibold'>
                          {flag} {option.className}
                        </p>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Label htmlFor={`notification-${option.classKey}`}>
                          Avisar
                        </Label>
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
                      <Label
                        htmlFor={`notification-minutes-${option.classKey}`}
                      >
                        Avisar
                      </Label>
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
                        <SelectTrigger
                          id={`notification-minutes-${option.classKey}`}
                        >
                          <SelectValue placeholder='Tiempo' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Anticipacion</SelectLabel>
                            {REMINDER_OPTIONS.map((optionMinutes) => (
                              <SelectItem
                                key={optionMinutes}
                                value={String(optionMinutes)}
                              >
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
