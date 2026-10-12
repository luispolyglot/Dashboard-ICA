import { useState, type CSSProperties } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CREATION_WORDS_GOAL, DAY_NAMES, GOAL, MONTH_NAMES } from '../constants'
import { getStreak, getStreakWithSaved, shiftIsoDay, todayKey } from '../utils'
import type { CalendarTab } from '../types'
import { useDashboardContext } from '../context/DashboardContext'
import { getTodayProgress } from '../constants'
import { longestStreak } from '../game/achievements'
import { CardsIcon, FlameIcon, IceCubeIcon } from '../game/icons'
import { FLASH_STREAK_MILESTONES, STREAK_MILESTONES } from '../game/rules'
import { CongeladicaCard, StreakMilestones } from '../game/StreakExtras'
import { getIcaStreakState } from '../game/streak'
import { t } from '@/i18n'

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

function readInitialTab(): CalendarTab {
  try {
    return new URLSearchParams(window.location.search).get('tab') === 'flashcards' ? 'review' : 'creation'
  } catch {
    return 'creation'
  }
}

/**
 * RACHAS: la racha ICA y la de flashcards, con su calendario del mes, la CongeladICA
 * y los hitos (con las ICA Coins que da cada uno).
 */
export function StreaksView({
  completedDays,
  creationDays,
  savedCreationDays,
  creationSavesUsedThisMonth,
  creationSavesLimit,
}: StreaksViewProps) {
  const todayStr = todayKey()
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number)
  const [viewDate, setViewDate] = useState(() => new Date(todayYear, (todayMonth || 1) - 1, 1))
  const [tab, setTab] = useState<CalendarTab>(readInitialTab)
  const { dailyProgress } = useDashboardContext()
  const isIca = tab === 'creation'
  // Racha ICA "en vivo": si hoy ya completaste el ciclo, cuenta aunque el servidor tarde.
  const liveIca = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = lastDay.getDate()
  const activeDays = isIca ? creationDays : completedDays
  const activeSavedDays = isIca ? savedCreationDays : []

  const cells: CalendarCell[] = []
  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startDow - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, monthOffset: -1 })
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, monthOffset: 0 })
  const trailing = (7 - (cells.length % 7)) % 7
  for (let i = 1; i <= trailing; i++) cells.push({ day: i, monthOffset: 1 })

  const baselineToday = new Date(todayYear, (todayMonth || 1) - 1, todayDay || 1)
  const isCurrentMonth = year === todayYear && month === (todayMonth || 1) - 1
  const isFutureMonth = year > todayYear || (year === todayYear && month > (todayMonth || 1) - 1)
  const lastDayToCount = isCurrentMonth ? todayDay : daysInMonth

  const monthStartKey = `${todayYear}-${String(todayMonth || 1).padStart(2, '0')}-01`
  const yesterdayKey = shiftIsoDay(todayStr, -1)
  const twoDaysAgoKey = shiftIsoDay(todayStr, -2)
  const todayCompleted = creationDays.includes(todayStr)
  const hasSaveQuota = creationSavesUsedThisMonth < creationSavesLimit
  const pendingFrozenDay =
    !todayCompleted &&
    hasSaveQuota &&
    yesterdayKey >= monthStartKey && !creationDays.includes(yesterdayKey) && !savedCreationDays.includes(yesterdayKey) && (creationDays.includes(twoDaysAgoKey) || savedCreationDays.includes(twoDaysAgoKey)) ? yesterdayKey : null
const hasActiveFreeze = isIca && Boolean(pendingFrozenDay)
let completedCount = 0
let savedCount = 0
let pendingFrozenCount = 0
for (let day = 1; day <= lastDayToCount; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (activeDays.includes(key)) completedCount++
    if (activeSavedDays.includes(key)) savedCount++
    if (pendingFrozenDay && key === pendingFrozenDay) pendingFrozenCount++
  }
  const missedCount = Math.max(0, lastDayToCount - completedCount - savedCount - pendingFrozenCount)
  const monthPercent = lastDayToCount > 0 ? Math.round((completedCount / lastDayToCount) * 100) : 0
const currentStreak = isIca ? Math.max(liveIca.streak, getStreakWithSaved(creationDays, savedCreationDays, pendingFrozenDay)) : getStreak(completedDays)
const bestStreak = isIca ? Math.max(currentStreak, longestStreak(creationDays, savedCreationDays)) : Math.max(currentStreak, longestStreak(completedDays))
// Racha ICA en naranja y racha de flashcards en azul: la misma llama, cada una con su color.
const accent = isIca ? 'var(--ica-fire)' : 'var(--ica-i)'
const accentSoft = isIca ? 'var(--ica-fire-soft)' : 'var(--ica-i-soft)'
const accentInk = isIca ? 'var(--ica-fire-ink)' : 'var(--ica-i-ink)'
return (
    <section className='mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-2 pb-28 lg:py-8'>
      <h1 className='m-0 font-display tracking-tight text-2xl leading-tight font-extrabold lg:text-3xl'>{t('Rachas')}</h1>

      {/* Pestañas */}
      <div className='grid grid-cols-2 gap-2' role='tablist' aria-label={t('Tipo de racha')}>
        {(
          [
            { value: 'creation', label: 'Racha ICA', icon: <FlameIcon size={22} tone={liveIca.cycleDoneToday ? 'fire' : 'off'} /> },
            { value: 'review', label: 'Racha flashcards', icon: <FlameIcon size={22} tone={completedDays.includes(todayStr) ? 'flash' : 'off'} /> },
          ] as const
        ).map((item) => {
          const active = tab === item.value
          return (
            <button
              key={item.value}
              type='button'
              role='tab'
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={cn(
                'flex h-12 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-extrabold transition-colors',
                active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {item.icon}
              {t(item.label)}
            </button>
          )
        })}
      </div>

      {/* La racha en grande */}
      <div className='flex items-center gap-4 rounded-3xl px-5 py-4' style={{ background: accentSoft }}>
        <FlameIcon size={64} tone={currentStreak > 0 ? (isIca ? 'fire' : 'flash') : 'off'} />
        <div className='min-w-0'>
          <p className='m-0 text-5xl leading-none font-black tabular-nums' style={{ color: accentInk }}>
            {currentStreak}
          </p>
          <p className='m-0 mt-1 text-sm font-extrabold' style={{ color: accentInk }}>
            {currentStreak === 1 ? t('día') : t('días')} de racha {isIca ? 'ICA' : t('de flashcards')}
          </p>
          <p className='m-0 text-xs font-semibold text-muted-foreground'>{t('Tu mejor racha: {bestStreak} días', { bestStreak })}</p>
        </div>
      </div>

      {isIca && isCurrentMonth ? (
        <CongeladicaCard
          used={creationSavesUsedThisMonth}
          limit={creationSavesLimit}
          frozenNow={hasActiveFreeze}
          message={
            hasActiveFreeze
              ? t('Racha congelada: completa hoy el ciclo ICA antes de las 23:59 para conservarla.')
              : todayCompleted
                ? t('Bien hecho hoy: no perdiste tu racha ICA.')
                : hasSaveQuota
                  ? t('Si un día fallas, al día siguiente tienes 24 horas para completar el ciclo y salvar la racha.')
                  : t('Ya usaste las {creationSavesLimit} CongeladICA de este mes.', { creationSavesLimit })
          }
        />
      ) : null}

      {/* Calendario */}
      <div>
        <div className='mb-3 flex items-center justify-between'>
          <button
            type='button'
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className='flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted'
            aria-label={t('Mes anterior')}
          >
            <ChevronLeftIcon className='size-5' strokeWidth={2.6} />
          </button>
          <p className='m-0 text-lg font-extrabold'>
            {MONTH_NAMES[month]} <span className='font-bold text-muted-foreground'>{year}</span>
          </p>
          <button
            type='button'
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className='flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted'
            aria-label={t('Mes siguiente')}
          >
            <ChevronRightIcon className='size-5' strokeWidth={2.6} />
          </button>
        </div>

        <div className='grid grid-cols-7 gap-1.5'>
          {DAY_NAMES.map((day) => (
            <div key={day} className='pb-1 text-center text-xs font-extrabold text-muted-foreground'>
              {day}
            </div>
          ))}
          {cells.map((cell) => {
            const dayDate = new Date(year, month + cell.monthOffset, cell.day)
            const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
            const isCompleted = activeDays.includes(key)
            const isSaved = activeSavedDays.includes(key)
            const isPendingFrozen = isIca && key === pendingFrozenDay
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
            return <DayCell key={key} day={cell.day} status={status} isToday={key === todayStr} accent={accent} />
          })}
        </div>
      </div>

      {/* El mes en números */}
      {!isFutureMonth ? (
        <div className='grid grid-cols-3 gap-2'>
          <MonthStat value={String(completedCount)} label={t('días hechos')} color={accentInk} />
          <MonthStat value={String(missedCount)} label={t('sin hacer')} color='var(--muted-foreground)' />
          <MonthStat value={`${monthPercent} %`} label={t('del mes')} color={accentInk} />
        </div>
      ) : null}

      <StreakMilestones
        kind={isIca ? 'ica' : 'flashcards'}
        streak={currentStreak}
        milestones={isIca ? STREAK_MILESTONES : FLASH_STREAK_MILESTONES}
      />

      {/* Qué cuenta cada día */}
      <div>
        <p className='mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Qué cuenta cada día')}</p>
        {isIca ? (
          <div className='grid grid-cols-3 gap-2'>
            {[
              { letter: 'I', text: `${CREATION_WORDS_GOAL} palabras`, color: 'var(--ica-i)' },
              { letter: 'C', text: '1 frase', color: 'var(--ica-c)' },
              { letter: 'A', text: t('1 nota con tu voz'), color: 'var(--ica-a)' },
            ].map((item) => (
              <span key={item.letter} className='flex items-center gap-2 rounded-2xl border-2 border-border px-2.5 py-2'>
                <span
                  className='flex size-8 shrink-0 items-center justify-center rounded-xl font-ica text-lg font-extrabold text-white'
                  style={{ background: item.color }}
                >
                  {item.letter}
                </span>
                <span className='text-xs leading-tight font-bold'>{item.text}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className='flex items-center gap-2 rounded-2xl border-2 border-border px-3 py-2.5'>
            <CardsIcon size={26} />
            <span className='text-sm font-bold'>{GOAL} flashcards acertadas</span>
          </span>
        )}
      </div>
    </section>
  )
}

function MonthStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className='flex flex-col items-center rounded-2xl border-2 border-border px-2 py-3 text-center'>
      <span className='text-2xl leading-none font-black tabular-nums' style={{ color }}>
        {value}
      </span>
      <span className='mt-1 text-xs font-bold text-muted-foreground'>{label}</span>
    </div>
  )
}

function DayCell({
  day,
  status,
  isToday,
  accent,
}: {
  day: number
  status: DayStatus
  isToday: boolean
  accent: string
}) {
  const outside = status.startsWith('outside')
  const done = status === 'completed' || status === 'outside-completed'
  const saved = status === 'saved' || status === 'outside-saved' || status === 'frozen-pending'
  return (
    <div
      className={cn(
        'relative flex aspect-square items-center justify-center rounded-full text-sm font-extrabold tabular-nums',
        outside && 'opacity-45',
        status === 'frozen-pending' && 'animate-pulse',
        isToday && 'ring-2 ring-offset-2 ring-offset-background',
      )}
      style={{
        background: done ? accent : saved ? 'color-mix(in oklab, #0ea5e9 24%, var(--background))' : 'transparent',
        color: done ? '#ffffff' : saved ? '#0284c7' : 'var(--muted-foreground)',
        opacity: status === 'future' ? 0.55 : undefined,
        ...(isToday ? ({ '--tw-ring-color': accent } as CSSProperties) : {}),
      }}
    >
      {day}
      {saved ? (
        <span className='absolute -top-1 -right-1'>
          <IceCubeIcon size={14} />
        </span>
      ) : null}
    </div>
  )
}
