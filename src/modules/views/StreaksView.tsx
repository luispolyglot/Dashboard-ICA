import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
  onSaveCreationStreakDay: (day?: string) => Promise<{ savedDay: string }>
}

type DayStatus =
  | 'empty'
  | 'future'
  | 'missed'
  | 'completed'
  | 'saved'
  | 'outside'
  | 'outside-missed'
  | 'outside-completed'
  | 'outside-saved'

type CalendarCell = {
  day: number
  monthOffset: -1 | 0 | 1
}

const SAVE_MODE_ENABLED = false // disabled momentarily, as it was causing confusion and frustration for users. It can be re-enabled in the future if desired.

export function StreaksView({
  completedDays,
  creationDays,
  savedCreationDays,
  creationSavesUsedThisMonth,
  creationSavesLimit,
  onSaveCreationStreakDay,
}: StreaksViewProps) {
  const todayStr = todayKey()
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number)
  const [viewDate, setViewDate] = useState(
    () => new Date(todayYear, (todayMonth || 1) - 1, 1),
  )
  const [tab, setTab] = useState<CalendarTab>('creation')
  const [savingStreak, setSavingStreak] = useState(false)
  const [saveSelectionMode, setSaveSelectionMode] = useState(false)
  const [recentlySavedDay, setRecentlySavedDay] = useState<string | null>(null)

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
  const selectableSaveDayKeys =
    tab === 'creation' && isCurrentMonth
      ? (() => {
          const completedSet = new Set(creationDays)
          const savedSet = new Set(savedCreationDays)
          const keys = new Set<string>()
          let cursor = shiftIsoDay(todayStr, -1)

          while (cursor >= monthStartKey) {
            if (!completedSet.has(cursor) && !savedSet.has(cursor)) {
              keys.add(cursor)
            }
            cursor = shiftIsoDay(cursor, -1)
          }

          return keys
        })()
      : new Set<string>()

  const latestSavableDay = selectableSaveDayKeys.values().next().value || null
  const hasSaveQuota = creationSavesUsedThisMonth < creationSavesLimit
  const isSaveModeActive =
    SAVE_MODE_ENABLED &&
    saveSelectionMode &&
    tab === 'creation' &&
    isCurrentMonth

  let completedCount = 0
  let savedCount = 0
  for (let day = 1; day <= lastDayToCount; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (activeDays.includes(key)) completedCount++
    if (activeSavedDays.includes(key)) savedCount++
  }

  const missedCount = Math.max(0, lastDayToCount - completedCount - savedCount)
  const monthPercent =
    lastDayToCount > 0 ? Math.round((completedCount / lastDayToCount) * 100) : 0

  const handleSaveStreak = async (day: string): Promise<void> => {
    if (!day || !hasSaveQuota || savingStreak) return

    try {
      setSavingStreak(true)
      const result = await onSaveCreationStreakDay(day)
      toast.success(`Racha ICA salvada para ${result.savedDay}.`)
      setSaveSelectionMode(false)
      setRecentlySavedDay(result.savedDay)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo salvar la racha ICA.'
      toast.error(message)
    } finally {
      setSavingStreak(false)
    }
  }

  useEffect(() => {
    if (!recentlySavedDay) return

    const timeoutId = window.setTimeout(() => {
      setRecentlySavedDay(null)
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [recentlySavedDay])

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
              const isToday = key === todayStr
              const isFuture = dayDate > baselineToday
              const isPast = dayDate < baselineToday
              const isSelectableForSave =
                isSaveModeActive &&
                cell.monthOffset === 0 &&
                isPast &&
                selectableSaveDayKeys.has(key) &&
                hasSaveQuota
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
                  selectableForSave={isSelectableForSave}
                  mutedForSaveSelection={
                    isSaveModeActive && !isSelectableForSave
                  }
                  celebrateSave={recentlySavedDay === key && status === 'saved'}
                  onSaveClick={() => {
                    void handleSaveStreak(key)
                  }}
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
            {tab === 'creation' && SAVE_MODE_ENABLED && (
              <Stat
                label='Días salvados'
                value={savedCount}
                valueClass='text-amber-600 dark:text-amber-300'
                icon='🛟'
              />
            )}
            <Stat
              label='Racha actual'
              value={
                tab === 'creation'
                  ? getStreakWithSaved(creationDays, savedCreationDays)
                  : getStreak(activeDays)
              }
              valueClass='text-slate-500 dark:text-slate-200'
              icon={tab === 'creation' ? '🔥' : '✦'}
            />
          </div>

          {tab === 'creation' && isCurrentMonth && SAVE_MODE_ENABLED && (
            <div className='rounded-xl border p-3'>
              <div className='mb-2 flex items-center justify-between'>
                <div className='text-xs text-muted-foreground'>
                  {isSaveModeActive
                    ? 'Haz clic en el día que quieres salvar.'
                    : `SalvadICA usado este mes: ${creationSavesUsedThisMonth}/${creationSavesLimit}`}
                </div>
                <Button
                  type='button'
                  size='sm'
                  variant={isSaveModeActive ? 'outline' : 'default'}
                  onClick={() => {
                    if (isSaveModeActive) {
                      setSaveSelectionMode(false)
                      return
                    }
                    setSaveSelectionMode(true)
                  }}
                  disabled={
                    savingStreak ||
                    (!isSaveModeActive && (!latestSavableDay || !hasSaveQuota))
                  }
                >
                  {isSaveModeActive
                    ? 'Cancelar'
                    : savingStreak
                      ? 'Salvando...'
                      : '🛟 SalvadICA'}
                </Button>
              </div>
              <div className='text-xs text-muted-foreground'>
                {isSaveModeActive
                  ? 'Solo puedes seleccionar días no completados del mes actual.'
                  : hasSaveQuota
                    ? latestSavableDay
                      ? 'Puedes elegir cualquier día rojo del mes actual para salvarlo.'
                      : 'No hay días elegibles para salvar en este mes.'
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
  selectableForSave: boolean
  mutedForSaveSelection: boolean
  celebrateSave: boolean
  onSaveClick: () => void
}

function DayCell({
  day,
  status,
  isToday,
  selectableForSave,
  mutedForSaveSelection,
  celebrateSave,
  onSaveClick,
}: DayCellProps) {
  const statusClass =
    status === 'completed'
      ? 'border-primary/50 bg-primary/10 text-primary'
      : status === 'saved'
        ? 'border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : status === 'missed'
          ? selectableForSave
            ? 'border-destructive/70 bg-destructive/20 text-destructive hover:border-amber-500/70 hover:bg-amber-500/20 hover:text-amber-700 dark:hover:text-amber-300'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
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
    <button
      type='button'
      onClick={selectableForSave ? onSaveClick : undefined}
      className={`group relative flex aspect-square items-center justify-center rounded-lg border text-sm font-medium transition-colors ${statusClass} ${isToday ? 'ring-2 ring-ring' : ''} ${selectableForSave ? 'cursor-pointer' : 'cursor-default'} ${mutedForSaveSelection ? 'opacity-50' : ''} ${celebrateSave ? 'ring-2 ring-amber-400 animate-pulse' : ''}`}
      aria-disabled={!selectableForSave}
    >
      {day}
      {status === 'completed' && (
        <div className='absolute bottom-0.75 h-1.5 w-1.5 rounded-full bg-primary' />
      )}
      {status === 'saved' && (
        <div className='absolute right-1 top-0.5 text-[10px] leading-none'>
          🛟
        </div>
      )}
      {selectableForSave && (
        <div className='pointer-events-none absolute right-1 top-0.5 text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-100'>
          🛟
        </div>
      )}
      {celebrateSave && (
        <div className='pointer-events-none absolute inset-0 rounded-lg border border-amber-400/80 animate-ping' />
      )}
    </button>
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
