import { t, tn, uiLocale } from '@/i18n'
import { useEffect, useState } from 'react'
import {
  BellIcon,
  BellRingIcon,
  CheckIcon,
  SmartphoneIcon,
  UserRoundIcon,
  Volume1,
  VolumeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
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
import { cn } from '@/lib/utils'
import { CalendarIcademyBoard } from '../components/calendar-icademy/CalendarIcademyBoard'
import {
  FlagTile,
  getClassMeta,
} from '../components/calendar-icademy/calendarIcademyUi'
import {
  getCalendarIcademyCatalogEntry,
  isCalendarIcademyClassRetired,
} from '../constants/calendarIcademyCatalog'
import { IconTile, ListRow, Pill } from '../game/ui'
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
  return date.toLocaleDateString(uiLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  })
}

function formatTimeLabelByTimezone(date: Date, timeZone: string): string {
  const label = date.toLocaleTimeString(uiLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
  return label.endsWith(':00')
    ? `${label.slice(0, 2)}h`
    : label.replace(':', 'h')
}

function getDateKeyByTimezone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '0000'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

export function CalendarIcademyView() {
  const [searchParams, setSearchParams] = useSearchParams()
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
  const displayTimezone =
    showLocalTime && canUseLocalTime && localTimezone
      ? localTimezone
      : CALENDAR_ICADEMY_TIMEZONE

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
        // Los avisos de clases que ya no se imparten no se enseñan (ni ocupan hueco a la vista)
        setPreferences(
          preferenceEntries.filter(
            (item) => !isCalendarIcademyClassRetired(item.classKey),
          ),
        )
        setMutedSessions(mutedSessionEntries)
      } catch (err) {
        if (!mounted) return
        const message =
          err instanceof Error
            ? err.message
            : t('No se pudo cargar el calendario de clases.')
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

  useEffect(() => {
    const fromNotifications =
      searchParams.get('navigatefrom') === 'notifications' ||
      searchParams.get('navigateFrom') === 'notifications'

    if (fromNotifications) {
      setIsPrefsModalOpen(true)
    }
  }, [searchParams])

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
  const isEntryInPastDay = (entry: CalendarIcademyEntry): boolean => {
    const sessionDateTime = parseCalendarIcademySessionDateTime({
      sessionDate: entry.sessionDate,
      sessionTime: entry.sessionTime,
    })
    if (!sessionDateTime) return false

    const entryDateKey = getDateKeyByTimezone(sessionDateTime, displayTimezone)
    const todayDateKey = getDateKeyByTimezone(new Date(), displayTimezone)
    return entryDateKey < todayDateKey
  }

  const selectedEntryPreference = selectedEntry
    ? preferencesByClass.get(selectedEntry.classKey)
    : null
  const isSelectedEntryPastDay = selectedEntry
    ? isEntryInPastDay(selectedEntry)
    : false
  const canManageSelectedEntryMute = Boolean(
    selectedEntryPreference?.notificationsEnabled && !isSelectedEntryPastDay,
  )
  const isSelectedEntryMuted = selectedEntry
    ? mutedSessionIds.has(selectedEntry.id)
    : false

  const canMuteEntry = (entry: CalendarIcademyEntry): boolean => {
    const preference = preferencesByClass.get(entry.classKey)
    return Boolean(preference?.notificationsEnabled) && !isEntryInPastDay(entry)
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
        toast.success(t('Recordatorio activado para {name}.', { name: t(className) }), {
          description: t('{n} min antes de cada clase.', { n: saved.minutesBefore }),
        })
      } else {
        toast(t('Recordatorio desactivado.'), {
          description: t(className),
        })
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudo actualizar la preferencia de notificación.')
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

      toast.success(t('Preferencia guardada.'), {
        description: t('{name}: {n} min antes.', { name: t(className), n: minutesBefore }),
      })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudo actualizar el tiempo de recordatorio.')
      setError(message)
      toast.error(message)
    }
  }

  const handleEnablePushOnDevice = async () => {
    setIsUpdatingPushDevice(true)
    try {
      await enablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success(t('Notificaciones push activadas en este dispositivo.'))
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudo activar push en este dispositivo.')
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
      toast.success(t('Notificaciones push desactivadas en este dispositivo.'))
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudo desactivar push en este dispositivo.')
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
        toast.success(t('Sesión reactivada para notificaciones.'), {
          description: `${t(entry.className)} · ${entry.sessionTime}`,
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
        toast.success(t('Sesión silenciada.'), {
          description: t('No enviaremos recordatorio para esta clase puntual.'),
        })
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudo actualizar el silencio de la sesión.')
      toast.error(message)
    } finally {
      setIsUpdatingSessionMute(false)
    }
  }

  const handleToggleSessionSilence = async () => {
    if (!selectedEntry || !canManageSelectedEntryMute) return
    await handleToggleEntrySilence(selectedEntry)
  }

  const handleOpenPrefsModal = () => {
    setIsPrefsModalOpen(true)
  }

  const handlePrefsModalOpenChange = (nextOpen: boolean) => {
    setIsPrefsModalOpen(nextOpen)
    if (nextOpen) return

    const fromNotifications =
      searchParams.get('navigatefrom') === 'notifications' ||
      searchParams.get('navigateFrom') === 'notifications'

    if (!fromNotifications) return

    const next = new URLSearchParams(searchParams)
    next.delete('navigatefrom')
    next.delete('navigateFrom')
    setSearchParams(next, { replace: true })
  }

  const activeRemindersCount = activeReminderPreferences.length
  const selectedEntryMeta = selectedEntry
    ? getClassMeta(selectedEntry.classKey, selectedEntry)
    : null

  return (
    <>
      <CalendarIcademyBoard
        title={t('Calendario ICADEMY')}
        description={t('Clases en directo por idioma: elige las tuyas y mira cuándo son.')}
        entries={entries}
        loading={loading}
        error={error}
        emptyMessage={t('Aun no hay clases cargadas para este calendario.')}
        lockToCurrentMonth
        onEntryClick={(entry) => setSelectedEntry(entry)}
        onLocalTimePreferenceChange={setShowLocalTime}
        canMuteEntry={canMuteEntry}
        isEntryMuted={(entry) => mutedSessionIds.has(entry.id)}
        onToggleEntryMute={(entry) => {
          void handleToggleEntrySilence(entry)
        }}
        headerRight={
          <button
            type='button'
            onClick={handleOpenPrefsModal}
            aria-label={t('Preferencias de recordatorios')}
            className='ica-press relative flex size-11 items-center justify-center rounded-2xl border-2 border-border bg-card dark:bg-transparent'
            style={{
              boxShadow: '0 3px 0 var(--border)',
              color:
                activeRemindersCount > 0
                  ? 'var(--ica-gold-ink)'
                  : 'var(--muted-foreground)',
            }}
          >
            <BellIcon className='size-5' strokeWidth={2.6} />
            {activeRemindersCount > 0 ? (
              <span
                className='absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-[11px] font-black'
                style={{ background: 'var(--ica-gold)', color: '#4a3200' }}
              >
                {activeRemindersCount}
              </span>
            ) : null}
          </button>
        }
        settingsRows={
          <ListRow
            onClick={handleOpenPrefsModal}
            icon={
              <IconTile tone='gold' size={48}>
                <BellRingIcon className='size-6' strokeWidth={2.4} />
              </IconTile>
            }
            title={t('Recordatorios')}
            text={
              activeRemindersCount > 0
                ? tn(activeRemindersCount, 'Activos para {n} clase', 'Activos para {n} clases')
                : t('Te avisamos antes de tus clases')
            }
          />
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
            <div className='flex items-center gap-3'>
              {selectedEntryMeta ? (
                <FlagTile meta={selectedEntryMeta} size={52} />
              ) : null}
              <div className='min-w-0 text-left'>
                <div className='flex flex-wrap items-center gap-2'>
                  <DialogTitle>
                    {selectedEntryMeta ? t(selectedEntryMeta.className) : t('Clase')}
                  </DialogTitle>
                  {selectedEntry && selectedEntry.sessionDate === todayKey && (
                    <Pill tone='primary' solid>
                      {t('Hoy')}
                    </Pill>
                  )}
                </div>
                <DialogDescription className='first-letter:uppercase'>
                  {selectedEntry ? getEntryDateTimeDescription(selectedEntry) : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedEntry && (
            <div className='flex flex-col gap-3 text-sm'>
              <div className='flex items-center gap-3 rounded-2xl border-2 border-border px-3 py-2.5'>
                <IconTile tone='neutral' size={40}>
                  <UserRoundIcon className='size-5' strokeWidth={2.4} />
                </IconTile>
                <p className='m-0'>
                  <span className='block text-xs font-bold text-muted-foreground'>
                    {t('Profesor')}
                  </span>
                  <span className='block font-extrabold'>
                    {selectedEntry.teacher}
                  </span>
                </p>
              </div>

              {canManageSelectedEntryMute ? (
                <Button
                  type='button'
                  variant={isSelectedEntryMuted ? 'outline' : 'secondary'}
                  size='lg'
                  className='w-full'
                  disabled={isUpdatingSessionMute}
                  onClick={() => void handleToggleSessionSilence()}
                >
                  {isSelectedEntryMuted ? <Volume1 /> : <VolumeOff />}
                  {isSelectedEntryMuted
                    ? t('Cancelar silencio de esta sesión')
                    : t('Silenciar esta sesión')}
                </Button>
              ) : (
                <p className='m-0 rounded-2xl bg-muted px-3 py-2.5 text-xs font-semibold text-muted-foreground'>
                  {isSelectedEntryPastDay
                    ? t('No puedes silenciar sesiones de días pasados.')
                    : t('Para silenciar esta sesión, primero activa el recordatorio de esta clase en «Recordatorios».')}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPrefsModalOpen} onOpenChange={handlePrefsModalOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Recordatorios de clases')}</DialogTitle>
            <DialogDescription>
              {t('Elige de qué clases quieres un aviso antes de que empiecen.')}
            </DialogDescription>
          </DialogHeader>

          <div className='rounded-2xl border-2 border-border px-3 py-3'>
            <div className='mb-3 flex items-center gap-3'>
              <IconTile tone='i' size={40}>
                <SmartphoneIcon className='size-5' strokeWidth={2.4} />
              </IconTile>
              <div className='min-w-0 flex-1'>
                <p className='m-0 text-sm font-extrabold'>
                  {t('Notificaciones push en este dispositivo')}
                </p>
                <p className='m-0 text-xs font-semibold text-muted-foreground'>
                  {t('Dispositivos activos: {n}', { n: activePushDevicesCount })}
                </p>
              </div>
            </div>

            {pushPermission === 'unsupported' ? (
              <p className='m-0 text-sm font-semibold text-muted-foreground'>
                {t('Este navegador no soporta notificaciones push.')}
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
                    ? t('Push activo')
                    : t('Activar en este dispositivo')}
                </Button>

                {isCurrentDeviceActive && (
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void handleDisablePushOnDevice()}
                    disabled={isUpdatingPushDevice}
                  >
                    {t('Desactivar en este dispositivo')}
                  </Button>
                )}

                {pushPermission === 'denied' && (
                  <p
                    className='m-0 text-xs font-bold'
                    style={{ color: 'var(--ica-gold-ink)' }}
                  >
                    {t('El navegador bloqueó los permisos. Tienes que habilitarlos a mano.')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div
            className={cn(
              'rounded-2xl px-3 py-2.5 text-sm font-semibold',
              !hasReachedNonSpecialReminderLimit && 'bg-muted text-muted-foreground',
            )}
            style={
              hasReachedNonSpecialReminderLimit
                ? { background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }
                : undefined
            }
          >
            {t('Puedes activar hasta {n} clases + Destripando Niveles opcional.', {
              n: MAX_NON_SPECIAL_ACTIVE_REMINDERS,
            })}
            {hasReachedNonSpecialReminderLimit &&
              ` ${
                activeSpecialReminder
                  ? t('Ya llegaste al límite total de recordatorios activos.')
                  : t('Ya activaste 2 clases. Aún puedes activar Destripando Niveles.')
              }`}
          </div>

          <div className='max-h-[55dvh] overflow-y-auto pr-1'>
            <div className='flex flex-col gap-2'>
              {classOptions.length === 0 && (
                <p className='text-sm font-semibold text-muted-foreground'>
                  {t('No hay clases disponibles para configurar por ahora.')}
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
                const meta = getClassMeta(option.classKey, option)

                return (
                  <div
                    key={option.classKey}
                    className={cn(
                      'rounded-2xl border-2 p-3 transition-colors',
                      enabled ? 'border-[var(--ica-gold)]' : 'border-border',
                    )}
                    style={enabled ? { background: 'var(--ica-gold-soft)' } : undefined}
                  >
                    <div className='flex items-center gap-3'>
                      <FlagTile meta={meta} size={40} />
                      <p className='m-0 min-w-0 flex-1 truncate text-sm font-extrabold'>
                        {t(option.className)}
                      </p>

                      <div className='flex items-center gap-2'>
                        <Label
                          htmlFor={`notification-${option.classKey}`}
                          className='text-xs font-bold text-muted-foreground'
                        >
                          {t('Avisar')}
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

                    {enabled ? (
                      <div className='mt-3 flex items-center gap-2 pl-[3.25rem]'>
                        <Label
                          htmlFor={`notification-minutes-${option.classKey}`}
                          className='text-xs font-bold text-muted-foreground'
                        >
                          {t('Avisar')}
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
                            <SelectValue placeholder={t('Tiempo')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>{t('Antelación')}</SelectLabel>
                              {REMINDER_OPTIONS.map((optionMinutes) => (
                                <SelectItem
                                  key={optionMinutes}
                                  value={String(optionMinutes)}
                                >
                                  {t('{n} min antes', { n: optionMinutes })}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type='button' onClick={() => setIsPrefsModalOpen(false)}>
              <CheckIcon data-icon='inline-start' />
              {t('Cerrar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
