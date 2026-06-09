import { useEffect, useState } from 'react'
import { BellIcon, SmartphoneIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  fetchPushReminderPreferences,
  upsertPushReminderPreferences,
} from '../services/pushReminderPreferences'
import {
  fetchMyCalendarIcademyTeacherNotificationPreference,
  upsertMyCalendarIcademyTeacherNotificationPreference,
} from '../services/calendarIcademyTeacherNotifications'
import {
  disablePushOnCurrentDevice,
  enablePushOnCurrentDevice,
  getCurrentPushSubscriptionEndpoint,
  getPushPermissionState,
  listMyPushDevices,
} from '../services/pushNotifications'
import {
  fetchMyCoachingNotificationPreference,
  upsertMyCoachingNotificationPreference,
} from '../services/coachingNotificationPreferences'
import { fetchCoachingAccess } from '../services/coaching'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type {
  CalendarIcademyTeacherNotificationPreference,
  CalendarIcademyTeacherNotificationPreferenceInput,
  CoachingNotificationPreference,
  CoachingNotificationPreferenceInput,
  PushReminderPreferences,
  PushReminderPreferencesInput,
  PushSubscriptionDevice,
} from '../types'

const CALENDAR_REMINDER_OPTIONS = [10, 20, 30, 60, 120]
const REMINDER_HOUR_OPTIONS = Array.from(
  { length: 19 },
  (_, index) => index + 5,
)

function getDefaultReminderPreferences(): PushReminderPreferences {
  return {
    userId: '',
    icaStreakEnabled: false,
    icaStreakHour: 20,
    flashcardsStreakEnabled: false,
    flashcardsStreakHour: 20,
    habitLossEnabled: false,
    habitLossLastStage: 0,
    createdAt: null,
    updatedAt: null,
  }
}

function formatReminderHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function ManageNotificationsView() {
  const [reminderPrefs, setReminderPrefs] = useState<PushReminderPreferences>(
    getDefaultReminderPreferences,
  )
  const [isLoadingReminderPrefs, setIsLoadingReminderPrefs] = useState(true)
  const [isSavingReminderPrefs, setIsSavingReminderPrefs] = useState(false)
  const [pushDevices, setPushDevices] = useState<PushSubscriptionDevice[]>([])
  const [currentPushEndpoint, setCurrentPushEndpoint] = useState<string | null>(
    null,
  )
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported')
  const [isUpdatingPushDevice, setIsUpdatingPushDevice] = useState(false)
  const [teacherReminderPrefs, setTeacherReminderPrefs] =
    useState<CalendarIcademyTeacherNotificationPreference | null>(null)
  const [isLoadingTeacherReminderPrefs, setIsLoadingTeacherReminderPrefs] =
    useState(true)
  const [isSavingTeacherReminderPrefs, setIsSavingTeacherReminderPrefs] =
    useState(false)
  const [isCoachingAdmin, setIsCoachingAdmin] = useState(false)
  const [coachingNotificationPrefs, setCoachingNotificationPrefs] =
    useState<CoachingNotificationPreference | null>(null)
  const [isLoadingCoachingNotificationPrefs, setIsLoadingCoachingNotificationPrefs] =
    useState(true)
  const [isSavingCoachingNotificationPrefs, setIsSavingCoachingNotificationPrefs] =
    useState(false)

  useEffect(() => {
    let active = true

    const run = async () => {
      setIsLoadingReminderPrefs(true)
      try {
        const prefs = await fetchPushReminderPreferences()
        if (!active) return
        setReminderPrefs(prefs)
      } catch {
        if (!active) return
        setReminderPrefs(getDefaultReminderPreferences())
      } finally {
        if (!active) return
        setIsLoadingReminderPrefs(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const run = async () => {
      setIsLoadingCoachingNotificationPrefs(true)
      try {
        const access = await fetchCoachingAccess()
        if (!active) return

        const isAdmin = Boolean(access?.isCoachingAdmin)
        setIsCoachingAdmin(isAdmin)

        if (!isAdmin) {
          setCoachingNotificationPrefs(null)
          return
        }

        const prefs = await fetchMyCoachingNotificationPreference()
        if (!active) return
        setCoachingNotificationPrefs(prefs)
      } catch {
        if (!active) return
        setCoachingNotificationPrefs(null)
      } finally {
        if (!active) return
        setIsLoadingCoachingNotificationPrefs(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const run = async () => {
      setIsLoadingTeacherReminderPrefs(true)
      try {
        const prefs = await fetchMyCalendarIcademyTeacherNotificationPreference()
        if (!active) return
        setTeacherReminderPrefs(prefs)
      } catch {
        if (!active) return
        setTeacherReminderPrefs(null)
      } finally {
        if (!active) return
        setIsLoadingTeacherReminderPrefs(false)
      }
    }

    void run()

    return () => {
      active = false
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

  const activePushDevicesCount = pushDevices.filter(
    (device) => device.isActive,
  ).length
  const isCurrentDeviceActive = Boolean(
    currentPushEndpoint &&
    pushDevices.some(
      (device) => device.endpoint === currentPushEndpoint && device.isActive,
    ),
  )

  const saveReminderPreferences = async (
    next: PushReminderPreferencesInput,
  ): Promise<void> => {
    setIsSavingReminderPrefs(true)
    try {
      const saved = await upsertPushReminderPreferences(next)
      setReminderPrefs(saved)
    } finally {
      setIsSavingReminderPrefs(false)
    }
  }

  const ensurePushOnCurrentDevice = async (): Promise<void> => {
    if (isCurrentDeviceActive) return
    await enablePushOnCurrentDevice()
    await refreshPushStatus()
  }

  const handleUpdateReminderPreferences = async (
    nextPartial: Partial<PushReminderPreferencesInput>,
  ): Promise<void> => {
    const next: PushReminderPreferencesInput = {
      icaStreakEnabled:
        nextPartial.icaStreakEnabled ?? reminderPrefs.icaStreakEnabled,
      icaStreakHour: nextPartial.icaStreakHour ?? reminderPrefs.icaStreakHour,
      flashcardsStreakEnabled:
        nextPartial.flashcardsStreakEnabled ??
        reminderPrefs.flashcardsStreakEnabled,
      flashcardsStreakHour:
        nextPartial.flashcardsStreakHour ?? reminderPrefs.flashcardsStreakHour,
      habitLossEnabled:
        nextPartial.habitLossEnabled ?? reminderPrefs.habitLossEnabled,
    }

    const isEnablingAnyReminder =
      next.icaStreakEnabled ||
      next.flashcardsStreakEnabled ||
      next.habitLossEnabled

    try {
      if (isEnablingAnyReminder) {
        await ensurePushOnCurrentDevice()
      }
      await saveReminderPreferences(next)
      toast.success('Preferencias de notificaciones actualizadas.')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar las notificaciones.'
      toast.error(message)
    }
  }

  const saveTeacherReminderPreferences = async (
    next: CalendarIcademyTeacherNotificationPreferenceInput,
  ): Promise<void> => {
    setIsSavingTeacherReminderPrefs(true)
    try {
      const saved =
        await upsertMyCalendarIcademyTeacherNotificationPreference(next)
      setTeacherReminderPrefs(saved)
    } finally {
      setIsSavingTeacherReminderPrefs(false)
    }
  }

  const handleUpdateTeacherReminderPreferences = async (
    nextPartial: Partial<CalendarIcademyTeacherNotificationPreferenceInput>,
  ): Promise<void> => {
    if (!teacherReminderPrefs) return

    const next: CalendarIcademyTeacherNotificationPreferenceInput = {
      notificationsEnabled:
        nextPartial.notificationsEnabled ?? teacherReminderPrefs.notificationsEnabled,
      minutesBefore:
        nextPartial.minutesBefore ?? teacherReminderPrefs.minutesBefore,
      quietHoursStart:
        nextPartial.quietHoursStart ?? teacherReminderPrefs.quietHoursStart,
      quietHoursEnd: nextPartial.quietHoursEnd ?? teacherReminderPrefs.quietHoursEnd,
    }

    try {
      if (next.notificationsEnabled) {
        await ensurePushOnCurrentDevice()
      }
      await saveTeacherReminderPreferences(next)
      toast.success('Preferencias de profesor actualizadas.')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar las notificaciones de profesor.'
      toast.error(message)
    }
  }

  const saveCoachingNotificationPreferences = async (
    next: CoachingNotificationPreferenceInput,
  ): Promise<void> => {
    setIsSavingCoachingNotificationPrefs(true)
    try {
      const saved = await upsertMyCoachingNotificationPreference(next)
      setCoachingNotificationPrefs(saved)
    } finally {
      setIsSavingCoachingNotificationPrefs(false)
    }
  }

  const handleUpdateCoachingNotificationPreferences = async (
    nextPartial: Partial<CoachingNotificationPreferenceInput>,
  ): Promise<void> => {
    if (!coachingNotificationPrefs) return

    const next: CoachingNotificationPreferenceInput = {
      masterNoteClosedEnabled:
        nextPartial.masterNoteClosedEnabled ??
        coachingNotificationPrefs.masterNoteClosedEnabled,
    }

    try {
      if (next.masterNoteClosedEnabled) {
        await ensurePushOnCurrentDevice()
      }
      await saveCoachingNotificationPreferences(next)
      toast.success('Preferencias de coaching actualizadas.')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar las notificaciones de coaching.'
      toast.error(message)
    }
  }

  const handleEnablePushOnDevice = async (): Promise<void> => {
    if (isUpdatingPushDevice) return
    setIsUpdatingPushDevice(true)
    try {
      await enablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success('Notificaciones activadas en este dispositivo.')
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

  const handleDisablePushOnDevice = async (): Promise<void> => {
    if (isUpdatingPushDevice) return
    setIsUpdatingPushDevice(true)
    try {
      await disablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success('Notificaciones desactivadas en este dispositivo.')
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

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold'>🔔 Notificaciones</h2>
      <p className='mb-6 text-sm text-muted-foreground'>
        Configura recordatorios push de rachas y avisos de hábito.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BellIcon className='h-4 w-4' />
            Preferencias push
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
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
                  <SmartphoneIcon />
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
                    El navegador bloqueó permisos. Debes habilitarlos
                    manualmente.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className='space-y-3'>
            <div className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold'>
                    Recordatorios de clases del calendario
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Esta preferencia se configura en Calendario ICADEMY.
                  </p>
                </div>
                <Button type='button' variant='outline' asChild>
                  <Link
                    to={`${DASHBOARD_ROUTES.calendarIcademy}?navigatefrom=notifications`}
                  >
                    Ir a Calendario ICADEMY
                  </Link>
                </Button>
              </div>
            </div>

            {!isLoadingTeacherReminderPrefs && teacherReminderPrefs && (
              <div className='rounded-lg border p-3'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='space-y-1'>
                    <p className='text-sm font-semibold'>
                      Recordatorios como profesor ICADEMY
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      Te avisa antes de tus clases asignadas como profesor.
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Label htmlFor='manage-teacher-reminder-switch'>Avisar</Label>
                    <Switch
                      id='manage-teacher-reminder-switch'
                      checked={teacherReminderPrefs.notificationsEnabled}
                      disabled={isSavingTeacherReminderPrefs}
                      onCheckedChange={(checked) =>
                        void handleUpdateTeacherReminderPreferences({
                          notificationsEnabled: checked,
                        })
                      }
                    />
                  </div>
                </div>

                <div className='mt-3 flex items-center gap-2'>
                  <Label htmlFor='manage-teacher-reminder-minutes'>Anticipación</Label>
                  <Select
                    value={String(teacherReminderPrefs.minutesBefore)}
                    onValueChange={(value) =>
                      void handleUpdateTeacherReminderPreferences({
                        minutesBefore: Number(value),
                      })
                    }
                    disabled={
                      isSavingTeacherReminderPrefs ||
                      !teacherReminderPrefs.notificationsEnabled
                    }
                  >
                    <SelectTrigger id='manage-teacher-reminder-minutes'>
                      <SelectValue placeholder='Selecciona minutos' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Minutos antes</SelectLabel>
                        {CALENDAR_REMINDER_OPTIONS.map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {minutes} min antes
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {!isLoadingCoachingNotificationPrefs &&
              isCoachingAdmin &&
              coachingNotificationPrefs && (
                <div className='rounded-lg border p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div className='space-y-1'>
                      <p className='text-sm font-semibold'>
                        Coaching: cierre de nota maestra
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        Te avisa cuando un alumno cierra una nota maestra dentro
                        de una semana de coaching activada.
                      </p>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Label htmlFor='manage-coaching-note-close-switch'>
                        Avisar
                      </Label>
                      <Switch
                        id='manage-coaching-note-close-switch'
                        checked={coachingNotificationPrefs.masterNoteClosedEnabled}
                        disabled={isSavingCoachingNotificationPrefs}
                        onCheckedChange={(checked) =>
                          void handleUpdateCoachingNotificationPreferences({
                            masterNoteClosedEnabled: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

            <div className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold'>
                    Racha ICA no completada hoy
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Te avisa si hoy aún no cerraste la racha de creación ICA.
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='manage-ica-reminder-switch'>Avisar</Label>
                  <Switch
                    id='manage-ica-reminder-switch'
                    checked={reminderPrefs.icaStreakEnabled}
                    disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
                    onCheckedChange={(checked) =>
                      void handleUpdateReminderPreferences({
                        icaStreakEnabled: checked,
                      })
                    }
                  />
                </div>
              </div>

              <div className='mt-3 flex items-center gap-2'>
                <Label htmlFor='manage-ica-reminder-hour'>Hora</Label>
                <Select
                  value={String(reminderPrefs.icaStreakHour)}
                  onValueChange={(value) =>
                    void handleUpdateReminderPreferences({
                      icaStreakHour: Number(value),
                    })
                  }
                  disabled={
                    isLoadingReminderPrefs ||
                    isSavingReminderPrefs ||
                    !reminderPrefs.icaStreakEnabled
                  }
                >
                  <SelectTrigger id='manage-ica-reminder-hour'>
                    <SelectValue placeholder='Selecciona una hora' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Hora local</SelectLabel>
                      {REMINDER_HOUR_OPTIONS.map((hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {formatReminderHour(hour)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold'>
                    Racha Flashcards no completada hoy
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Te avisa si hoy aún no cerraste la racha de flashcards.
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='manage-flash-reminder-switch'>Avisar</Label>
                  <Switch
                    id='manage-flash-reminder-switch'
                    checked={reminderPrefs.flashcardsStreakEnabled}
                    disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
                    onCheckedChange={(checked) =>
                      void handleUpdateReminderPreferences({
                        flashcardsStreakEnabled: checked,
                      })
                    }
                  />
                </div>
              </div>

              <div className='mt-3 flex items-center gap-2'>
                <Label htmlFor='manage-flash-reminder-hour'>Hora</Label>
                <Select
                  value={String(reminderPrefs.flashcardsStreakHour)}
                  onValueChange={(value) =>
                    void handleUpdateReminderPreferences({
                      flashcardsStreakHour: Number(value),
                    })
                  }
                  disabled={
                    isLoadingReminderPrefs ||
                    isSavingReminderPrefs ||
                    !reminderPrefs.flashcardsStreakEnabled
                  }
                >
                  <SelectTrigger id='manage-flash-reminder-hour'>
                    <SelectValue placeholder='Selecciona una hora' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Hora local</SelectLabel>
                      {REMINDER_HOUR_OPTIONS.map((hour) => (
                        <SelectItem key={hour} value={String(hour)}>
                          {formatReminderHour(hour)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold'>
                    Aviso de pérdida de hábito
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Recibes avisos tras 36h, 72h y 7 dias sin actividad en la
                    app.
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Label htmlFor='manage-habit-reminder-switch'>Avisar</Label>
                  <Switch
                    id='manage-habit-reminder-switch'
                    checked={reminderPrefs.habitLossEnabled}
                    disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
                    onCheckedChange={(checked) =>
                      void handleUpdateReminderPreferences({
                        habitLossEnabled: checked,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
