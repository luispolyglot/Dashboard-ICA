import { useState } from 'react'
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

export function CalendarModal({ completedDays, creationDays, onClose, activeTab }: CalendarModalProps) {
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
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const isFutureMonth = new Date(year, month, 1) > today
  const lastDayToCount = isCurrentMonth ? today.getDate() : daysInMonth

  let completedCount = 0
  for (let d = 1; d <= lastDayToCount; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (activeDays.includes(key)) completedCount++
  }

  const missedCount = lastDayToCount - completedCount
  const monthPercent = lastDayToCount > 0 ? Math.round((completedCount / lastDayToCount) * 100) : 0

  const prevMonth = (): void => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = (): void => setViewDate(new Date(year, month + 1, 1))

  return (
    <div className='fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-5' onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className='w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6'
      >
        <div className='mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1'>
          <button
            type='button'
            onClick={() => setTab('review')}
            className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition ${
              tab === 'review' ? 'bg-blue-950 text-blue-400' : 'text-slate-500'
            }`}
          >
            🔥 Racha Flashcards
          </button>
          <button
            type='button'
            onClick={() => setTab('creation')}
            className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition ${
              tab === 'creation' ? 'bg-blue-950 text-blue-400' : 'text-slate-500'
            }`}
          >
            ✦ Racha ICA
          </button>
        </div>

        <div className='mb-5 flex items-center justify-between'>
          <button type='button' onClick={prevMonth} className='h-9 w-9 rounded-lg border border-slate-800 text-slate-400'>
            ‹
          </button>

          <div className='text-center'>
            <div className='font-serif text-2xl font-bold text-slate-100'>{MONTH_NAMES[month]}</div>
            <div className='text-sm text-slate-500'>{year}</div>
          </div>

          <button type='button' onClick={nextMonth} className='h-9 w-9 rounded-lg border border-slate-800 text-slate-400'>
            ›
          </button>
        </div>

        <div className='mb-2 grid grid-cols-7 gap-1'>
          {DAY_NAMES.map((day) => (
            <div key={day} className='py-1 text-center text-[11px] font-semibold text-slate-500'>
              {day}
            </div>
          ))}
        </div>

        <div className='grid grid-cols-7 gap-1'>
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} />
            }

            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isCompleted = activeDays.includes(key)
            const isToday = key === todayStr

            const dayDate = new Date(year, month, day)
            const baselineToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
            const isFuture = dayDate > baselineToday
            const isPast = dayDate < baselineToday

            const status: DayStatus = isFuture ? 'future' : isCompleted ? 'completed' : isPast ? 'missed' : 'empty'

            return (
              <DayCell key={key} day={day} status={status} isToday={isToday} />
            )
          })}
        </div>

        <div className='mt-5 flex justify-center gap-6 border-t border-slate-800 pt-4'>
          <Stat label='Dias completados' value={completedCount} valueClass='text-blue-400' />
          <Stat label='Dias sin completar' value={isFutureMonth ? 0 : missedCount} valueClass='text-red-400' />
          <Stat label='Racha actual' value={getStreak(activeDays)} valueClass='text-amber-400' />
        </div>

        {!isFutureMonth && (
          <div className='mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3.5'>
            <div className='mb-2 flex items-center justify-between'>
              <span className='text-xs font-semibold text-slate-400'>Progreso del mes</span>
              <span className='text-xl font-bold text-blue-400'>{monthPercent}%</span>
            </div>
            <div className='grid grid-cols-10 gap-1 rounded-md bg-slate-800 p-1'>
              {Array.from({ length: 10 }, (_, i) => {
                const threshold = (i + 1) * 10
                const active = monthPercent >= threshold
                return <div key={i} className={`h-2 rounded-full ${active ? 'bg-blue-400' : 'bg-slate-900'}`} />
              })}
            </div>
            <div className='mt-1.5 text-center text-[11px] text-slate-500'>
              {completedCount} de {lastDayToCount} dia{lastDayToCount !== 1 ? 's' : ''} completado
              {completedCount !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {tab === 'review' && (
          <div className='mt-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3'>
            <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-400'>
              Requisito diario
            </div>
            <div className='text-xs text-slate-400'>📚 +{GOAL} flashcards acertados</div>
          </div>
        )}

        {tab === 'creation' && (
          <div className='mt-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3'>
            <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-400'>
              Requisitos diarios
            </div>
            <div className='flex flex-wrap gap-3 text-xs text-slate-400'>
              <span>✍️ +{CREATION_WORDS_GOAL} palabras</span>
              <span>⚡ 1 frase de activacion</span>
            </div>
          </div>
        )}

        <div className='mt-4 flex justify-center gap-4'>
          <Legend colorClass='border border-blue-400/50 bg-blue-400/20' label='Completado' />
          <Legend colorClass='border border-red-400/30 bg-red-400/10' label='No completado' />
        </div>
      </div>
    </div>
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
      ? 'border-blue-400/50 bg-blue-400/20 text-blue-400'
      : status === 'missed'
        ? 'border-red-400/30 bg-red-400/10 text-red-400'
        : status === 'future'
          ? 'border-transparent bg-slate-950 text-slate-800'
          : 'border-slate-800 bg-slate-950 text-slate-600'

  return (
    <div className={`relative flex aspect-square items-center justify-center rounded-lg border text-sm font-medium ${statusClass} ${isToday ? 'ring-2 ring-white/70' : ''}`}>
      {day}
      {status === 'completed' && <div className='absolute bottom-[3px] h-1.5 w-1.5 rounded-full bg-blue-400' />}
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
      <div className='text-[11px] text-slate-500'>{label}</div>
    </div>
  )
}

type LegendProps = {
  colorClass: string
  label: string
}

function Legend({ colorClass, label }: LegendProps) {
  return (
    <div className='flex items-center gap-1.5'>
      <div className={`h-2.5 w-2.5 rounded-sm ${colorClass}`} />
      <span className='text-[11px] text-slate-500'>{label}</span>
    </div>
  )
}
