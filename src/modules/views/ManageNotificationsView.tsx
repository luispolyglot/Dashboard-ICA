import { useEffect, useState } from 'react'
import { BellIcon, SmartphoneIcon } from 'lucide-react'
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
  disablePushOnCurrentDevice,
  enablePushOnCurrentDevice,
  getCurrentPushSubscriptionEndpoint,
  getPushPermissionState,
  listMyPushDevices,
} from '../services/pushNotifications'
import type {
  PushReminderPreferences,
  PushReminderPreferencesInput,
  PushSubscriptionDevice,
} from '../types'

const REMINDER_HOUR_OPTIONS = Array.from({ length: 19 }, (_, index) => index + 5)

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
        Configura recordatorios push de rachas y avisos de habito.
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
                    El navegador bloqueo permisos. Debes habilitarlos manualmente.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className='space-y-3'>
            <div className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='space-y-1'>
                  <p className='text-sm font-semibold'>Racha ICA no completada hoy</p>
                  <p className='text-xs text-muted-foreground'>
                    Te avisa si hoy aun no cerraste la racha de creacion ICA.
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
                    Te avisa si hoy aun no cerraste la racha de flashcards.
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
                  <p className='text-sm font-semibold'>Aviso de perdida de habito</p>
                  <p className='text-xs text-muted-foreground'>
                    Recibes avisos tras 36h, 72h y 7 dias sin actividad en la app.
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
