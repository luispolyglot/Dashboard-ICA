import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { getMetaTrackerLevelColor } from '../components/MetaTracker/colors'
import { LevelDialog } from './LevelStrip'
import { computeLevelPosition, getLevelThresholds } from '../components/MetaTracker/leveling'
import { getMetaTrackerSnapshot } from '../components/MetaTracker/progress'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { ACHIEVEMENT_CATALOG, longestStreak, useAchievements } from './achievements'
import { FlameIcon } from './icons'
import { getIcaStreakState } from './streak'
import { GameProgress, Pill } from './ui'
import { useFeaturedBadge } from './featuredBadge'
import { FeaturedBadgeMini, FlagInitial } from './ranking'
import { useMyFlags } from './languageFlag'
import { Medal, MedalDefs } from './Medal'
import { MedalDetailDialog, type MedalSelection } from './MedalDetail'
import { tierName } from './medals'
import { getUiLang, langName, t, tn, uiLocale } from '@/i18n'

/** "En ICADEMY desde marzo de 2026" (fecha de alta de la cuenta). */
export function memberSinceLabel(createdAt?: string | null): string | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  const memberSinceFormatter = new Intl.DateTimeFormat(uiLocale(), { month: 'long', year: 'numeric' })
  return t('En ICADEMY desde {date}', { date: memberSinceFormatter.format(date) })
}

/** Tu insignia destacada (la que elegiste), en pequeño junto a tu nombre. */
export function MyFeaturedBadge({ size = 30 }: { size?: number }) {
  const { user } = useAuth()
  const { badge } = useFeaturedBadge(user?.id)
  if (!badge) return null
  return <FeaturedBadgeMini badge={badge} size={size} />
}

/** Avatar con el anillo del color de tu nivel real (el de la barra de progreso). */
export function LevelAvatar({ size = 64 }: { size?: number }) {
  const { user } = useAuth()
  const { config, metaTrackerProfile } = useDashboardContext()
  const metadata = user?.user_metadata ?? {}
  const displayName: string = metadata.display_name || user?.email?.split('@')[0] || t('Usuario')
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'
  const snapshot =
    config && metaTrackerProfile?.confirmedAt
      ? getMetaTrackerSnapshot(metaTrackerProfile, config.targetLang)
      : null
  const levelColor = snapshot ? getMetaTrackerLevelColor(snapshot.currentLevelKey) : 'var(--border-strong)'
  const { shown: flag } = useMyFlags(user?.id)

  return (
    <span className='relative inline-flex shrink-0' style={{ width: size, height: size + 8 }}>
      {flag ? (
        <FlagInitial initial={initial} flag={flag} size={size} ring={levelColor} />
      ) : (
      <span
        className='flex items-center justify-center rounded-full font-extrabold'
        style={{
          width: size,
          height: size,
          border: `4px solid ${levelColor}`,
          background: 'var(--accent)',
          color: 'var(--foreground)',
          fontSize: Math.round(size * 0.42),
        }}
      >
        {initial}
      </span>
      )}
      {snapshot ? (
        <span
          className='absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-background px-2 text-[11px] leading-5 font-extrabold text-white'
          style={{ bottom: 0, background: levelColor }}
        >
          {snapshot.currentLevelKey}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Resumen del alumno para el perfil (datos reales): su nivel real y sus insignias.
 * Las cifras (rachas, palabras, notas maestras) están en Estadísticas.
 * Al tocar una insignia se abre en grande con su explicación.
 */
export function ProfileGameSummary({ onNavigate }: { onNavigate?: () => void }) {
  const { config, metaTrackerProfile } = useDashboardContext()
  const { byCategory, totalEarned } = useAchievements()
  const [selection, setSelection] = useState<MedalSelection>(null)
  const [levelOpen, setLevelOpen] = useState(false)
  const snapshot =
    config && metaTrackerProfile?.confirmedAt
      ? getMetaTrackerSnapshot(metaTrackerProfile, config.targetLang)
      : null
  const levelColor = snapshot ? getMetaTrackerLevelColor(snapshot.currentLevelKey) : null
  const nextColor = snapshot
    ? snapshot.isNativePath
      ? '#A855F7'
      : getMetaTrackerLevelColor(snapshot.nextLevelKey)
    : null
  // Cuánto llevas del nivel actual al siguiente (para la barra)
  const levelProgress =
    snapshot && config
      ? computeLevelPosition(snapshot.totalWords, getLevelThresholds(config.targetLang)).pctWithin
      : 0
  const totalMedals = ACHIEVEMENT_CATALOG.reduce((sum, def) => sum + def.levels.length, 0)
  const languageName = config?.targetLang
    ? getUiLang() === 'en'
      ? langName(config.targetLang)
      : config.targetLang.toLowerCase()
    : ''

  return (
    <div className='flex flex-col gap-3'>
      <MedalDefs />
      {snapshot && levelColor ? (
        <button
          type='button'
          onClick={() => setLevelOpen(true)}
          className='ica-panel ica-press flex w-full items-center gap-3.5 px-4 py-3.5 text-left'
          aria-label={t('Tu nivel real en {lang}. Ver detalle', { lang: languageName })}
        >
          <span
            className='flex h-13 min-w-15 shrink-0 items-center justify-center rounded-2xl px-2 text-xl font-black text-white'
            style={{ background: levelColor, boxShadow: `0 4px 0 color-mix(in oklab, ${levelColor} 70%, black)` }}
          >
            {snapshot.currentLevelKey}
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block text-base leading-tight font-extrabold'>{t('Tu nivel real en {lang}', { lang: languageName })}</span>
            <span className='my-1.5 flex items-center gap-2'>
              <GameProgress value={levelProgress} color={levelColor} height={12} className='min-w-0 flex-1' />
              <span
                className='flex h-6 min-w-9 shrink-0 items-center justify-center rounded-lg border-2 px-1 text-[11px] font-extrabold'
                style={{ borderColor: nextColor ?? undefined, color: nextColor ?? undefined }}
              >
                {snapshot.isNativePath ? t('Nativo') : snapshot.nextLevelKey}
              </span>
            </span>
            <span className='block text-xs font-semibold text-muted-foreground'>
              {snapshot.wordsToNext !== null && !snapshot.isNativePath
                ? t('Te faltan {n} palabras activadas para {level}', {
                    n: snapshot.wordsToNext.toLocaleString(uiLocale()),
                    level: snapshot.nextLevelKey,
                  })
                : t('{n} palabras · camino a nivel nativo', {
                    n: snapshot.totalWords.toLocaleString(uiLocale()),
                  })}
            </span>
          </span>
          <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
        </button>
      ) : null}
      {config ? <LevelDialog config={config} open={levelOpen} onOpenChange={setLevelOpen} /> : null}

      <div className='ica-panel px-4 pt-3.5 pb-3'>
        <div className='mb-2.5 flex items-center justify-between gap-2'>
          <span className='flex min-w-0 items-center gap-2'>
            <span className='text-base font-extrabold'>{t('Insignias')}</span>
            <Pill tone='gold'>
              {t('{n} de {total}', { n: totalEarned, total: totalMedals })}
            </Pill>
          </span>
          <Link
            to={DASHBOARD_ROUTES.insignias}
            onClick={onNavigate}
            className='flex shrink-0 items-center gap-0.5 rounded-xl px-1.5 py-1 text-sm font-extrabold text-primary transition-colors hover:bg-muted'
          >
            {t('Ver todas')}
            <ChevronRightIcon className='size-4' strokeWidth={2.8} aria-hidden='true' />
          </Link>
        </div>
        <div className='grid grid-cols-6 gap-1'>
          {ACHIEVEMENT_CATALOG.map((def) => {
            const earned = byCategory[def.key].earned
            const level = def.levels[Math.max(0, earned - 1)]
            return (
              <button
                key={def.key}
                type='button'
                onClick={() => setSelection({ def, tier: level.tier })}
                className='w-full rounded-xl transition-transform active:scale-95'
                aria-label={t('{title}: ver qué significa', { title: t(def.title) })}
              >
                <Medal
                  category={def.key}
                  tier={level.tier}
                  ribbon={level.ribbon}
                  label={`${t(def.title)} · ${tierName(level.tier)}`}
                  earned={earned > 0}
                />
              </button>
            )
          })}
        </div>
        <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
          {t('Toca una insignia para ver qué significa. Puedes elegir una para que salga junto a tu nombre y tres para tu perfil.')}
        </p>
      </div>

      <MedalDetailDialog
        selection={selection}
        progress={selection ? byCategory[selection.def.key] : null}
        onClose={() => setSelection(null)}
      />
    </div>
  )
}

/** Tu racha ICA en grande (como en Rachas): la llama, los días y un toque para abrir Rachas. */
export function ProfileStreakPanel({ onNavigate }: { onNavigate?: () => void }) {
  const {
    dailyProgress,
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
  } = useDashboardContext()
  const streakState = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  })
  const best = Math.max(streakState.streak, longestStreak(creationDays, savedCreationDays))
  const lit = streakState.streak > 0

  return (
    <Link
      to={DASHBOARD_ROUTES.streaks}
      onClick={onNavigate}
      className='ica-panel ica-press flex items-center gap-4 px-4 py-3.5'
      style={{
        background: 'var(--ica-fire-soft)',
        borderColor: 'color-mix(in oklab, var(--ica-fire) 38%, transparent)',
        boxShadow: '0 4px 0 color-mix(in oklab, var(--ica-fire) 30%, transparent)',
      }}
    >
      <FlameIcon size={52} tone={lit ? 'fire' : 'off'} />
      <span className='min-w-0 flex-1'>
        <span className='flex items-baseline gap-1.5' style={{ color: 'var(--ica-fire-ink)' }}>
          <span className='text-4xl leading-none font-black tabular-nums'>{streakState.streak}</span>
          <span className='text-sm font-extrabold'>
            {tn(streakState.streak, t('día de racha ICA'), t('días de racha ICA'))}
          </span>
        </span>
        <span className='mt-1 block text-xs font-semibold text-muted-foreground'>
          {streakState.cycleDoneToday
            ? t('Hoy ya está hecho.')
            : streakState.frozenPending
              ? t('Racha congelada: completa hoy el ciclo.')
              : t('Completa hoy el ciclo para sumar.')}{' '}
          {t('Mejor racha: {n} días', { n: best })}
        </span>
      </span>
      <ChevronRightIcon className='size-5 shrink-0' strokeWidth={2.6} style={{ color: 'var(--ica-fire-ink)' }} aria-hidden='true' />
    </Link>
  )
}
