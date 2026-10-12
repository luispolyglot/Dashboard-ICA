import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/auth/AuthContext'
import { t } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { ACHIEVEMENT_CATALOG, useAchievements, type AchievementCategoryDef } from './achievements'
import { Medal } from './Medal'
import { isLegend, medalText, tierName, type MedalCategory } from './medals'
import { gameSfx, playBadgeSound, type BadgeSoundTier } from './sfx'
import { SpinningMedal } from './SpinningMedal'

// INSIGNIA NUEVA (Luis, 3 oct): al conseguir una, sale en grande girando con su sonido de siempre
// y, por detrás, confeti con un poco de sonido de confeti.
// Recuerda en este dispositivo qué insignias ya se celebraron. La primera vez solo las apunta
// (no celebra las que ya tenías). «v2»: con los umbrales nuevos y la Leyenda.

const SEEN_KEY = 'ica-badges-seen-v2'

type Seen = Partial<Record<MedalCategory, number>>

function readSeen(userId: string): Seen | null {
  try {
    const raw = window.localStorage.getItem(`${SEEN_KEY}:${userId}`)
    return raw ? (JSON.parse(raw) as Seen) : null
  } catch {
    return null
  }
}

function writeSeen(userId: string, seen: Seen): void {
  try {
    window.localStorage.setItem(`${SEEN_KEY}:${userId}`, JSON.stringify(seen))
  } catch {
    /* sin almacenamiento: no se celebra, no pasa nada */
  }
}

type Celebration = { def: AchievementCategoryDef; index: number }

/** First time on this device (Luis, 12 Oct, option D): one notice with all the badges so far. */
type Summary = { total: number; medals: Celebration[] }

const SUMMARY_MAX_MEDALS = 5

/**
 * Where each medal of the summary fan goes, best first (x = centre and w = width, out of a 300-wide
 * box; r = rotation; y = how far down). The best one is in the middle and the biggest.
 */
const FAN_LAYOUTS: Array<Array<{ x: number; w: number; r: number; y: number }>> = [
  [{ x: 150, w: 108, r: 0, y: 0 }],
  [
    { x: 107, w: 98, r: -12, y: 10 },
    { x: 193, w: 98, r: 12, y: 10 },
  ],
  [
    { x: 150, w: 108, r: 0, y: 0 },
    { x: 78, w: 88, r: -18, y: 22 },
    { x: 222, w: 88, r: 18, y: 22 },
  ],
  [
    { x: 110, w: 90, r: -9, y: 10 },
    { x: 190, w: 90, r: 9, y: 10 },
    { x: 56, w: 76, r: -22, y: 34 },
    { x: 244, w: 76, r: 22, y: 34 },
  ],
  [
    { x: 150, w: 108, r: 0, y: 0 },
    { x: 94, w: 84, r: -13, y: 14 },
    { x: 206, w: 84, r: 13, y: 14 },
    { x: 43, w: 74, r: -26, y: 40 },
    { x: 257, w: 74, r: 26, y: 40 },
  ],
]

export function NewBadgeCelebration() {
  const { user } = useAuth()
  const dashboard = useDashboardContext()
  const { byCategory, loading } = useAchievements()
  const navigate = useNavigate()
  const [queue, setQueue] = useState<Celebration[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const confettiDone = useRef<string | null>(null)

  // Only categories whose data actually loaded (Luis, 12 Oct): a query that failed must not be saved
  // as «0 earned», or the next good load would celebrate badges the student already had.
  const earnedNow = useMemo(() => {
    const out: Seen = {}
    for (const def of ACHIEVEMENT_CATALOG) {
      if (byCategory[def.key].current !== null) out[def.key] = byCategory[def.key].earned
    }
    return out
  }, [byCategory])

  useEffect(() => {
    if (!user?.id || loading || dashboard.loading) return
    const seen = readSeen(user.id)
    // First time on this device (or a category never recorded): the badges the student already has
    // are saved without celebrating, so someone with a long history does not get a dozen in a row.
    if (!seen) {
      writeSeen(user.id, earnedNow)
      // Instead of celebrating them one by one, a single summary: the best badge of each section.
      const total = Object.values(earnedNow).reduce((sum, value) => sum + (value ?? 0), 0)
      if (total > 0) {
        const medals = ACHIEVEMENT_CATALOG.filter((def) => (earnedNow[def.key] ?? 0) > 0)
          .map((def) => ({ def, index: (earnedNow[def.key] ?? 1) - 1 }))
          .sort((a, b) => b.index - a.index)
          .slice(0, SUMMARY_MAX_MEDALS)
        setSummary({ total, medals })
      }
      return
    }
    const fresh: Celebration[] = []
    const next: Seen = { ...seen }
    for (const def of ACHIEVEMENT_CATALOG) {
      const now = earnedNow[def.key]
      if (now === undefined) continue
      const before = seen[def.key]
      // Several tiers at once (e.g. 0 → diamond): only the highest one is celebrated.
      if (before !== undefined && now > before) fresh.push({ def, index: now - 1 })
      next[def.key] = Math.max(now, before ?? 0)
    }
    writeSeen(user.id, next)
    if (fresh.length > 0) setQueue((current) => [...current, ...fresh])
  }, [dashboard.loading, earnedNow, loading, user?.id])

  const current = queue[0] ?? null
  const level = current ? current.def.levels[current.index] : null
  const id = current && level ? `${current.def.key}:${level.tier}` : null

  useEffect(() => {
    if (!id || confettiDone.current === id) return
    confettiDone.current = id
    // Cuando la insignia ya ha dado su vuelta, confeti por detrás.
    const timer = window.setTimeout(() => {
      void confetti({ particleCount: 110, spread: 100, startVelocity: 34, ticks: 240, origin: { x: 0.5, y: 0.4 }, zIndex: 40 })
      gameSfx.confetti()
    }, 650)
    return () => window.clearTimeout(timer)
  }, [id])

  // The summary sounds like a new badge (the sound of its best one) with the same confetti.
  const summaryBest = summary?.medals[0] ?? null
  const summaryTier = summaryBest ? summaryBest.def.levels[summaryBest.index].tier : null
  useEffect(() => {
    if (!summaryTier) return
    const soundTier: BadgeSoundTier = isLegend(summaryTier) ? 'leyenda' : (summaryTier as BadgeSoundTier)
    const stopSound = playBadgeSound(soundTier)
    const timer = window.setTimeout(() => {
      void confetti({ particleCount: 110, spread: 100, startVelocity: 34, ticks: 240, origin: { x: 0.5, y: 0.4 }, zIndex: 40 })
      gameSfx.confetti()
    }, 650)
    return () => {
      window.clearTimeout(timer)
      stopSound()
    }
  }, [summaryTier])

  if (summary) {
    const layout = FAN_LAYOUTS[summary.medals.length - 1] ?? []
    const closeSummary = () => setSummary(null)
    return (
      <Dialog open onOpenChange={(open) => (open ? null : closeSummary())}>
        <DialogContent className='sm:max-w-sm'>
          <div className='ica-pop relative mx-auto mt-2 aspect-[300/140] w-full max-w-[300px]' aria-hidden='true'>
            {summary.medals.map((item, rank) => {
              const spot = layout[rank]
              const medalLevel = item.def.levels[item.index]
              if (!spot || !medalLevel) return null
              return (
                <div
                  key={item.def.key}
                  className='absolute'
                  style={{
                    left: `${((spot.x - spot.w / 2) / 300) * 100}%`,
                    width: `${(spot.w / 300) * 100}%`,
                    top: `${(spot.y / 140) * 100}%`,
                    transform: spot.r ? `rotate(${spot.r}deg)` : undefined,
                    zIndex: summary.medals.length - rank,
                  }}
                >
                  <Medal
                    category={item.def.key}
                    tier={medalLevel.tier}
                    ribbon={medalLevel.ribbon}
                    label={`${t(item.def.title)} · ${tierName(medalLevel.tier)}`}
                    earned
                    className='w-full'
                  />
                </div>
              )
            })}
          </div>
          <DialogHeader className='items-center text-center'>
            <DialogTitle className='font-display text-2xl font-extrabold tracking-tight'>
              {summary.total === 1 ? t('¡Ya tienes tu primera insignia!') : t('¡Ya tienes {n} insignias!', { n: summary.total })}
            </DialogTitle>
            <DialogDescription className='text-sm font-semibold'>
              {summary.total === 1 ? t('La primera de muchas.') : t('Acumuladas hasta ahora.')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-2'>
            <Button
              type='button'
              onClick={() => {
                closeSummary()
                navigate(DASHBOARD_ROUTES.insignias)
              }}
            >
              {t('Ver mis insignias')}
            </Button>
            <Button type='button' variant='outline' onClick={closeSummary}>
              {t('Seguir')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!current || !level) return null

  const close = () => setQueue((items) => items.slice(1))

  return (
    <Dialog open onOpenChange={(open) => (open ? null : close())}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader className='items-center text-center'>
          <DialogTitle className='font-display text-2xl font-extrabold tracking-tight'>{t('¡Insignia nueva!')}</DialogTitle>
          <DialogDescription className='text-sm font-semibold'>
            {t(current.def.title)} · {tierName(level.tier)} · {medalText(level.caption)}
          </DialogDescription>
        </DialogHeader>
        <div className='mx-auto w-48'>
          <SpinningMedal tier={level.tier} spinKey={id ?? undefined} enter>
            <Medal
              category={current.def.key}
              tier={level.tier}
              ribbon={level.ribbon}
              label={`${t(current.def.title)} · ${tierName(level.tier)}`}
              earned
              className='w-full'
            />
          </SpinningMedal>
        </div>
        <div className='flex flex-col gap-2'>
          <Button
            type='button'
            onClick={() => {
              close()
              navigate(DASHBOARD_ROUTES.insignias)
            }}
          >
            {t('Ver mis insignias')}
          </Button>
          <Button type='button' variant='outline' onClick={close}>
            {t('Seguir')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
