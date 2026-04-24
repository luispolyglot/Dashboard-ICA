import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CREATION_WORDS_GOAL, DAY_NAMES, GOAL, MONTH_NAMES } from '../constants'
import { getStreak, todayKey } from '../utils'
import type { CalendarTab } from '../types'

type CalendarModalProps = {
  completedDays: string[]
  creationDays: string[]
  onClose: () => void
  activeTab: CalendarTab
}

type DayStatus = 'empty' | 'future' | 'missed' | 'completed'

export function CalendarModal({
  completedDays,
  creationDays,
  onClose,
  activeTab,
}: CalendarModalProps) {
  const [viewDate, setViewDate] = useState(new Date())
  const [tab, setTab] = useState<CalendarTab>(activeTab)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = lastDay.getDate()
  const today = new Date()
  const todayStr = todayKey()
  const activeDays = tab === 'review' ? completedDays : creationDays

  const cells: Array<number | null> = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth()
  const isFutureMonth = new Date(year, month, 1) > today
  const lastDayToCount = isCurrentMonth ? today.getDate() : daysInMonth

  let completedCount = 0
  for (let day = 1; day <= lastDayToCount; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (activeDays.includes(key)) completedCount++
  }

  const missedCount = lastDayToCount - completedCount
  const monthPercent =
    lastDayToCount > 0 ? Math.round((completedCount / lastDayToCount) * 100) : 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='w-dvh h-[calc(100dvh-2rem)] lg:h-auto overflow-y-auto lg:max-w-sm py-4 '>
        <DialogHeader>
          <DialogTitle>Rachas</DialogTitle>
          <DialogDescription>
            Seguimiento mensual de flashcards y creación ICA.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as CalendarTab)}
        >
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='review'>🔥 Racha Flashcards</TabsTrigger>
            <TabsTrigger value='creation'>✦ Racha ICA</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className='flex items-center justify-between'>
          <Button
            type='button'
            variant='outline'
            size='icon'
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
          >
            ‹
          </Button>

          <div className='text-center'>
            <div className='text-xl font-semibold'>{MONTH_NAMES[month]}</div>
            <div className='text-sm text-muted-foreground'>{year}</div>
          </div>

          <Button
            type='button'
            variant='outline'
            size='icon'
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
          >
            ›
          </Button>
        </div>

        <div className='grid grid-cols-7 gap-1'>
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className='py-1 text-center text-[11px] font-semibold text-muted-foreground'
            >
              {day}
            </div>
          ))}
        </div>

        <div className='grid grid-cols-7 gap-1'>
          {cells.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} />

            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isCompleted = activeDays.includes(key)
            const isToday = key === todayStr

            const dayDate = new Date(year, month, day)
            const baselineToday = new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
            )
            const isFuture = dayDate > baselineToday
            const isPast = dayDate < baselineToday
            const status: DayStatus = isFuture
              ? 'future'
              : isCompleted
                ? 'completed'
                : isPast
                  ? 'missed'
                  : 'empty'

            return (
              <DayCell key={key} day={day} status={status} isToday={isToday} />
            )
          })}
        </div>

        <div className='flex justify-center gap-6 border-t pt-4'>
          <Stat
            label='Dias completados'
            value={completedCount}
            valueClass='text-primary'
          />
          <Stat
            label='Dias sin completar'
            value={isFutureMonth ? 0 : missedCount}
            valueClass='text-destructive'
          />
          <Stat
            label='Racha actual'
            value={getStreak(activeDays)}
            valueClass='text-amber-500'
          />
        </div>

        {!isFutureMonth && (
          <div className='rounded-xl border p-3.5'>
            <div className='mb-2 flex items-center justify-between'>
              <span className='text-xs font-semibold text-muted-foreground'>
                Progreso del mes
              </span>
              <span className='text-xl font-bold text-primary'>
                {monthPercent}%
              </span>
            </div>
            <div className='grid grid-cols-10 gap-1 rounded-md bg-muted p-1'>
              {Array.from({ length: 10 }, (_, i) => {
                const threshold = (i + 1) * 10
                const active = monthPercent >= threshold
                return (
                  <div
                    key={i}
                    className={`h-2 rounded-full ${active ? 'bg-primary' : 'bg-background'}`}
                  />
                )
              })}
            </div>
            <div className='mt-1.5 text-center text-[11px] text-muted-foreground'>
              {completedCount} de {lastDayToCount} día
              {lastDayToCount !== 1 ? 's' : ''} completado
              {completedCount !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {tab === 'review' && (
          <div className='rounded-xl border p-3'>
            <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary'>
              Requisito diario
            </div>
            <div className='text-xs text-muted-foreground'>
              📚 +{GOAL} flashcards acertados
            </div>
          </div>
        )}

        {tab === 'creation' && (
          <div className='rounded-xl border p-3'>
            <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary'>
              Requisitos diarios
            </div>
            <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
              <span>✍️ +{CREATION_WORDS_GOAL} palabras</span>
              <span>⚡ 1 frase de activación</span>
            </div>
          </div>
        )}

        <div className='flex justify-end'>
          <Button type='button' onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type DayCellProps = {
  day: number
  status: DayStatus
  isToday: boolean
}

function DayCell({ day, status, isToday }: DayCellProps) {
  const statusClass =
    status === 'completed'
      ? 'border-primary/50 bg-primary/10 text-primary'
      : status === 'missed'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : status === 'future'
          ? 'border-transparent bg-muted text-muted-foreground/60'
          : 'border-border bg-background text-muted-foreground'

  return (
    <div
      className={`relative flex aspect-square items-center justify-center rounded-lg border text-sm font-medium ${statusClass} ${isToday ? 'ring-2 ring-ring' : ''}`}
    >
      {day}
      {status === 'completed' && (
        <div className='absolute bottom-0.75 h-1.5 w-1.5 rounded-full bg-primary' />
      )}
    </div>
  )
}

type StatProps = {
  label: string
  value: number
  valueClass: string
}

function Stat({ label, value, valueClass }: StatProps) {
  return (
    <div className='text-center'>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className='text-[11px] text-muted-foreground'>{label}</div>
    </div>
  )
}
