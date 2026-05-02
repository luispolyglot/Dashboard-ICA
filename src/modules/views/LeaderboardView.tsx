import { useEffect, useMemo, useState } from 'react'
import { CalendarClockIcon, InfoIcon, TrophyIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/auth/AuthContext'
import type { LeaderboardEntry } from '../types'
import {
  fetchMonthlySnapshotLeaderboard,
  fetchMonthlyStreakLeaderboard,
} from '../services/leaderboard'

const HISTORY_START_MONTH = '2026-05-01'
const VISIBLE_LIMIT = 30

type MonthOption = {
  value: string
  label: string
}

function toUtcMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1))
}

function formatMonthLabel(isoMonthStart: string): string {
  const date = parseIsoDate(isoMonthStart)
  const label = date.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return label.slice(0, 1).toUpperCase() + label.slice(1)
}

function buildMonthOptions(currentUtcMonthStart: string): MonthOption[] {
  const start = parseIsoDate(HISTORY_START_MONTH)
  const end = parseIsoDate(currentUtcMonthStart)
  const options: MonthOption[] = []

  const cursor = new Date(end)
  while (cursor >= start) {
    const value = toUtcMonthStart(cursor)
    options.push({ value, label: formatMonthLabel(value) })
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }

  return options
}

function pickVisibleRows(
  rows: LeaderboardEntry[],
  currentUserId: string | undefined,
): LeaderboardEntry[] {
  const topRows = rows.slice(0, VISIBLE_LIMIT)
  if (!currentUserId) return topRows

  const currentUserRow = rows.find((row) => row.user_id === currentUserId)
  const alreadyVisible = topRows.some((row) => row.user_id === currentUserId)
  if (!currentUserRow || alreadyVisible) return topRows

  return [...topRows, currentUserRow]
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

function closeAtUtcForMonth(isoMonthStart: string): Date {
  const date = parseIsoDate(isoMonthStart)
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 29, 12, 0, 0),
  )
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m'

  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function LeaderboardView() {
  const { user } = useAuth()
  const currentUtcMonthStart = useMemo(() => toUtcMonthStart(new Date()), [])
  const monthOptions = useMemo(
    () => buildMonthOptions(currentUtcMonthStart),
    [currentUtcMonthStart],
  )

  const [selectedMonth, setSelectedMonth] = useState(currentUtcMonthStart)
  const [rows, setRows] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const isCurrentMonth = selectedMonth === currentUtcMonthStart
  const closeAt = useMemo(
    () => closeAtUtcForMonth(selectedMonth),
    [selectedMonth],
  )
  const remainingMs = closeAt.getTime() - nowMs
  const leaderboardClosed = remainingMs <= 0

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = isCurrentMonth
          ? await fetchMonthlyStreakLeaderboard(250)
          : await fetchMonthlySnapshotLeaderboard(selectedMonth, VISIBLE_LIMIT)

        if (!active) return
        setRows(data)
      } catch {
        if (!active) return
        setError('No se pudo cargar el leaderboard.')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [isCurrentMonth, selectedMonth])

  const visibleRows = useMemo(
    () => pickVisibleRows(rows, user?.id),
    [rows, user?.id],
  )

  return (
    <section className='mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Leaderboard</h2>
        <p className='text-sm text-muted-foreground'>
          Ranking mensual de progreso con corte oficial del 1 al 28.
        </p>
      </div>

      <Card className='mb-4'>
        <CardHeader className='gap-3'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TrophyIcon className='h-4 w-4' />
              Clasificación mensual
            </CardTitle>

            <div className='w-full max-w-72'>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder='Selecciona mes' />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <InfoIcon className='h-4 w-4' />
            El porcentaje mensual se calcula con los días del 1 al 28.
          </p>

          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <CalendarClockIcon className='h-4 w-4' />
            {isCurrentMonth && !leaderboardClosed
              ? `Cierra en ${formatCountdown(remainingMs)} (UTC-12).`
              : 'Este leaderboard ya cerró.'}
          </p>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              Cargando leaderboard...
            </p>
          ) : error ? (
            <p className='text-sm text-destructive'>{error}</p>
          ) : visibleRows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Todavía no hay datos disponibles para este periodo.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full lg:min-w-160 table-fixed text-left text-sm'>
                <thead className='table w-full table-fixed'>
                  <tr className='border-b text-muted-foreground'>
                    <th className='w-[15%] pb-2 font-medium'>Rank</th>
                    <th className='w-auto pb-2 font-medium'>Usuario</th>
                    <th className='w-[20%] pb-2 font-medium'>Racha ICA</th>
                    <th className='w-[20%] pb-2 font-medium'>% mensual</th>
                  </tr>
                </thead>
                <tbody className='block max-h-[60dvh] overflow-y-auto'>
                  {visibleRows.map((row) => (
                    <tr
                      key={`${row.user_id}-${row.rank}-${selectedMonth}`}
                      className={`table w-full table-fixed border-b align-middle last:border-b-0 ${
                        row.user_id === user?.id ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className='w-[15%] py-2'>{rankBadge(row.rank)}</td>
                      <td className='w-auto py-2 flex flex-row gap-3 items-center'>
                        <p className='truncate font-medium'>
                          {row.display_name || row.username || 'Usuario'}
                        </p>
                        {row.user_id === user?.id && (
                          <p className='text-xs text-emerald-600 dark:text-emerald-400'>
                            (Tú)
                          </p>
                        )}
                      </td>
                      <td className='w-[20%] py-2'>
                        {row.ica_streak_days && row.ica_streak_days > 0
                          ? `🔥 ${row.ica_streak_days}`
                          : '0'}
                      </td>
                      <td className='w-[20%] py-2 font-medium'>
                        {Math.round(row.avg_percent || 0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
