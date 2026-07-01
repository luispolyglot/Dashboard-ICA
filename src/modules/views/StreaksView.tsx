import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CREATION_WORDS_GOAL, DAY_NAMES, GOAL, MONTH_NAMES } from '../constants'
import { getStreak, getStreakWithSaved, shiftIsoDay, todayKey } from '../utils'
import type { CalendarTab } from '../types'

type StreaksViewProps = {
  completedDays: string[]
  creationDays: string[]
  savedCreationDays: string[]
  creationSavesUsedThisMonth: number
  creationSavesLimit: number
}

type DayStatus =
  | 'empty'
  | 'future'
  | 'missed'
  | 'completed'
  | 'saved'
  | 'frozen-pending'
  | 'outside'
  | 'outside-missed'
  | 'outside-completed'
  | 'outside-saved'

type CalendarCell = {
  day: number
  monthOffset: -1 | 0 | 1
}

export function StreaksView({
  completedDays,
  creationDays,
  savedCreationDays,
  creationSavesUsedThisMonth,
  creationSavesLimit,
}: StreaksViewProps) {
  const todayStr = todayKey()
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number)
  const [viewDate, setViewDate] = useState(
    () => new Date(todayYear, (todayMonth || 1) - 1, 1),
  )
  const [tab, setTab] = useState<CalendarTab>('creation')

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = lastDay.getDate()
  const activeDays = tab === 'review' ? completedDays : creationDays
  const activeSavedDays = tab === 'creation' ? savedCreationDays : []

  const cells: CalendarCell[] = []
  const prevMonthDays = new Date(year, month, 0).getDate()

  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, monthOffset: -1 })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, monthOffset: 0 })
  }

  const trailing = (7 - (cells.length % 7)) % 7
  for (let i = 1; i <= trailing; i++) {
    cells.push({ day: i, monthOffset: 1 })
  }

  const baselineToday = new Date(
    todayYear,
    (todayMonth || 1) - 1,
    todayDay || 1,
  )
  const isCurrentMonth = year === todayYear && month === (todayMonth || 1) - 1
  const isFutureMonth =
    year > todayYear || (year === todayYear && month > (todayMonth || 1) - 1)
  const lastDayToCount = isCurrentMonth ? todayDay : daysInMonth

  const monthStartKey = `${todayYear}-${String(todayMonth || 1).padStart(2, '0')}-01`
  const yesterdayKey = shiftIsoDay(todayStr, -1)
  const twoDaysAgoKey = shiftIsoDay(todayStr, -2)
  const todayCompleted = creationDays.includes(todayStr)
  const hasSaveQuota = creationSavesUsedThisMonth < creationSavesLimit
  const pendingFrozenDay =
    !todayCompleted &&
    hasSaveQuota &&
    yesterdayKey >= monthStartKey &&
    !creationDays.includes(yesterdayKey) &&
    !savedCreationDays.includes(yesterdayKey) &&
    (creationDays.includes(twoDaysAgoKey) ||
      savedCreationDays.includes(twoDaysAgoKey))
      ? yesterdayKey
      : null
  const hasActiveFreeze = tab === 'creation' && Boolean(pendingFrozenDay)

  let completedCount = 0
  let savedCount = 0
  let pendingFrozenCount = 0
  for (let day = 1; day <= lastDayToCount; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (activeDays.includes(key)) completedCount++
    if (activeSavedDays.includes(key)) savedCount++
    if (pendingFrozenDay && key === pendingFrozenDay) pendingFrozenCount++
  }

  const missedCount = Math.max(
    0,
    lastDayToCount - completedCount - savedCount - pendingFrozenCount,
  )
  const monthPercent =
    lastDayToCount > 0 ? Math.round((completedCount / lastDayToCount) * 100) : 0

  return (
    <section className='mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-4'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Rachas</h2>
        <p className='text-sm text-muted-foreground'>
          Seguimiento mensual de flashcards y creación ICA.
        </p>
      </div>

      <Card className='lg:max-w-lg lg:mx-auto'>
        <CardHeader className='gap-4'>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as CalendarTab)}
          >
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='creation'>🔥 Racha ICA</TabsTrigger>
              <TabsTrigger value='review'>✦ Racha Flashcards</TabsTrigger>
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
        </CardHeader>

        <CardContent className='space-y-4'>
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
            {cells.map((cell) => {
              const dayDate = new Date(year, month + cell.monthOffset, cell.day)
              const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
              const isCompleted = activeDays.includes(key)
              const isSaved = activeSavedDays.includes(key)
              const isPendingFrozen =
                tab === 'creation' && key === pendingFrozenDay
              const isToday = key === todayStr
              const isFuture = dayDate > baselineToday
              const isPast = dayDate < baselineToday
              const status: DayStatus =
                cell.monthOffset !== 0
                  ? isFuture
                    ? 'outside'
                    : isSaved
                      ? 'outside-saved'
                      : isCompleted
                        ? 'outside-completed'
                        : 'outside-missed'
                  : isFuture
                    ? 'future'
                    : isPendingFrozen
                      ? 'frozen-pending'
                      : isSaved
                        ? 'saved'
                        : isCompleted
                          ? 'completed'
                          : isPast
                            ? 'missed'
                            : 'empty'

              return (
                <DayCell
                  key={key}
                  day={cell.day}
                  status={status}
                  isToday={isToday}
                />
              )
            })}
          </div>

          <div className='flex justify-center gap-6 border-t pt-4'>
            <Stat
              label='Días completados'
              value={completedCount}
              valueClass='text-primary'
            />
            <Stat
              label='Días sin completar'
              value={isFutureMonth ? 0 : missedCount}
              valueClass='text-destructive'
            />
            <Stat
              label='Racha actual'
              value={
                tab === 'creation'
                  ? getStreakWithSaved(
                      creationDays,
                      savedCreationDays,
                      pendingFrozenDay,
                    )
                  : getStreak(activeDays)
              }
              valueClass={
                hasActiveFreeze
                  ? 'animate-pulse [filter:hue-rotate(165deg)_saturate(1.25)]'
                  : 'text-slate-500 dark:text-slate-200'
              }
              icon={tab === 'creation' ? '🔥' : '✦'}
            />
          </div>

          {tab === 'creation' && isCurrentMonth && (
            <div className='rounded-xl border p-3'>
              <div className='text-xs text-muted-foreground'>
                🧊 SalvadICA usado este mes: {creationSavesUsedThisMonth}/
                {creationSavesLimit}
              </div>
              <div className='mt-1 text-xs text-muted-foreground'>
                {hasActiveFreeze
                  ? '🧊 Racha congelada: completa hoy ICA antes de las 23:59 para conservar la racha.'
                  : todayCompleted
                    ? '✅ Bien hecho hoy: no perdiste tu racha ICA.'
                    : hasSaveQuota
                      ? 'Si hoy fallas, mañana tendrás una ventana de 24 horas para recuperar la racha.'
                      : 'Ya alcanzaste el límite mensual de 3 salvadas.'}
              </div>
            </div>
          )}

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
                <span>🧩 1 Frase de Creación</span>
                <span>🗣️ 1 Nota de Activación</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
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
      : status === 'saved'
        ? 'border-sky-500/55 bg-sky-500/15 text-sky-700 dark:text-sky-300'
        : status === 'frozen-pending'
          ? 'border-sky-500/55 bg-sky-500/15 text-sky-700 dark:text-sky-300 animate-pulse'
          : status === 'missed'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : status === 'outside-completed'
              ? 'border-primary/25 bg-primary/10 text-primary opacity-60'
              : status === 'outside-saved'
                ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 opacity-60 dark:text-amber-300'
                : status === 'outside-missed'
                  ? 'border-destructive/20 bg-destructive/10 text-destructive opacity-60'
                  : status === 'outside'
                    ? 'border-transparent bg-background/30 text-muted-foreground opacity-60'
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
      {status === 'saved' && (
        <div className='absolute right-1 top-0.5 text-[10px] leading-none'>
          🧊
        </div>
      )}
      {status === 'frozen-pending' && (
        <div className='absolute right-1 top-0.5 text-[10px] leading-none'>
          🧊
        </div>
      )}
    </div>
  )
}

type StatProps = {
  label: string
  value: number
  valueClass: string
  icon?: string
}

function Stat({ label, value, valueClass, icon }: StatProps) {
  return (
    <div className='text-center flex flex-col justify-between'>
      {icon ? (
        <div
          className={`text-2xl font-bold ${valueClass} flex items-center justify-center gap-1`}
        >
          {icon} {value}
        </div>
      ) : (
        <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      )}
      <div className='text-[11px] text-muted-foreground'>{label}</div>
    </div>
  )
}
