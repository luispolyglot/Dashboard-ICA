import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, RefreshCwIcon, UsersIcon } from 'lucide-react'
import { EmptyState, IconTile, ListRow, PageTitle, Panel, Pill, RowGroup, SectionLabel } from '../game/ui'
import { UserInitial } from '../game/ranking'
import { Button } from '@/components/ui/button'
import {
  fetchCoachingManagedUsers,
  type CoachingManagedUser,
} from '../services/coaching'
import { getManageCoachingUserRoute } from '../routes/paths'
import { formatDateTime } from '../utils'
import { useSoftLoading } from '../hooks/useSoftLoading'

type ManageCoacherSessionsViewProps = {
  coachUserId: string
}

export function ManageCoacherSessionsView({
  coachUserId,
}: ManageCoacherSessionsViewProps) {
  const navigate = useNavigate()
  const [loading, setLoading, refreshing] = useSoftLoading(true, coachUserId)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<CoachingManagedUser[]>([])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCoachingManagedUsers()
      setRows(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar las sesiones del coacher.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [coachUserId])

  const sessions = useMemo(
    () => rows.filter((row) => row.coachUserId === coachUserId),
    [rows, coachUserId],
  )

  const coachDisplayName =
    sessions[0]?.coachDisplayName || sessions[0]?.coachUserId || coachUserId

  const statusLabel = (status: string) =>
    status === 'active' ? 'Activa' : status === 'draft' ? 'Borrador' : status === 'finished' ? 'Terminada' : status

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='c' size={48}>
            <UsersIcon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle={coachDisplayName}
        right={
          <span className='flex gap-2'>
            <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => navigate(-1)} aria-label='Volver'>
              <ArrowLeftIcon className='size-5' strokeWidth={2.6} />
            </Button>
            <Button type='button' variant='outline' size='icon' className='rounded-2xl' onClick={() => void loadData()} disabled={loading || refreshing} aria-label='Recargar'>
              <RefreshCwIcon className={loading || refreshing ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
            </Button>
          </span>
        }
      >
        Alumnos del coacher
      </PageTitle>

      {error ? (
        <Panel tone='bad' className='text-sm font-bold'>
          {error}
        </Panel>
      ) : null}

      <div>
        <SectionLabel>{sessions.length === 1 ? '1 sesión' : `${sessions.length} sesiones`}</SectionLabel>
        {loading && sessions.length === 0 ? (
          <div className='flex flex-col gap-2' aria-hidden='true'>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className='h-16 animate-pulse rounded-2xl bg-muted' />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <Panel>
            <EmptyState title='Sin alumnos asignados' text='Cuando asignes alumnos a este coacher, aparecerán aquí.' />
          </Panel>
        ) : (
          <RowGroup>
            {sessions.map((row) => (
              <ListRow
                key={row.id}
                onClick={() => navigate(getManageCoachingUserRoute(row.userId, row.id))}
                icon={<UserInitial name={row.userDisplayName} size={40} />}
                title={row.userDisplayName}
                text={
                  <span className='flex flex-wrap items-center gap-1.5'>
                    <Pill tone='i'>
                      {row.targetLang} {row.level}
                    </Pill>
                    <Pill tone={row.status === 'active' ? 'ok' : 'neutral'}>{statusLabel(row.status)}</Pill>
                    <span>{formatDateTime(row.updatedAt)}</span>
                  </span>
                }
              />
            ))}
          </RowGroup>
        )}
      </div>
    </section>
  )
}
