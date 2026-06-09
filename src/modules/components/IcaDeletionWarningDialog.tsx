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
  resourceDates: Array<string | number | Date | null | undefined>
  confirmLabel?: string
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
  resourceDates,
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
          ) : (
            <DialogDescription className='text-amber-700 dark:text-amber-300'>
              Este recurso corresponde a hoy. Si lo eliminas, hoy se marcará como
              racha ICA no hecha. Esta acción es irreversible.
            </DialogDescription>
          )}
          {!requiresCountdown && !touchesToday && (
            <DialogDescription>
              Esta acción es irreversible y puede afectar tu progreso ICA.
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
