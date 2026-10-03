import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AudioLinesIcon,
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CalendarDaysIcon,
  ClockIcon,
  GraduationCapIcon,
  HourglassIcon,
  PresentationIcon,
  SmartphoneIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { FlameIcon, StreakClockIcon } from '../game/icons'
import { GamePage, IconTile, ListRow, PageTitle, Panel, Pill, RowGroup, SectionLabel, type Tone } from '../game/ui'
import type {
  CalendarIcademyTeacherNotificationPreference,
  CalendarIcademyTeacherNotificationPreferenceInput,
  CoachingNotificationPreference,
  CoachingNotificationPreferenceInput,
  PushReminderPreferences,
  PushReminderPreferencesInput,
  PushSubscriptionDevice,
} from '../types'
import { t } from '@/i18n'

const CALENDAR_REMINDER_OPTIONS = [10, 20, 30, 60, 120]
const COACHING_CLASS_REMINDER_OPTIONS: Array<10 | 30 | 60> = [10, 30, 60]
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
    streakRiskEnabled: true,
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
  const [isCoachingUser, setIsCoachingUser] = useState(false)
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
        const isUser = Boolean(access?.isCoachingUser)
        setIsCoachingAdmin(isAdmin)
        setIsCoachingUser(isUser)

        if (!isAdmin && !isUser) {
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
      streakRiskEnabled:
        nextPartial.streakRiskEnabled ?? reminderPrefs.streakRiskEnabled,
    }

    const isEnablingAnyReminder =
      next.icaStreakEnabled ||
      next.flashcardsStreakEnabled ||
      next.habitLossEnabled ||
      Boolean(nextPartial.streakRiskEnabled)

    try {
      if (isEnablingAnyReminder) {
        await ensurePushOnCurrentDevice()
      }
      await saveReminderPreferences(next)
      toast.success(t('Preferencias de notificaciones actualizadas.'))
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudieron actualizar las notificaciones.')
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
      toast.success(t('Preferencias de profesor actualizadas.'))
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudieron actualizar las notificaciones de profesor.')
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
      activeSessionEnabled:
        nextPartial.activeSessionEnabled ??
        coachingNotificationPrefs.activeSessionEnabled,
      classScheduleReminderMinutes:
        nextPartial.classScheduleReminderMinutes ??
        coachingNotificationPrefs.classScheduleReminderMinutes,
    }

    try {
      if (next.masterNoteClosedEnabled || next.activeSessionEnabled) {
        await ensurePushOnCurrentDevice()
      }
      await saveCoachingNotificationPreferences(next)
      toast.success(t('Preferencias de coaching actualizadas.'))
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('No se pudieron actualizar las notificaciones de coaching.')
      toast.error(message)
    }
  }

  const handleEnablePushOnDevice = async (): Promise<void> => {
    if (isUpdatingPushDevice) return
    setIsUpdatingPushDevice(true)
    try {
      await enablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success(t('Notificaciones activadas en este dispositivo.'))
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

  const handleDisablePushOnDevice = async (): Promise<void> => {
    if (isUpdatingPushDevice) return
    setIsUpdatingPushDevice(true)
    try {
      await disablePushOnCurrentDevice()
      await refreshPushStatus()
      toast.success(t('Notificaciones desactivadas en este dispositivo.'))
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

  const hourSelect = (
    id: string,
    value: number,
    disabled: boolean,
    onChange: (hour: number) => void,
  ) => (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
      <SelectTrigger id={id} className='h-10 min-w-24 rounded-xl'>
        <SelectValue placeholder={t('Selecciona una hora')} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{t('Hora local')}</SelectLabel>
          {REMINDER_HOUR_OPTIONS.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {formatReminderHour(hour)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  const minutesSelect = (
    id: string,
    value: number,
    options: number[],
    disabled: boolean,
    onChange: (minutes: number) => void,
  ) => (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
      <SelectTrigger id={id} className='h-10 min-w-32 rounded-xl'>
        <SelectValue placeholder={t('Selecciona minutos')} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{t('Minutos antes')}</SelectLabel>
          {options.map((minutes) => (
            <SelectItem key={minutes} value={String(minutes)}>
              {t('{n} min antes', { n: minutes })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  const deviceTone = pushPermission === 'unsupported' ? 'neutral' : isCurrentDeviceActive ? 'ok' : 'gold'
  const showTeacher = !isLoadingTeacherReminderPrefs && Boolean(teacherReminderPrefs)
  const showCoaching =
    !isLoadingCoachingNotificationPrefs && (isCoachingAdmin || isCoachingUser) && Boolean(coachingNotificationPrefs)

  return (
    <GamePage className='gap-6 lg:max-w-2xl'>
      <PageTitle
        icon={
          <IconTile tone='gold' size={48} solid>
            <BellIcon className='size-6' strokeWidth={2.6} aria-hidden='true' />
          </IconTile>
        }
        subtitle={t('Recordatorios para no perder tus rachas.')}
      >
        {t('Notificaciones')}
      </PageTitle>

      {/* Este dispositivo */}
      <Panel tone={deviceTone} className='flex flex-col gap-3 px-4 py-4'>
        <div className='flex items-center gap-3'>
          <IconTile tone={deviceTone} size={48}>
            <SmartphoneIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />
          </IconTile>
          <div className='min-w-0 flex-1'>
            <p className='m-0 text-base leading-tight font-extrabold'>{t('Este dispositivo')}</p>
            <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>
              {pushPermission === 'unsupported'
                ? t('Este navegador no permite notificaciones.')
                : t('{n} dispositivos con avisos', { n: activePushDevicesCount })}
            </p>
          </div>
          {pushPermission !== 'unsupported' ? (
            <Pill tone={isCurrentDeviceActive ? 'ok' : 'neutral'}>
              {isCurrentDeviceActive ? t('Activas') : t('Apagadas')}
            </Pill>
          ) : null}
        </div>
        {pushPermission !== 'unsupported' ? (
          isCurrentDeviceActive ? (
            <Button
              type='button'
              variant='outline'
              className='h-11 w-full rounded-2xl font-extrabold'
              onClick={() => void handleDisablePushOnDevice()}
              disabled={isUpdatingPushDevice}
            >
              <BellOffIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
              {t('Desactivar en este dispositivo')}
            </Button>
          ) : (
            <Button
              type='button'
              variant='gold'
              className='h-11 w-full rounded-2xl font-extrabold'
              onClick={() => void handleEnablePushOnDevice()}
              disabled={isUpdatingPushDevice}
            >
              <BellRingIcon className='size-4' strokeWidth={2.6} aria-hidden='true' />
              {t('Activar en este dispositivo')}
            </Button>
          )
        ) : null}
        {pushPermission === 'denied' ? (
          <p
            className='m-0 rounded-xl px-3 py-2 text-xs font-bold'
            style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
          >
            {t('El navegador ha bloqueado los avisos. Actívalos en los ajustes del navegador.')}
          </p>
        ) : null}
      </Panel>

      {/* Rachas */}
      <div>
        <SectionLabel>{t('Rachas')}</SectionLabel>
        <RowGroup>
          <ReminderRow
            id='manage-ica-reminder-switch'
            icon={<FlameIcon size={30} />}
            iconTone='fire'
            title={t('Racha ICA')}
            text={t('Si aún no has completado I·C·A hoy.')}
            checked={reminderPrefs.icaStreakEnabled}
            disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
            onCheckedChange={(checked) => void handleUpdateReminderPreferences({ icaStreakEnabled: checked })}
          >
            {hourSelect('manage-ica-reminder-hour', reminderPrefs.icaStreakHour, isLoadingReminderPrefs || isSavingReminderPrefs, (hour) =>
              void handleUpdateReminderPreferences({ icaStreakHour: hour }),
            )}
          </ReminderRow>
          <ReminderRow
            id='manage-streak-risk-switch'
            icon={<StreakClockIcon size={30} />}
            iconTone='fire'
            title={t('Racha en peligro')}
            text={t('«Te quedan 5 horas» si ayer hiciste I·C·A y hoy aún no.')}
            checked={reminderPrefs.streakRiskEnabled}
            disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
            onCheckedChange={(checked) => void handleUpdateReminderPreferences({ streakRiskEnabled: checked })}
          />
          <ReminderRow
            id='manage-flash-reminder-switch'
            icon={<FlameIcon size={30} tone='flash' />}
            iconTone='i'
            title={t('Racha de flashcards')}
            text={t('Si aún no has acertado tus 10 flashcards hoy.')}
            checked={reminderPrefs.flashcardsStreakEnabled}
            disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
            onCheckedChange={(checked) => void handleUpdateReminderPreferences({ flashcardsStreakEnabled: checked })}
          >
            {hourSelect('manage-flash-reminder-hour', reminderPrefs.flashcardsStreakHour, isLoadingReminderPrefs || isSavingReminderPrefs, (hour) =>
              void handleUpdateReminderPreferences({ flashcardsStreakHour: hour }),
            )}
          </ReminderRow>
          <ReminderRow
            id='manage-habit-reminder-switch'
            icon={<HourglassIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />}
            iconTone='c'
            title={t('Si dejas de entrar')}
            text={t('Te avisamos tras 36 horas, 3 días y 7 días sin entrar.')}
            checked={reminderPrefs.habitLossEnabled}
            disabled={isLoadingReminderPrefs || isSavingReminderPrefs}
            onCheckedChange={(checked) => void handleUpdateReminderPreferences({ habitLossEnabled: checked })}
          />
        </RowGroup>
      </div>

      {/* Clases */}
      <div>
        <SectionLabel>{t('Clases')}</SectionLabel>
        <RowGroup>
          <ListRow
            to={`${DASHBOARD_ROUTES.calendarIcademy}?navigatefrom=notifications`}
            icon={
              <IconTile tone='a' size={44}>
                <CalendarDaysIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />
              </IconTile>
            }
            title={t('Clases del calendario')}
            text={t('Se eligen en el Calendario ICADEMY.')}
          />
          {showTeacher && teacherReminderPrefs ? (
            <ReminderRow
              id='manage-teacher-reminder-switch'
              icon={<PresentationIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />}
              iconTone='primary'
              title={t('Tus clases como profesor')}
              text={t('Antes de las clases que tienes asignadas.')}
              checked={teacherReminderPrefs.notificationsEnabled}
              disabled={isSavingTeacherReminderPrefs}
              onCheckedChange={(checked) => void handleUpdateTeacherReminderPreferences({ notificationsEnabled: checked })}
            >
              {minutesSelect(
                'manage-teacher-reminder-minutes',
                teacherReminderPrefs.minutesBefore,
                CALENDAR_REMINDER_OPTIONS,
                isSavingTeacherReminderPrefs,
                (minutes) => void handleUpdateTeacherReminderPreferences({ minutesBefore: minutes }),
              )}
            </ReminderRow>
          ) : null}
        </RowGroup>
      </div>

      {/* Coaching */}
      {showCoaching && coachingNotificationPrefs ? (
        <div>
          <SectionLabel>{t('Coaching')}</SectionLabel>
          <RowGroup>
            {isCoachingUser ? (
              <ReminderRow
                id='manage-coaching-active-session-switch'
                icon={<GraduationCapIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />}
                iconTone='gold'
                title={t('Tu coaching')}
                text={t('Cuando tu coach activa la semana, agenda tu clase o te deja feedback.')}
                checked={coachingNotificationPrefs.activeSessionEnabled}
                disabled={isSavingCoachingNotificationPrefs}
                onCheckedChange={(checked) => void handleUpdateCoachingNotificationPreferences({ activeSessionEnabled: checked })}
              >
                {minutesSelect(
                  'manage-coaching-class-reminder-minutes',
                  coachingNotificationPrefs.classScheduleReminderMinutes,
                  COACHING_CLASS_REMINDER_OPTIONS,
                  isSavingCoachingNotificationPrefs,
                  (minutes) =>
                    void handleUpdateCoachingNotificationPreferences({
                      classScheduleReminderMinutes: minutes as 10 | 30 | 60,
                    }),
                )}
              </ReminderRow>
            ) : null}
            {isCoachingAdmin ? (
              <ReminderRow
                id='manage-coaching-note-close-switch'
                icon={<AudioLinesIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />}
                iconTone='gold'
                title={t('Notas maestras de tus alumnos')}
                text={t('Cuando un alumno cierra una nota maestra en una semana de coaching.')}
                checked={coachingNotificationPrefs.masterNoteClosedEnabled}
                disabled={isSavingCoachingNotificationPrefs}
                onCheckedChange={(checked) => void handleUpdateCoachingNotificationPreferences({ masterNoteClosedEnabled: checked })}
              />
            ) : null}
          </RowGroup>
        </div>
      ) : null}
    </GamePage>
  )
}

/** Fila de un aviso: icono, qué hace, interruptor y (si está activo) cuándo. */
function ReminderRow({
  id,
  icon,
  iconTone,
  title,
  text,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  id: string
  icon: ReactNode
  iconTone: Tone
  title: string
  text: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  children?: ReactNode
}) {
  return (
    <div className='py-3'>
      <div className='flex items-center gap-3'>
        <IconTile tone={checked ? iconTone : 'neutral'} size={44}>
          {icon}
        </IconTile>
        <label htmlFor={id} className='min-w-0 flex-1 cursor-pointer'>
          <span className='block leading-tight font-extrabold'>{title}</span>
          <span className='mt-0.5 block text-xs font-semibold text-muted-foreground'>{text}</span>
        </label>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children ? (
        <div className='ica-pop mt-2.5 ml-14 flex items-center gap-2'>
          <ClockIcon className='size-4 text-muted-foreground' strokeWidth={2.6} aria-hidden='true' />
          {children}
        </div>
      ) : null}
    </div>
  )
}
