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
import { medalText, tierName, type MedalCategory } from './medals'
import { gameSfx } from './sfx'
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

export function NewBadgeCelebration() {
  const { user } = useAuth()
  const dashboard = useDashboardContext()
  const { byCategory, loading } = useAchievements()
  const navigate = useNavigate()
  const [queue, setQueue] = useState<Celebration[]>([])
  const confettiDone = useRef<string | null>(null)

  const earnedNow = useMemo(() => {
    const out: Seen = {}
    for (const def of ACHIEVEMENT_CATALOG) out[def.key] = byCategory[def.key].earned
    return out
  }, [byCategory])

  useEffect(() => {
    if (!user?.id || loading || dashboard.loading) return
    const seen = readSeen(user.id)
    if (!seen) {
      writeSeen(user.id, earnedNow)
      return
    }
    const fresh: Celebration[] = []
    const next: Seen = { ...seen }
    for (const def of ACHIEVEMENT_CATALOG) {
      const now = earnedNow[def.key] ?? 0
      const before = seen[def.key] ?? 0
      if (now > before) fresh.push({ def, index: now - 1 })
      next[def.key] = Math.max(now, before)
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
