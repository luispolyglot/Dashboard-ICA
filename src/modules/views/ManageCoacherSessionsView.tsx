import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, EyeIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchCoachingManagedUsers,
  type CoachingManagedUser,
} from '../services/coaching'
import { getManageCoachingUserRoute } from '../routes/paths'

type ManageCoacherSessionsViewProps = {
  coachUserId: string
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

export function ManageCoacherSessionsView({
  coachUserId,
}: ManageCoacherSessionsViewProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
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

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>
            Sesiones del coacher
          </h2>
          <p className='text-sm text-muted-foreground'>{coachDisplayName}</p>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button type='button' variant='outline' onClick={() => navigate(-1)}>
            <ArrowLeftIcon className='h-4 w-4' />
            Volver
          </Button>
          <Button type='button' variant='ghost' onClick={() => void loadData()}>
            <RefreshCwIcon className='h-4 w-4' />
            Recargar
          </Button>
        </div>
      </div>

      {error && <p className='mb-4 text-sm text-destructive'>{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Sesiones asignadas ({sessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              Cargando sesiones...
            </p>
          ) : sessions.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Este coacher no tiene sesiones asignadas.
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-180 table-fixed text-left text-sm'>
                <thead>
                  <tr className='border-b text-muted-foreground'>
                    <th className='pb-2 font-medium'>Usuario</th>
                    <th className='pb-2 font-medium'>Idioma</th>
                    <th className='pb-2 font-medium'>Nivel</th>
                    <th className='pb-2 font-medium'>Estado</th>
                    <th className='pb-2 font-medium'>Actualizado</th>
                    <th className='pb-2 font-medium'>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row) => (
                    <tr
                      key={row.id}
                      className='border-b align-middle last:border-b-0'
                    >
                      <td className='py-2'>{row.userDisplayName}</td>
                      <td className='py-2'>{row.targetLang}</td>
                      <td className='py-2'>{row.level}</td>
                      <td className='py-2'>{row.status}</td>
                      <td className='py-2 text-xs text-muted-foreground'>
                        {formatDateTime(row.updatedAt)}
                      </td>
                      <td className='py-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          aria-label='Ver sesión de usuario'
                          onClick={() =>
                            navigate(
                              getManageCoachingUserRoute(row.userId, row.id),
                            )
                          }
                        >
                          <EyeIcon className='h-4 w-4' />
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
    </section>
  )
}
