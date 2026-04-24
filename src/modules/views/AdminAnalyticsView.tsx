import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ActivityIcon,
  BookOpenTextIcon,
  MessageSquareQuoteIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AnalyticsRequestError,
  fetchAdminAnalytics,
  type AdminAnalyticsDailySignup,
  type AdminAnalyticsPayload,
} from '../services/adminAnalytics'

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No disponible'
  return date.toLocaleString()
}

export function AdminAnalyticsView() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AdminAnalyticsPayload | null>(null)

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await fetchAdminAnalytics()
        if (!isMounted) return
        setAnalytics(result)
      } catch (err) {
        if (!isMounted) return

        if (err instanceof AnalyticsRequestError && err.status === 403) {
          navigate('/', { replace: true })
          return
        }

        const message =
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el panel de analíticas.'
        setError(message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [navigate])

  const signupMaxCount = useMemo(() => {
    const counts = analytics?.dailySignups.map((item) => item.count) || []
    return counts.length ? Math.max(...counts, 1) : 1
  }, [analytics?.dailySignups])

  if (loading) {
    return (
      <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
        <h2 className='mb-2 font-serif text-3xl font-bold'>Analíticas Admin</h2>
        <p className='text-sm text-muted-foreground'>
          Cargando métricas globales...
        </p>
      </section>
    )
  }

  if (error || !analytics) {
    return (
      <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
        <h2 className='mb-2 font-serif text-3xl font-bold'>Analíticas Admin</h2>
        <p className='text-sm text-destructive'>
          {error || 'No hay información para mostrar.'}
        </p>
      </section>
    )
  }

  return (
    <section className='mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-6'>
        <h2 className='mb-1 font-serif text-3xl font-bold'>Analíticas Admin</h2>
        <p className='text-sm text-muted-foreground'>
          Vista global del uso de la plataforma para usuarios con permisos
          administrativos.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <UsersIcon className='h-4 w-4' />
              Usuarios registrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {analytics.summary.totalUsers}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <BookOpenTextIcon className='h-4 w-4' />
              Palabras ICA creadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {analytics.summary.totalLexicards}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ActivityIcon className='h-4 w-4' />
              Reviews totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {analytics.summary.totalReviews}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <MessageSquareQuoteIcon className='h-4 w-4' />
              Frases generadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-3xl font-semibold'>
              {analytics.summary.totalPhrases}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='mt-4 grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldCheckIcon className='h-4 w-4' />
              Actividad de hoy
            </CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-3 gap-4 text-sm'>
            <div>
              <p className='text-muted-foreground'>Usuarios activos</p>
              <p className='text-xl font-semibold'>
                {analytics.summary.activeUsersToday}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground'>Palabras añadidas</p>
              <p className='text-xl font-semibold'>
                {analytics.summary.wordsAddedToday}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground'>Reviews realizadas</p>
              <p className='text-xl font-semibold'>
                {analytics.summary.reviewsToday}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Altas en los últimos 14 días</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {analytics.dailySignups.map((item: AdminAnalyticsDailySignup) => {
              const width = Math.max(
                0,
                Math.round((item.count / signupMaxCount) * 100),
              )

              return (
                <div
                  key={item.day}
                  className='grid grid-cols-[4rem_1fr_2.5rem] items-center gap-2 text-xs'
                >
                  <span className='text-muted-foreground'>
                    {formatDayLabel(item.day)}
                  </span>
                  <div className='h-2.5 rounded-full bg-muted'>
                    <div
                      className='h-2.5 rounded-full bg-primary'
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className='text-right font-medium'>{item.count}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>Últimos usuarios registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-120 text-left text-sm'>
              <thead>
                <tr className='border-b text-muted-foreground'>
                  <th className='pb-2 font-medium'>Usuario</th>
                  <th className='pb-2 font-medium'>ID</th>
                  <th className='pb-2 font-medium'>Registro</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentUsers.map((user) => (
                  <tr key={user.userId} className='border-b last:border-b-0'>
                    <td className='py-2'>{user.displayName || 'Sin nombre'}</td>
                    <td className='py-2 font-mono text-xs text-muted-foreground'>
                      {user.userId}
                    </td>
                    <td className='py-2'>{formatDateTime(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
