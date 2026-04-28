import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMonthlyLeaderboard } from '../hooks/useMonthlyLeaderboard'

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

export function LeaderboardMenu() {
  const { user } = useAuth()
  const { rows, loading, error } = useMonthlyLeaderboard()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='inline-flex'>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                aria-label='Abrir leaderboard'
              >
                <span aria-hidden='true' className='text-base'>
                  🏆
                </span>
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>Leaderboard</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        onCloseAutoFocus={(e) => e.preventDefault()}
        align='end'
        className='w-80'
      >
        <DropdownMenuLabel>Leaderboard</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading && (
          <p className='px-2 py-1.5 text-sm text-muted-foreground'>
            Cargando...
          </p>
        )}
        {!loading && error && (
          <p className='px-2 py-1.5 text-sm text-destructive'>{error}</p>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className='px-2 py-1.5 text-sm text-muted-foreground'>
            Todavía no hay datos suficientes este mes.
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className='space-y-1 p-1'>
            <div className='flex items-center justify-end px-2 text-[11px] font-medium text-muted-foreground'>
              <span>Racha ICA · % mensual</span>
            </div>
            {rows.map((row) => (
              <div
                key={`${row.user_id}-${row.rank}`}
                className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${
                  row.user_id === user?.id
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : ''
                }`}
              >
                <div className='flex min-w-0 items-center gap-2'>
                  <span className='w-4 shrink-0 text-xs text-muted-foreground'>
                    {rankBadge(row.rank)}
                  </span>
                  {row.user_id === user?.id && (
                    <span className='h-2 w-2 rounded-full bg-emerald-500' />
                  )}
                  <span className='truncate text-sm max-w-36'>
                    {row.display_name || row.username || 'Usuario'}
                  </span>
                </div>
                <span className='text-sm font-medium'>
                  {row.ica_streak_days && row.ica_streak_days > 0
                    ? `🔥 ${row.ica_streak_days} · ${Math.round(row.avg_percent || 0)}%`
                    : `${Math.round(row.avg_percent || 0)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
