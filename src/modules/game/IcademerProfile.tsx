import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobeIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/auth/AuthContext'
import { langName, t } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { prefetchIcaChallengesOverview } from '../hooks/useIcaChallengesOverview'
import {
  fetchIcademerPublicProfile,
  listAvailableIcaChallengeUsers,
  translateChallengeMessage,
} from '../services/icaChallenges'
import { ICA_CHALLENGES_LOCAL } from '../services/icaChallengesLocal'
import { useFeatureFlagsStore } from '../stores/featureFlagsStore'
import {
  ACHIEVEMENT_CATALOG,
  earnedLevelsFrom,
  fetchRankingHistoryFor,
  useAchievements,
} from './achievements'
import type { FeaturedBadge } from './featuredBadge'
import { SwordsIcon } from './icons'
import type { MedalCategory } from './medals'
import { FeaturedBadgeMini, UserInitial } from './ranking'

/** Lo mínimo que ya sabemos por el ranking (se enseña al momento, antes de cargar el resto). */
export type IcademerSummary = {
  userId: string
  name: string
  badge?: FeaturedBadge | null
}

type ChallengeState =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'can' }
  | { kind: 'blocked'; reason: string | null }

type LoadedProfile = {
  name: string | null
  targetLang: string | null
  level: string | null
  /** Rangos conseguidos por categoría (null mientras carga). */
  earned: Record<MedalCategory, number> | null
  challenge: ChallengeState
}

const EMPTY: LoadedProfile = { name: null, targetLang: null, level: null, earned: null, challenge: { kind: 'loading' } }

const CANT_NOW = 'Ahora mismo no se puede desafiar a este icademer.'

/**
 * Carga el perfil de un icademer: primero lo que da el servidor (idioma, nivel, insignias y
 * si se le puede retar). Si la función del servidor aún no tiene esa acción, se enseña lo que
 * se puede saber desde la app (insignias de ranking y su fila en Desafíos ICA).
 */
function useIcademerProfile(summary: IcademerSummary | null, isMe: boolean): LoadedProfile {
  const { config } = useDashboardContext()
  const challengesFlag = useFeatureFlagsStore((state) => Boolean(state.flags['ica-challenges']))
  const challengesOn = challengesFlag || ICA_CHALLENGES_LOCAL
  const [state, setState] = useState<LoadedProfile>(EMPTY)
  const userId = summary?.userId ?? null

  useEffect(() => {
    if (!userId) return
    let active = true
    setState(EMPTY)
    void (async () => {
      const [serverResult, rankingResult] = await Promise.allSettled([
        fetchIcademerPublicProfile(userId),
        fetchRankingHistoryFor(userId),
      ])
      if (!active) return
      const ranking = rankingResult.status === 'fulfilled' ? rankingResult.value : { rankings: null, bestEfficacy: null }

      if (serverResult.status === 'fulfilled') {
        const { profile, stats, challenge } = serverResult.value
        setState({
          name: profile.displayName,
          targetLang: profile.targetLang,
          level: profile.level,
          earned: earnedLevelsFrom({
            rachaICA: stats.icaStreakBest,
            rachaFlash: stats.flashStreakBest,
            vocab: stats.vocab,
            desafios: stats.wins,
            eficacia: ranking.bestEfficacy,
            rankings: ranking.rankings,
          }),
          challenge:
            isMe || profile.isMe || !challengesOn
              ? { kind: 'hidden' }
              : challenge.canChallenge
                ? { kind: 'can' }
                : { kind: 'blocked', reason: challenge.blockedReason },
        })
        return
      }

      // Sin la acción del servidor: insignias de ranking y lo que diga la lista de Desafíos ICA.
      const earned = earnedLevelsFrom({
        rachaICA: null,
        rachaFlash: null,
        vocab: null,
        desafios: null,
        eficacia: ranking.bestEfficacy,
        rankings: ranking.rankings,
      })
      let challengeState: ChallengeState = { kind: 'hidden' }
      let targetLang: string | null = null
      let level: string | null = null
      if (!isMe && challengesOn && config?.targetLang && config.nativeLang) {
        try {
          const list = await listAvailableIcaChallengeUsers({
            targetLang: config.targetLang,
            nativeLang: config.nativeLang,
            scope: 'global',
          })
          const row = list.rows.find((item) => item.userId === userId)
          if (row) {
            targetLang = row.targetLang
            level = row.level
            challengeState =
              row.canChallenge || row.blockedReason === 'Tu máximo de desafíos activos es 3.'
                ? { kind: 'can' }
                : { kind: 'blocked', reason: row.blockedReason }
          } else {
            challengeState = { kind: 'blocked', reason: null }
          }
        } catch {
          challengeState = { kind: 'blocked', reason: null }
        }
      }
      if (!active) return
      setState({ name: null, targetLang, level, earned, challenge: challengeState })
    })()
    return () => {
      active = false
    }
  }, [userId, isMe, challengesOn, config?.targetLang, config?.nativeLang])

  return state
}

/**
 * Perfil de un icademer en una ventana (sin salir del ranking): nombre, idioma que aprende,
 * nivel, sus insignias y el botón para desafiarle (o por qué ahora no se puede).
 */
export function IcademerProfileDialog({
  summary,
  onClose,
}: {
  summary: IcademerSummary | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { config } = useDashboardContext()
  const isMe = Boolean(summary && user?.id === summary.userId)
  const loaded = useIcademerProfile(summary, isMe)
  const [challengePending, setChallengePending] = useState(false)
  useEffect(() => {
    setChallengePending(false)
  }, [summary?.userId])
  // Tus propias insignias salen de tus datos (igual que en tu perfil).
  const mine = useAchievements()

  const earned = useMemo<Record<MedalCategory, number> | null>(() => {
    if (!isMe) return loaded.earned
    if (mine.loading) return loaded.earned
    const out = {} as Record<MedalCategory, number>
    for (const def of ACHIEVEMENT_CATALOG) out[def.key] = mine.byCategory[def.key]?.earned ?? 0
    return out
  }, [isMe, loaded.earned, mine])

  if (!summary) return <Dialog open={false} />

  const name = loaded.name || summary.name
  const firstName = name.trim().split(/\s+/)[0] || name
  const targetLang = isMe ? loaded.targetLang || config?.targetLang || null : loaded.targetLang
  const level = loaded.level
  const totalEarned = earned ? Object.values(earned).reduce((sum, value) => sum + value, 0) : 0
  const totalPossible = ACHIEVEMENT_CATALOG.reduce((sum, def) => sum + def.levels.length, 0)
  const topBadges = earned
    ? ACHIEVEMENT_CATALOG.filter((def) => earned[def.key] > 0).map((def) => ({
        def,
        badge: { category: def.key, tier: def.levels[earned[def.key] - 1].tier } as FeaturedBadge,
      }))
    : []

  // «Desafiar»: el botón espera un momento (cargando) mientras se precargan los datos de
  // Desafíos, y luego se va directo a «Retar a …» con el modo para elegir. Como mucho 4 s.
  const challenge = async () => {
    if (challengePending) return
    setChallengePending(true)
    await Promise.race([
      prefetchIcaChallengesOverview(config?.targetLang, config?.nativeLang),
      new Promise((resolve) => window.setTimeout(resolve, 4000)),
    ])
    onClose()
    navigate(`${DASHBOARD_ROUTES.challengesIca}?retar=${encodeURIComponent(summary.userId)}`)
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className='sm:max-w-sm'>
        {/* Cabecera: inicial, nombre e insignia destacada */}
        <div className='flex flex-col items-center gap-2 pt-1 text-center'>
          <UserInitial name={name} size={76} />
          <div className='flex max-w-full items-center justify-center gap-1.5'>
            <DialogTitle className='truncate pr-0 text-2xl font-black tracking-tight'>
              {name}
              {isMe ? t(' (tú)') : ''}
            </DialogTitle>
            {summary.badge ? <FeaturedBadgeMini badge={summary.badge} size={34} /> : null}
          </div>
          <DialogDescription className='sr-only'>{t('Perfil de este icademer')}</DialogDescription>
          {targetLang || level ? (
            <div className='flex flex-wrap items-center justify-center gap-1.5'>
              {targetLang ? (
                <span
                  className='inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold'
                  style={{ background: 'var(--ica-i-soft)', color: 'var(--ica-i-ink)' }}
                >
                  <GlobeIcon className='size-3.5' strokeWidth={2.8} aria-hidden='true' />
                  {t('Aprende {lang}', { lang: langName(targetLang) })}
                </span>
              ) : null}
              {level ? (
                <span
                  className='inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold'
                  style={{ background: 'var(--ica-c-soft)', color: 'var(--ica-c-ink)' }}
                >
                  {t('Nivel {level}', { level })}
                </span>
              ) : null}
            </div>
          ) : loaded.challenge.kind === 'loading' && !isMe ? (
            <span className='h-6 w-40 animate-pulse rounded-full bg-muted' aria-hidden='true' />
          ) : null}
        </div>

        {/* Desafiar */}
        {loaded.challenge.kind === 'loading' && !isMe ? (
          <span className='h-12 w-full animate-pulse rounded-2xl bg-muted' aria-hidden='true' />
        ) : loaded.challenge.kind === 'can' ? (
          <Button
            type='button'
            className='h-12 gap-2 rounded-2xl text-base font-black'
            onClick={() => void challenge()}
            aria-busy={challengePending || undefined}
          >
            {challengePending ? <Loader2Icon className='size-5 animate-spin' aria-hidden='true' /> : <SwordsIcon size={22} />}
            {t('Desafiar a {name}', { name: firstName })}
          </Button>
        ) : loaded.challenge.kind === 'blocked' ? (
          <div className='flex items-center gap-3 rounded-2xl border-2 border-border px-3 py-2.5'>
            <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted opacity-60 grayscale'>
              <SwordsIcon size={22} />
            </span>
            <span className='min-w-0'>
              <span className='block text-sm font-extrabold'>{t('No se puede desafiar a este icademer')}</span>
              <span className='block text-xs font-semibold text-muted-foreground'>
                {translateChallengeMessage(loaded.challenge.reason || CANT_NOW)}
              </span>
            </span>
          </div>
        ) : null}

        {/* Insignias */}
        <div>
          <div className='mb-2 flex items-baseline justify-between gap-2'>
            <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Insignias')}</p>
            {earned ? (
              <span className='text-xs font-extrabold text-muted-foreground tabular-nums'>
                {t('{n} de {total}', { n: totalEarned, total: totalPossible })}
              </span>
            ) : null}
          </div>
          {earned === null ? (
            <div className='grid grid-cols-3 gap-2' aria-hidden='true'>
              {Array.from({ length: 3 }, (_, index) => (
                <span key={index} className='h-24 animate-pulse rounded-2xl bg-muted' />
              ))}
            </div>
          ) : topBadges.length === 0 ? (
            <p className='m-0 rounded-2xl bg-muted/60 px-3 py-3 text-center text-sm font-semibold text-muted-foreground'>
              {isMe ? t('Aún no tienes insignias.') : t('Aún no tiene insignias.')}
            </p>
          ) : (
            <div className='grid grid-cols-3 gap-2'>
              {topBadges.map(({ def, badge }) => (
                <div key={def.key} className='flex flex-col items-center gap-1 rounded-2xl bg-muted/50 px-1 pt-2 pb-2 text-center'>
                  <FeaturedBadgeMini badge={badge} size={54} />
                  <span className='line-clamp-2 text-[11px] leading-tight font-extrabold'>{t(def.title)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
