import { useEffect, useMemo, useState } from 'react'
import { CalendarDaysIcon, TrophyIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchHistoricLeaderboardByMonth,
  fetchHistoricLeaderboardMonths,
  type HistoricLeaderboardEntry,
  type HistoricLeaderboardMonth,
} from '../services/historicLeaderboard'

function monthLabel(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00`)
  if (Number.isNaN(date.getTime())) return periodStart

  const label = date.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  })

  return label.slice(0, 1).toUpperCase() + label.slice(1)
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

export function HistoricLeaderboardView() {
  const [months, setMonths] = useState<HistoricLeaderboardMonth[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [rows, setRows] = useState<HistoricLeaderboardEntry[]>([])
  const [loadingMonths, setLoadingMonths] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoadingMonths(true)
      setError(null)

      try {
        const data = await fetchHistoricLeaderboardMonths(48)
        if (!active) return
        setMonths(data)
        setSelectedMonth(data[0]?.periodStart || '')
      } catch (err) {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el histórico del leaderboard.',
        )
      } finally {
        if (!active) return
        setLoadingMonths(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedMonth) {
      setRows([])
      return
    }

    let active = true

    const run = async () => {
      setLoadingRows(true)
      setError(null)

      try {
        const data = await fetchHistoricLeaderboardByMonth(selectedMonth, 500)
        if (!active) return
        setRows(data)
      } catch (err) {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el mes seleccionado.',
        )
      } finally {
        if (!active) return
        setLoadingRows(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [selectedMonth])

  const selectedPeriod = useMemo(() => {
    return months.find((month) => month.periodStart === selectedMonth) || null
  }, [months, selectedMonth])

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Histórico leaderboard</h2>
        <p className='text-sm text-muted-foreground'>
          Ranking mensual cerrado para análisis de super admin.
        </p>
      </div>

      <Card>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <TrophyIcon className='h-4 w-4' />
              Leaderboard histórico
            </CardTitle>

            <div className='w-full max-w-72'>
              <Select
                value={selectedMonth}
                onValueChange={(value) => setSelectedMonth(value)}
                disabled={loadingMonths || months.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingMonths ? 'Cargando meses...' : 'Selecciona un mes'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.periodStart} value={month.periodStart}>
                      {monthLabel(month.periodStart)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedPeriod && (
            <p className='flex items-center gap-2 text-sm text-muted-foreground'>
              <CalendarDaysIcon className='h-4 w-4' />
              Periodo: {selectedPeriod.periodStart} - {selectedPeriod.periodEnd}
            </p>
          )}

          {error && <p className='text-sm text-destructive'>{error}</p>}
        </CardHeader>

        <CardContent>
          {loadingMonths || loadingRows ? (
            <p className='text-sm text-muted-foreground'>Cargando leaderboard...</p>
          ) : months.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Aún no hay snapshots mensuales disponibles.
            </p>
          ) : rows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No hay filas para el mes seleccionado.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-180 table-fixed text-left text-sm'>
                <thead className='table w-full table-fixed'>
                  <tr className='border-b text-muted-foreground'>
                    <th className='w-[8%] pb-2 font-medium'>Rank</th>
                    <th className='w-[27%] pb-2 font-medium'>Usuario</th>
                    <th className='w-[12%] pb-2 font-medium'>Racha ICA</th>
                    <th className='w-[13%] pb-2 font-medium'>% mensual</th>
                    <th className='w-[13%] pb-2 font-medium'>% review</th>
                    <th className='w-[13%] pb-2 font-medium'>% creación</th>
                    <th className='w-[14%] pb-2 font-medium'>Score</th>
                  </tr>
                </thead>
                <tbody className='block max-h-[58dvh] overflow-y-auto'>
                  {rows.map((row) => (
                    <tr
                      key={`${row.periodStart}-${row.userId}`}
                      className='table w-full table-fixed border-b align-middle last:border-b-0'
                    >
                      <td className='w-[8%] py-2'>{rankBadge(row.rank)}</td>
                      <td className='w-[27%] py-2'>
                        <p className='truncate font-medium'>
                          {row.displayName || row.username || 'Usuario'}
                        </p>
                        <p className='truncate text-xs text-muted-foreground'>
                          {row.username}
                        </p>
                      </td>
                      <td className='w-[12%] py-2'>{row.icaStreakDays}</td>
                      <td className='w-[13%] py-2'>
                        {Math.round(row.avgPercent)}%
                      </td>
                      <td className='w-[13%] py-2'>
                        {Math.round(row.reviewPercent)}%
                      </td>
                      <td className='w-[13%] py-2'>
                        {Math.round(row.creationPercent)}%
                      </td>
                      <td className='w-[14%] py-2'>{row.score}</td>
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
