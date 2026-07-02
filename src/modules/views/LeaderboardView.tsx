import { useEffect, useMemo, useState } from 'react'
import { CalendarClockIcon, InfoIcon, TrophyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/auth/AuthContext'
import useBreakpoints from '@/modules/hooks/useBreakpoints'
import type { LeaderboardEntry } from '../types'
import {
  fetchTotalIcademers,
  fetchMonthlySnapshotLeaderboard,
  fetchMonthlyStreakLeaderboard,
} from '../services/leaderboard'
import { getIcaTestWindowStartDay } from '../services/icaTests'

const HISTORY_START_MONTH = '2026-05-01'
const FOCUS_TOP_LIMIT = 30
const VISIBLE_LIMIT = 33

type MonthOption = {
  value: string
  label: string
}

type VisibleLeaderboardRow = {
  row: LeaderboardEntry
  rankLabel: string
}

type ScoreBreakdown = {
  userName: string
  monthlyPercent: number
  monthlyPoints: number
  icaTestPoints: number
  listeningPoints: number
  includeIcaTest: boolean
  totalPoints: number
}

function toUtcMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function toLocalMonthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
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

function buildMonthOptions(currentMonthStart: string): MonthOption[] {
  const start = parseIsoDate(HISTORY_START_MONTH)
  const end = parseIsoDate(currentMonthStart)
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

function toComparablePercent(value: number | undefined): number {
  return Math.round(value || 0)
}

function toComparablePoints(value: number | string | undefined | null): number {
  return Math.round(toSafeNumber(value, 0) * 10)
}

function buildVisibleRowsWithSharedRank(
  rows: LeaderboardEntry[],
): VisibleLeaderboardRow[] {
  const result: VisibleLeaderboardRow[] = []
  let sharedRank = 0
  let prevStreak: number | null = null
  let prevPercent: number | null = null
  let prevPoints: number | null = null

  rows.forEach((row, index) => {
    const currentStreak = row.ica_streak_days || 0
    const currentPercent = toComparablePercent(row.avg_percent)
    const currentPoints = toComparablePoints(row.total_points)
    const sameAsPrevious =
      index > 0 &&
      currentStreak === prevStreak &&
      currentPercent === prevPercent &&
      currentPoints === prevPoints

    if (!sameAsPrevious) {
      sharedRank = index + 1
    }

    result.push({
      row,
      rankLabel: rankBadge(sharedRank),
    })

    prevStreak = currentStreak
    prevPercent = currentPercent
    prevPoints = currentPoints
  })

  return result
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

function trailingRankOpacityClass(position: number): string {
  if (position === FOCUS_TOP_LIMIT + 1) return 'opacity-70'
  if (position === FOCUS_TOP_LIMIT + 2) return 'opacity-50'
  if (position === FOCUS_TOP_LIMIT + 3) return 'opacity-30'
  return ''
}

function toSafeNumber(
  value: number | string | null | undefined,
  fallback = 0,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function getMonthlyPercentPoints(row: LeaderboardEntry): number {
  return Math.round(toSafeNumber(row.avg_percent)) * 0.1
}

function getIcaTestPoints(row: LeaderboardEntry): number {
  if (row.ica_test_points === null || row.ica_test_points === undefined)
    return 0
  return toSafeNumber(row.ica_test_points)
}

function getListeningPoints(row: LeaderboardEntry): number {
  if (row.listening_points === null || row.listening_points === undefined)
    return 0
  return toSafeNumber(row.listening_points)
}

function getDisplayedTotalPoints(
  row: LeaderboardEntry,
  includeIcaTest: boolean,
): number {
  const totalFromApi = toSafeNumber(row.total_points)
  if (totalFromApi > 0) return totalFromApi

  const monthlyPoints = getMonthlyPercentPoints(row)
  const listeningPoints = getListeningPoints(row)
  return includeIcaTest
    ? monthlyPoints + listeningPoints + getIcaTestPoints(row)
    : monthlyPoints + listeningPoints
}

function getStreakCellClass(row: LeaderboardEntry): string {
  const streak = row.ica_streak_days || 0
  const frozen = Boolean(row.is_creation_streak_frozen)
  if (frozen) return '[filter:hue-rotate(165deg)_saturate(1.25)] animate-pulse'
  return streak > 0 ? '' : 'grayscale'
}

function getStreakLabel(row: LeaderboardEntry): string {
  const streak = row.ica_streak_days || 0
  return `🔥 ${streak}`
}

function buildScoreBreakdown(
  row: LeaderboardEntry,
  includeIcaTest: boolean,
): ScoreBreakdown {
  const monthlyPercent = Math.round(toSafeNumber(row.avg_percent))
  const monthlyPoints = getMonthlyPercentPoints(row)
  const icaTestPoints = includeIcaTest ? getIcaTestPoints(row) : 0
  const listeningPoints = getListeningPoints(row)

  return {
    userName: row.display_name || row.username || 'Usuario',
    monthlyPercent,
    monthlyPoints,
    icaTestPoints,
    listeningPoints,
    includeIcaTest,
    totalPoints: getDisplayedTotalPoints(row, includeIcaTest),
  }
}

export function LeaderboardView() {
  const { user } = useAuth()
  const { isMd } = useBreakpoints()
  const currentMonthStart = useMemo(() => toLocalMonthStart(new Date()), [])
  const monthOptions = useMemo(
    () => buildMonthOptions(currentMonthStart),
    [currentMonthStart],
  )

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStart)
  const [rows, setRows] = useState<LeaderboardEntry[]>([])
  const [totalIcademers, setTotalIcademers] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false)
  const [selectedScoreBreakdown, setSelectedScoreBreakdown] =
    useState<ScoreBreakdown | null>(null)

  const isCurrentMonth = selectedMonth === currentMonthStart
  const closeAt = useMemo(
    () => closeAtUtcForMonth(selectedMonth),
    [selectedMonth],
  )
  const remainingMs = closeAt.getTime() - nowMs
  const leaderboardClosed = remainingMs <= 0
  const icaTestWindowStartDay = getIcaTestWindowStartDay()
  const currentDay = new Date(nowMs).getDate()

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
        const [data, total] = await Promise.all([
          isCurrentMonth
            ? fetchMonthlyStreakLeaderboard(250)
            : fetchMonthlySnapshotLeaderboard(selectedMonth, VISIBLE_LIMIT),
          fetchTotalIcademers(),
        ])

        if (!active) return
        setRows(data)
        setTotalIcademers(total)
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
  const rowsWithSharedRank = useMemo(
    () => buildVisibleRowsWithSharedRank(visibleRows),
    [visibleRows],
  )
  const topWindowRows = useMemo(
    () => rowsWithSharedRank.slice(0, VISIBLE_LIMIT),
    [rowsWithSharedRank],
  )
  const extraRows = useMemo(
    () => rowsWithSharedRank.slice(VISIBLE_LIMIT),
    [rowsWithSharedRank],
  )
  const missingPlaceholderCount = Math.max(
    VISIBLE_LIMIT - topWindowRows.length,
    0,
  )
  const placeholderRanks = useMemo(
    () =>
      Array.from(
        { length: missingPlaceholderCount },
        (_, index) => topWindowRows.length + index + 1,
      ),
    [missingPlaceholderCount, topWindowRows.length],
  )
  const hasSnapshotIcaPoints = useMemo(
    () =>
      rows.some(
        (row) =>
          row.ica_test_points !== null && row.ica_test_points !== undefined,
      ),
    [rows],
  )
  const showIcaTestColumn =
    (isCurrentMonth && currentDay >= icaTestWindowStartDay) ||
    (!isCurrentMonth && hasSnapshotIcaPoints)
  const desktopTableColumnCount = showIcaTestColumn ? 6 : 5
  const tableColumnCount = isMd ? desktopTableColumnCount : 4
  const includeIcaTestInScoreExplanation =
    (isCurrentMonth && currentDay >= icaTestWindowStartDay) ||
    (!isCurrentMonth && hasSnapshotIcaPoints)

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
              <div className='flex flex-row flex-wrap gap-2 items-center'>
                <p className='flex gap-1 items-center'>
                  <TrophyIcon className='h-4 w-4' />
                  Clasificación mensual
                </p>
                <p className='text-sm'>
                  TOP {FOCUS_TOP_LIMIT} de {totalIcademers ?? '...'} icademers
                </p>
              </div>
            </CardTitle>

            <div className='w-full max-w-72 space-y-2'>
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

              <p className='flex items-center gap-2 text-xs text-muted-foreground'>
                <CalendarClockIcon className='h-4 w-4' />
                {isCurrentMonth && !leaderboardClosed
                  ? `Cierra en ${formatCountdown(remainingMs)} (UTC-12).`
                  : 'Este leaderboard ya cerró.'}
              </p>
            </div>
          </div>

          <p className='text-sm text-muted-foreground'>
            <InfoIcon className='size-4 mr-2 inline-flex' />
            El porcentaje mensual es un promedio de las rachas ICA y flashcards,
            hasta el día 28 inclusive.
          </p>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              Cargando leaderboard...
            </p>
          ) : error ? (
            <p className='text-sm text-destructive'>{error}</p>
          ) : rowsWithSharedRank.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {isCurrentMonth
                ? 'Todavía no hay datos disponibles para este periodo.'
                : `Se están calculando los resultados de ${formatMonthLabel(selectedMonth)}. En el transcurso del día estarán disponibles.`}
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full lg:min-w-160 table-fixed text-left text-sm'>
                <thead className='table w-full table-fixed'>
                  <tr className='border-b text-muted-foreground'>
                    <th className='w-[8%] pb-2 font-medium'>
                      Rank
                    </th>
                    <th className='w-[8%] pb-2 font-medium text-center'>
                      🔥
                    </th>
                    <th className='w-auto pb-2 font-medium'>Nombre</th>
                    {showIcaTestColumn && (
                      <th className='hidden md:table-cell w-[14%] pb-2 font-medium'>
                        ICA Test
                      </th>
                    )}
                    <th className='hidden md:table-cell w-[18%] pb-2 font-medium'>
                      % mensual
                    </th>
                    <th className='w-[26%] md:w-[18%] pb-2 font-medium'>
                      <span className='inline-flex items-center gap-1'>
                        Puntaje total
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          className='h-5 w-5 text-muted-foreground'
                          aria-label='Cómo se calcula el puntaje total'
                          onClick={() => setScoreInfoOpen(true)}
                        >
                          <InfoIcon className='size-3.5' />
                        </Button>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className='block lg:max-h-[50dvh] lg:overflow-y-auto'>
                  {topWindowRows.map(({ row, rankLabel }, index) => (
                    <tr
                      key={`${row.user_id}-${row.rank}-${selectedMonth}`}
                      className={`table w-full table-fixed border-b align-middle ${trailingRankOpacityClass(index + 1)} ${
                        row.user_id === user?.id ? 'bg-emerald-500/10' : ''
                      }`}
                      >
                      <td className='w-[8%] py-2'>{rankLabel}</td>
                      <td
                        className={`w-[8%] py-2 text-center ${getStreakCellClass(row)}`}
                      >
                        {getStreakLabel(row)}
                      </td>
                      <td className='w-auto py-2 flex flex-row gap-3 items-center pr-2'>
                        <p className='truncate font-medium'>
                          {row.display_name || row.username || 'Usuario'}
                        </p>
                        {row.user_id === user?.id && (
                          <p className='text-xs text-emerald-600 dark:text-emerald-400'>
                            (Tú)
                          </p>
                        )}
                      </td>
                      {showIcaTestColumn && (
                        <td className='hidden md:table-cell w-[14%] py-2 font-medium'>
                          {row.ica_test_points === null ||
                          row.ica_test_points === undefined
                            ? '-'
                            : toSafeNumber(row.ica_test_points).toFixed(1)}
                        </td>
                      )}
                      <td className='hidden md:table-cell w-[18%] py-2 font-medium'>
                        {Math.round(row.avg_percent || 0)}%
                      </td>
                      <td className='w-[26%] md:w-[18%] py-2'>
                        <Button
                          type='button'
                          variant='ghost'
                          className='h-auto p-0 text-sm font-bold md:font-medium'
                          onClick={() =>
                            setSelectedScoreBreakdown(
                              buildScoreBreakdown(
                                row,
                                includeIcaTestInScoreExplanation,
                              ),
                            )
                          }
                          aria-label='Ver cómo se calculó este puntaje total'
                        >
                          {getDisplayedTotalPoints(
                            row,
                            includeIcaTestInScoreExplanation,
                          ).toFixed(1)}
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {placeholderRanks.map((rank) => (
                    <tr
                      key={`placeholder-rank-${rank}-${selectedMonth}`}
                      className={`table w-full table-fixed border-b align-middle ${trailingRankOpacityClass(rank)}`}
                    >
                      <td className='w-[8%] py-2'>#{rank}</td>
                      <td className='w-[8%] py-2 text-center text-muted-foreground'>
                        -
                      </td>
                      <td className='w-auto py-2 pr-2 text-muted-foreground'>
                        -
                      </td>
                      {showIcaTestColumn && (
                        <td className='hidden md:table-cell w-[14%] py-2 text-muted-foreground'>
                          -
                        </td>
                      )}
                      <td className='hidden md:table-cell w-[18%] py-2 text-muted-foreground'>
                        -
                      </td>
                      <td className='w-[26%] md:w-[18%] py-2 text-muted-foreground'>
                        -
                      </td>
                    </tr>
                  ))}

                  <tr className='table w-full table-fixed align-middle opacity-40'>
                    <td
                      colSpan={tableColumnCount}
                      className='py-2 text-center text-lg tracking-[0.6em] text-muted-foreground'
                    >
                      ...
                    </td>
                  </tr>

                  {extraRows.map(({ row, rankLabel }) => (
                    <tr
                      key={`${row.user_id}-${row.rank}-${selectedMonth}-extra`}
                      className={`table w-full table-fixed border-b align-middle last:border-b-0 ${
                        row.user_id === user?.id ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className='w-[8%] py-2'>{rankLabel}</td>
                      <td
                        className={`w-[8%] py-2 text-center ${getStreakCellClass(row)}`}
                      >
                        {getStreakLabel(row)}
                      </td>
                      <td className='w-auto py-2 flex flex-row gap-3 items-center pr-2'>
                        <p className='truncate font-medium'>
                          {row.display_name || row.username || 'Usuario'}
                        </p>
                        {row.user_id === user?.id && (
                          <p className='text-xs text-emerald-600 dark:text-emerald-400'>
                            (Tú)
                          </p>
                        )}
                      </td>
                      {showIcaTestColumn && (
                        <td className='hidden md:table-cell w-[14%] py-2 font-medium'>
                          {row.ica_test_points === null ||
                          row.ica_test_points === undefined
                            ? '-'
                            : toSafeNumber(row.ica_test_points).toFixed(1)}
                        </td>
                      )}
                      <td className='hidden md:table-cell w-[18%] py-2 font-medium'>
                        {Math.round(row.avg_percent || 0)}%
                      </td>
                      <td className='w-[26%] md:w-[18%] py-2'>
                        <Button
                          type='button'
                          variant='ghost'
                          className='h-auto p-0 text-sm font-bold md:font-medium'
                          onClick={() =>
                            setSelectedScoreBreakdown(
                              buildScoreBreakdown(
                                row,
                                includeIcaTestInScoreExplanation,
                              ),
                            )
                          }
                          aria-label='Ver cómo se calculó este puntaje total'
                        >
                          {getDisplayedTotalPoints(
                            row,
                            includeIcaTestInScoreExplanation,
                          ).toFixed(1)}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={scoreInfoOpen} onOpenChange={setScoreInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cómo se calcula el puntaje total</DialogTitle>
            <DialogDescription>
              <div className='space-y-2 text-foreground'>
                <p>
                  🧮 <strong>Fórmula:</strong>{' '}
                  {includeIcaTestInScoreExplanation
                    ? 'Puntaje total = (% mensual / 10) + puntos por escucha + puntos de ICA Test.'
                    : 'Puntaje total = (% mensual / 10) + puntos por escucha.'}
                </p>
                <p>
                  🎧 <strong>Escucha:</strong> 0,01 puntos por cada minuto escuchado,
                  con tope de <strong>0,1 por día</strong> (solo cuentan 10 min por
                  día). Se acumula solo hasta el <strong>día 28</strong>.
                </p>
                <p>
                  📝 <strong>ICA Test:</strong>{' '}
                  {includeIcaTestInScoreExplanation
                    ? 'cada respuesta correcta vale 0,1 puntos.'
                    : `empieza a sumar desde el día ${icaTestWindowStartDay} de cada mes.`}
                </p>
                <Separator className='my-2' />
                <p>
                  💡 <strong>Ejemplo:</strong>{' '}
                  {includeIcaTestInScoreExplanation
                    ? '84% mensual + 30 min escuchados en un mismo día (tope diario aplicado) + 11/15 en ICA Test = 8,4 + 0,1 + 1,1 = 9,6.'
                    : '84% mensual + 30 min escuchados en un mismo día (tope diario aplicado) = 8,4 + 0,1 = 8,5.'}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedScoreBreakdown)}
        onOpenChange={(open) => {
          if (!open) setSelectedScoreBreakdown(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desglose de puntaje</DialogTitle>
            <DialogDescription>
              {selectedScoreBreakdown ? (
                <div className='space-y-2 text-foreground'>
                  <p>
                    🏁 <strong>{selectedScoreBreakdown.userName}</strong>: {selectedScoreBreakdown.totalPoints.toFixed(1)} puntos totales.
                  </p>
                  <p>
                    📊 <strong>% mensual:</strong> {selectedScoreBreakdown.monthlyPercent}% = {selectedScoreBreakdown.monthlyPoints.toFixed(1)} puntos.
                  </p>
                  <p>
                    🎧 <strong>Escucha:</strong> {selectedScoreBreakdown.listeningPoints.toFixed(1)} puntos (0,01 por minuto, tope 0,1 por día).
                  </p>
                  <p>
                    📝 <strong>ICA Test:</strong>{' '}
                    {selectedScoreBreakdown.includeIcaTest
                      ? `${selectedScoreBreakdown.icaTestPoints.toFixed(1)} puntos.`
                      : `no suma antes del día ${icaTestWindowStartDay}.`}
                  </p>
                  <Separator className='my-2' />
                  <p>
                    🧾 <strong>Total:</strong>{' '}
                    {selectedScoreBreakdown.includeIcaTest
                      ? `${selectedScoreBreakdown.monthlyPoints.toFixed(1)} + ${selectedScoreBreakdown.listeningPoints.toFixed(1)} + ${selectedScoreBreakdown.icaTestPoints.toFixed(1)} = ${selectedScoreBreakdown.totalPoints.toFixed(1)}.`
                      : `${selectedScoreBreakdown.monthlyPoints.toFixed(1)} + ${selectedScoreBreakdown.listeningPoints.toFixed(1)} = ${selectedScoreBreakdown.totalPoints.toFixed(1)}.`}
                  </p>
                </div>
              ) : (
                ''
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </section>
  )
}
