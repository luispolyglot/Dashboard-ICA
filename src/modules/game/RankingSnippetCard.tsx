import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { fetchMonthlyStreakLeaderboard, peekMonthlyStreakLeaderboard } from '../services/leaderboard'
import { DASHBOARD_ROUTES } from '../routes/paths'
import type { LeaderboardEntry } from '../types'
import { parseFeaturedBadge, useFeaturedBadge } from './featuredBadge'
import { TrophyIcon } from './icons'
import { MedalDefs } from './Medal'
import { LeaderboardRow, rowName, rowTotalPoints } from './ranking'
import { t } from '@/i18n'

/** Tarjeta del ranking del mes para la columna derecha (ordenador): top 3 y tu puesto. */
export function RankingSnippetCard() {
  const { user } = useAuth()
  const { badge: myBadge } = useFeaturedBadge(user?.id)
  // Lo último que se cargó sale al momento (al volver a Inicio no hay que esperar).
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(() => peekMonthlyStreakLeaderboard(250) ?? null)

  useEffect(() => {
    let active = true
    fetchMonthlyStreakLeaderboard(250)
      .then((data) => {
        if (active) setRows(data)
      })
      .catch(() => {
        if (active) setRows((previous) => previous ?? [])
      })
    return () => {
      active = false
    }
  }, [])

  const myIndex = rows ? rows.findIndex((row) => row.user_id === user?.id) : -1
  const top = rows ? rows.slice(0, 3) : []

  return (
    <div className='rounded-3xl border-2 border-border p-4'>
      <MedalDefs />
      <div className='mb-1 flex items-center justify-between'>
        <h2 className='m-0 flex items-center gap-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
          <TrophyIcon size={22} />
          {t('Ranking del mes')}
        </h2>
        <Link
          to={DASHBOARD_ROUTES.leaderboard}
          className='flex items-center gap-0.5 text-xs font-extrabold tracking-[0.06em] text-primary uppercase'
        >
          {t('Ver todo')}
          <ChevronRightIcon className='size-4' aria-hidden='true' />
        </Link>
      </div>
      <p className='m-0 mb-2 text-xs font-medium text-muted-foreground'>{t('Se cierra el día 28')}</p>
      {rows === null ? (
        <p className='text-sm text-muted-foreground'>{t('Cargando…')}</p>
      ) : rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('Aún no hay datos este mes.')}</p>
      ) : (
        <div className='flex flex-col gap-0.5'>
          {top.map((row, index) => (
            <LeaderboardRow
              key={row.user_id}
              rank={row.rank || index + 1}
              name={rowName(row)}
              points={rowTotalPoints(row)}
              isMe={row.user_id === user?.id}
              badge={row.user_id === user?.id ? myBadge : parseFeaturedBadge(row.featured_badge)}
            />
          ))}
          {myIndex >= 3 ? (
            <>
              <div className='text-center text-sm font-extrabold text-muted-foreground'>···</div>
              <LeaderboardRow
                rank={rows[myIndex].rank || myIndex + 1}
                name={rowName(rows[myIndex])}
                points={rowTotalPoints(rows[myIndex])}
                isMe
                badge={myBadge}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
