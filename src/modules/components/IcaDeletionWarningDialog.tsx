import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CALENDAR_ICADEMY_TIMEZONE,
} from '../utils/calendarIcademyTime'

type IcaDeletionWarningDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  loading?: boolean
  title: string
  resourceLabel: string
  resource?: 'word' | 'phrase' | 'audio'
  resourceDates: Array<string | number | Date | null | undefined>
  todayTotalCount?: number
  todayDeletionCount?: number
  confirmLabel?: string
}

type DeletionResourceConfig = {
  singularLabel: string
  pluralLabel: string
  minForTodayStreak: number
}

const RESOURCE_CONFIG: Record<'word' | 'phrase' | 'audio', DeletionResourceConfig> = {
  word: {
    singularLabel: 'palabra ICA',
    pluralLabel: 'palabras ICA',
    minForTodayStreak: 5,
  },
  phrase: {
    singularLabel: 'frase',
    pluralLabel: 'frases',
    minForTodayStreak: 1,
  },
  audio: {
    singularLabel: 'audio',
    pluralLabel: 'audios',
    minForTodayStreak: 1,
  },
}

function toIcaDayKey(value: string | number | Date | null | undefined): string | null {
  const timezone = getIcaStreakTimezone()
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

function getIcaStreakTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || CALENDAR_ICADEMY_TIMEZONE
  } catch {
    return CALENDAR_ICADEMY_TIMEZONE
  }
}

function getTodayKeyForTimezone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value || '0000'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

export function IcaDeletionWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  loading = false,
  title,
  resourceLabel,
  resource = 'word',
  resourceDates,
  todayTotalCount,
  todayDeletionCount,
  confirmLabel = 'Sí, eliminar',
}: IcaDeletionWarningDialogProps) {
  const [countdown, setCountdown] = useState(3)

  const { historicalDays, touchesToday } = useMemo(() => {
    const timezone = getIcaStreakTimezone()
    const todayKey = getTodayKeyForTimezone(timezone)
    const uniqueDays = Array.from(
      new Set(resourceDates.map((value) => toIcaDayKey(value)).filter(Boolean)),
    ) as string[]

    return {
      historicalDays: uniqueDays.filter((day) => day !== todayKey),
      touchesToday: uniqueDays.includes(todayKey),
    }
  }, [resourceDates])

  const todayDeletes = useMemo(() => {
    if (typeof todayDeletionCount === 'number' && Number.isFinite(todayDeletionCount)) {
      return Math.max(0, Math.floor(todayDeletionCount))
    }

    const timezone = getIcaStreakTimezone()
    const todayKey = getTodayKeyForTimezone(timezone)
    return resourceDates.reduce<number>((acc, value) => {
      return toIcaDayKey(value) === todayKey ? acc + 1 : acc
    }, 0)
  }, [resourceDates, todayDeletionCount])

  const resourceConfig = RESOURCE_CONFIG[resource]

  const todayWarning = useMemo(() => {
    if (!touchesToday) {
      return {
        shouldWarn: false,
        message: null as string | null,
      }
    }

    if (typeof todayTotalCount !== 'number' || !Number.isFinite(todayTotalCount)) {
      return {
        shouldWarn: true,
        message:
          'Este recurso corresponde a hoy. Si lo eliminas, hoy podría marcarse como racha ICA no hecha. Esta acción es irreversible.',
      }
    }

    const safeTodayCount = Math.max(0, Math.floor(todayTotalCount))
    const remainingToday = safeTodayCount - todayDeletes
    const min = resourceConfig.minForTodayStreak
    const breaksTodayStreak = remainingToday < min

    if (!breaksTodayStreak) {
      return {
        shouldWarn: false,
        message: null as string | null,
      }
    }

    const labelForMin = min === 1 ? resourceConfig.singularLabel : resourceConfig.pluralLabel
    const labelForRemaining = remainingToday === 1 ? resourceConfig.singularLabel : resourceConfig.pluralLabel

    return {
      shouldWarn: true,
      message:
        `Hoy quedarías con ${Math.max(0, remainingToday)} ${labelForRemaining}. ` +
        `Perderás la racha ICA de hoy porque el mínimo es ${min} ${labelForMin}. ` +
        'Esta acción es irreversible.',
    }
  }, [resourceConfig, todayDeletes, todayTotalCount, touchesToday])

  const hasTodayCount =
    typeof todayTotalCount === 'number' && Number.isFinite(todayTotalCount)
  const showsSafeTodayInfo = touchesToday && hasTodayCount && !todayWarning.shouldWarn

  const requiresCountdown = historicalDays.length > 0

  useEffect(() => {
    if (!open || !requiresCountdown) {
      setCountdown(3)
      return
    }

    setCountdown(3)
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [open, requiresCountdown])

  const canConfirm = !loading && (!requiresCountdown || countdown === 0)

  const handleCancel = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!loading) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!loading) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {requiresCountdown ? (
            <DialogDescription className='text-red-600 dark:text-red-300'>
              Esta acción es irreversible. Vas a borrar {resourceLabel} de días
              anteriores ({historicalDays.join(', ')}) y perderás la/s racha/s ICA
              de esos días.
            </DialogDescription>
          ) : todayWarning.shouldWarn ? (
            <DialogDescription className='text-amber-700 dark:text-amber-300'>
              {todayWarning.message}
            </DialogDescription>
          ) : showsSafeTodayInfo ? (
            <DialogDescription>
              Esta acción es irreversible y no debería afectar tu racha ICA de hoy.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Esta acción es irreversible y puede afectar tu progreso ICA.
            </DialogDescription>
          )}
          {requiresCountdown && todayWarning.shouldWarn && (
            <DialogDescription className='text-amber-700 dark:text-amber-300'>
              {todayWarning.message}
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={handleCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type='button'
            variant='destructive'
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {loading
              ? 'Eliminando...'
              : requiresCountdown && countdown > 0
                ? `Espera ${countdown}s`
                : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
