import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import type { AchievementCategoryDef, AchievementProgress } from './achievements'
import { useFeaturedBadge } from './featuredBadge'
import { Medal } from './Medal'
import { medalText, tierName, type MedalTier } from './medals'
import { SpinningMedal } from './SpinningMedal'
import { t } from '@/i18n'

export type MedalSelection = { def: AchievementCategoryDef; tier: MedalTier } | null

/**
 * Ventana de una insignia: la medalla en grande, qué significa, cómo se consigue
 * y, si ya es tuya, la opción de mostrarla junto a tu nombre.
 */
export function MedalDetailDialog({
  selection,
  progress,
  onClose,
}: {
  selection: MedalSelection
  progress: AchievementProgress | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const { badge, choose } = useFeaturedBadge(user?.id)
  const [tier, setTier] = useState<MedalTier | null>(selection?.tier ?? null)

  useEffect(() => {
    setTier(selection?.tier ?? null)
  }, [selection])

  if (!selection || !tier) {
    return <Dialog open={false} />
  }

  const { def } = selection
  const levelIndex = Math.max(0, def.levels.findIndex((item) => item.tier === tier))
  const level = def.levels[levelIndex]
  const earned = (progress?.earned ?? 0) > levelIndex
  const isFeatured = badge?.category === def.key && badge?.tier === tier

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='items-center text-center'>
          <DialogTitle className='font-display font-extrabold tracking-tight text-2xl'>
            {t(def.title)} · {tierName(tier)}
          </DialogTitle>
          <DialogDescription className='text-sm font-semibold'>{medalText(level.caption)}</DialogDescription>
        </DialogHeader>

        {/* Al abrirla, al cambiar de rango y al tocarla, da una vuelta con su whoosh
            (las que aún no tienes suenan más bajo). */}
        <div className='mx-auto w-44'>
          <SpinningMedal tier={tier} locked={!earned} spinKey={tier} enter>
            <Medal
              category={def.key}
              tier={tier}
              ribbon={level.ribbon}
              label={`${t(def.title)} · ${tierName(tier)}`}
              earned={earned}
              className='w-full'
            />
          </SpinningMedal>
        </div>

        <p
          className={cn(
            'text-center text-sm font-extrabold',
            earned ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          {earned ? t('¡Conseguida!') : t('Aún no la tienes')}
        </p>

        <div className='rounded-2xl bg-muted/60 p-3 text-sm'>
          <p className='m-0 font-bold'>{t('Qué significa')}</p>
          <p className='m-0 mt-0.5 text-muted-foreground'>{t(def.description)}</p>
          <p className='m-0 mt-2 font-bold'>{t('Cómo se consigue')}</p>
          <p className='m-0 mt-0.5 text-muted-foreground'>
            {tierName(tier)}: {medalText(level.caption)}.
            {progress ? ` ${progress.progressLabel}.` : ''}
          </p>
        </div>

        <div className='grid grid-cols-5 gap-1.5' role='group' aria-label={t('Rangos de esta insignia')}>
          {def.levels.map((item, index) => (
            <button
              key={item.tier}
              type='button'
              onClick={() => setTier(item.tier)}
              className={cn(
                'w-full rounded-xl border-2 p-0.5 transition-colors',
                item.tier === tier ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
              )}
              aria-label={`${tierName(item.tier)}: ${medalText(item.caption)}`}
              aria-pressed={item.tier === tier}
            >
              <Medal
                category={def.key}
                tier={item.tier}
                ribbon={item.ribbon}
                label={`${t(def.title)} · ${tierName(item.tier)}`}
                earned={(progress?.earned ?? 0) > index}
                className='w-full'
              />
            </button>
          ))}
        </div>

        {earned ? (
          isFeatured ? (
            <div className='flex flex-col gap-2'>
              <p className='m-0 text-center text-xs font-semibold text-muted-foreground'>
                {t('Es tu insignia destacada: sale junto a tu nombre en el perfil y en el ranking.')}
              </p>
              <Button type='button' variant='outline' onClick={() => choose(null)}>
                {t('Quitar de mi nombre')}
              </Button>
            </div>
          ) : (
            <Button type='button' onClick={() => choose({ category: def.key, tier })}>
              {t('Mostrar junto a mi nombre')}
            </Button>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
