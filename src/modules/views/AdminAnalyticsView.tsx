import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ActivityIcon,
  BarChart3Icon,
  BookOpenTextIcon,
  MessageSquareQuoteIcon,
  MicIcon,
  RefreshCwIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'
import {
  AnalyticsRequestError,
  fetchAdminAnalytics,
  type AdminAnalyticsPayload,
} from '../services/adminAnalytics'
import { peekQuick, quickFetch } from '../services/quickCache'
import { IconTile, PageTitle, Panel, RowGroup, SectionLabel, tone, type Tone } from '../game/ui'
import { formatDateTime } from '../utils'
import { VoiceUsagePanel } from '../components/VoiceUsagePanel'


function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`)
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
}

const numberFormat = new Intl.NumberFormat('es-ES')

function TotalTile({ icon: Icon, label, value, tone: t }: { icon: LucideIcon; label: string; value: number; tone: Tone }) {
  const colors = tone(t)
  return (
    <div className='ica-panel flex min-w-0 flex-col gap-2 p-4'>
      <IconTile tone={t} size={40}>
        <Icon className='size-5' strokeWidth={2.5} />
      </IconTile>
      <p className='m-0 text-[26px] leading-none font-black tabular-nums' style={{ color: colors.ink }}>
        {numberFormat.format(value)}
      </p>
      <p className='m-0 text-xs font-bold text-muted-foreground'>{label}</p>
    </div>
  )
}

function TodayTile({ label, value, tone: t }: { label: string; value: number; tone: Tone }) {
  const colors = tone(t)
  return (
    <div className='rounded-2xl px-3 py-3' style={{ background: colors.soft }}>
      <p className='m-0 text-2xl leading-none font-black tabular-nums' style={{ color: colors.ink }}>
        {numberFormat.format(value)}
      </p>
      <p className='m-0 mt-1 text-xs font-bold' style={{ color: colors.ink }}>
        {label}
      </p>
    </div>
  )
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 2) || '?'
  )
}

/** ANALÍTICAS ADMIN: totales, actividad de hoy, altas de los últimos días y últimos registros. */
export function AdminAnalyticsView() {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  // Guardado por usuario: así nadie más en este navegador ve los datos de admin.
  const CACHE_KEY = `admin-analytics:${authUser?.id ?? 'anon'}`
  // Lo último que se cargó sale al momento; los datos nuevos llegan por detrás.
  const [analytics, setAnalytics] = useState<AdminAnalyticsPayload | null>(() => peekQuick<AdminAnalyticsPayload>(CACHE_KEY) ?? null)
  const [loading, setLoading] = useState(() => peekQuick(CACHE_KEY) === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let isMounted = true
    setRefreshing(true)
    setError(null)
    quickFetch(CACHE_KEY, fetchAdminAnalytics, { maxAgeMs: tick === 0 ? 20_000 : 0 })
      .then((result) => {
        if (isMounted) setAnalytics(result)
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        if (err instanceof AnalyticsRequestError && err.status === 403) {
          navigate('/', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'No se pudo cargar el panel de analíticas.')
      })
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, tick, CACHE_KEY])

  const signupMax = useMemo(() => {
    const counts = analytics?.dailySignups.map((item) => item.count) || []
    return counts.length ? Math.max(...counts, 1) : 1
  }, [analytics?.dailySignups])
  const signupTotal = useMemo(
    () => (analytics?.dailySignups || []).reduce((sum, item) => sum + item.count, 0),
    [analytics?.dailySignups],
  )

  return (
    <section className='mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-2 pb-8 lg:py-8'>
      <PageTitle
        icon={
          <IconTile tone='i' size={48}>
            <BarChart3Icon className='size-6' strokeWidth={2.4} />
          </IconTile>
        }
        subtitle='Cómo se está usando la app, en números.'
        right={
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='rounded-2xl'
            onClick={() => setTick((value) => value + 1)}
            disabled={refreshing}
            aria-label='Actualizar'
          >
            <RefreshCwIcon className={refreshing ? 'size-5 animate-spin' : 'size-5'} strokeWidth={2.6} />
          </Button>
        }
      >
        Analíticas
      </PageTitle>

      {error ? (
        <Panel tone='bad' className='text-sm font-bold'>
          {error}
        </Panel>
      ) : null}

      {loading && !analytics ? (
        <div className='grid grid-cols-2 gap-3 md:grid-cols-5' aria-hidden='true'>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className='h-32 animate-pulse rounded-3xl bg-muted' />
          ))}
        </div>
      ) : null}

      {analytics ? (
        <>
          <div>
            <SectionLabel>En total</SectionLabel>
            <div className='grid grid-cols-2 gap-3 md:grid-cols-5'>
              <TotalTile icon={UsersIcon} tone='primary' label='Usuarios registrados' value={analytics.summary.totalUsers} />
              <TotalTile icon={BookOpenTextIcon} tone='i' label='Palabras ICA' value={analytics.summary.totalLexicards} />
              <TotalTile icon={MessageSquareQuoteIcon} tone='c' label='Frases creadas' value={analytics.summary.totalPhrases} />
              <TotalTile icon={MicIcon} tone='a' label='Notas de voz' value={analytics.summary.totalVoiceActivations} />
              <TotalTile icon={ActivityIcon} tone='gold' label='Flashcards' value={analytics.summary.totalReviews} />
            </div>
          </div>

          <VoiceUsagePanel />

          <div className='grid gap-6 lg:grid-cols-2'>
            <div>
              <SectionLabel>Hoy</SectionLabel>
              <Panel>
                <div className='grid grid-cols-2 gap-2'>
                  <TodayTile tone='ok' label='Usuarios activos' value={analytics.summary.activeUsersToday} />
                  <TodayTile tone='i' label='Palabras añadidas' value={analytics.summary.wordsAddedToday} />
                  <TodayTile tone='gold' label='Flashcards hechas' value={analytics.summary.reviewsToday} />
                  <TodayTile tone='a' label='Notas de voz' value={analytics.summary.voiceActivationsToday} />
                </div>
              </Panel>
            </div>

            <div>
              <SectionLabel
                right={<span className='text-xs font-extrabold text-muted-foreground'>{numberFormat.format(signupTotal)} en total</span>}
              >
                Altas en los últimos 14 días
              </SectionLabel>
              <Panel>
                <div className='flex h-40 items-end gap-1.5'>
                  {analytics.dailySignups.map((item) => {
                    const height = Math.max(4, Math.round((item.count / signupMax) * 100))
                    return (
                      <div key={item.day} className='flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1'>
                        <span className='text-[10px] font-black text-muted-foreground tabular-nums'>{item.count || ''}</span>
                        <div
                          className='w-full rounded-t-lg rounded-b-sm'
                          style={{
                            height: `${height}%`,
                            background: item.count > 0 ? 'var(--primary)' : 'var(--muted)',
                            boxShadow: item.count > 0 ? '0 3px 0 var(--primary-edge)' : undefined,
                          }}
                          title={`${formatDayLabel(item.day)}: ${item.count}`}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className='mt-2 flex justify-between text-[11px] font-bold text-muted-foreground'>
                  <span>{analytics.dailySignups[0] ? formatDayLabel(analytics.dailySignups[0].day) : ''}</span>
                  <span>
                    {analytics.dailySignups.length
                      ? formatDayLabel(analytics.dailySignups[analytics.dailySignups.length - 1].day)
                      : ''}
                  </span>
                </div>
              </Panel>
            </div>
          </div>

          <div>
            <SectionLabel>Últimos registros</SectionLabel>
            <RowGroup>
              {analytics.recentUsers.map((user) => {
                const name = user.displayName || 'Sin nombre'
                return (
                  <div key={user.userId} className='flex items-center gap-3 py-3'>
                    <span className='flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-muted text-xs font-black'>
                      {initials(name)}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate font-extrabold'>{name}</span>
                      <span className='block truncate font-mono text-[11px] text-muted-foreground'>{user.userId}</span>
                    </span>
                    <span className='flex shrink-0 items-center gap-1.5 text-xs font-bold text-muted-foreground'>
                      <UserPlusIcon className='size-4' strokeWidth={2.4} aria-hidden='true' />
                      {formatDateTime(user.createdAt)}
                    </span>
                  </div>
                )
              })}
              {analytics.recentUsers.length === 0 ? (
                <p className='m-0 py-4 text-sm font-semibold text-muted-foreground'>Todavía no hay registros.</p>
              ) : null}
            </RowGroup>
          </div>
        </>
      ) : null}
    </section>
  )
}
