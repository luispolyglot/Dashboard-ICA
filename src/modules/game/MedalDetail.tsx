import { useEffect, useState } from 'react'
import { CheckIcon } from 'lucide-react'
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
import { goalText, unlockHint, type AchievementCategoryDef, type AchievementProgress } from './achievements'
import { useFeaturedBadge } from './featuredBadge'
import { PROFILE_BADGES_MAX, useMyProfileBadges } from './profileBadges'
import { Medal } from './Medal'
import { isLegend, medalText, tierName, type MedalTier } from './medals'
import { SpinningMedal } from './SpinningMedal'
import { t } from '@/i18n'

export type MedalSelection = { def: AchievementCategoryDef; tier: MedalTier } | null

/**
 * Ventana de una insignia: la medalla en grande (gira con su sonido; la Leyenda pone sus
 * estrellas una a una), si ya es tuya o la barra de lo que te falta, los 6 niveles para
 * cambiar de uno a otro y, si es tuya, la opción de mostrarla junto a tu nombre.
 * Sin repetir qué significa: eso ya sale en la página de Insignias.
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
  const profileBadges = useMyProfileBadges(user?.id)
  const [tier, setTier] = useState<MedalTier | null>(selection?.tier ?? null)

  useEffect(() => {
    setTier(selection?.tier ?? null)
  }, [selection])

  if (!selection || !tier) {
    return <Dialog open={false} />
  }

  const { def } = selection
  const earnedCount = progress?.earned ?? 0
  const levelIndex = Math.max(0, def.levels.findIndex((item) => item.tier === tier))
  const level = def.levels[levelIndex]
  const earned = earnedCount > levelIndex
  const goal = progress?.goals[levelIndex] ?? null
  const isFeatured = badge?.category === def.key && badge?.tier === tier
  const inProfile = profileBadges.includes({ category: def.key, tier })
  const legends = def.levels.slice(5)
  const legendEarned = Math.max(0, earnedCount - 5)
  // Hueco de la Leyenda en la fila de abajo: la elegida o, si no, la Leyenda I (la que va
  // después del diamante). La II y la III se eligen en las casillas I · II · III.
  const legendSlot = isLegend(tier) ? level : legends[0]

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='items-center text-center'>
          <DialogTitle className='font-display font-extrabold tracking-tight text-2xl'>
            {t(def.title)} · {tierName(tier)}
          </DialogTitle>
          <DialogDescription className='text-sm font-semibold'>{medalText(level.caption)}</DialogDescription>
        </DialogHeader>

        {/* Al abrirla, al cambiar de nivel y al tocarla, da una vuelta con su sonido. */}
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

        {earned ? (
          <div className='flex justify-center'>
            <span
              className='inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-black'
              style={{
                background: 'linear-gradient(180deg, #ffe08a, var(--ica-gold))',
                color: '#5a3a00',
                boxShadow: '0 3px 0 var(--ica-gold-edge)',
              }}
            >
              <CheckIcon className='size-4' strokeWidth={3.2} aria-hidden='true' />
              {t('¡Conseguida!')}
            </span>
          </div>
        ) : (
          <GoalBar
            label={goal ? goalText(def, levelIndex, goal) : t('Calculando…')}
            hint={goal ? unlockHint(def, levelIndex, goal) : null}
            have={goal?.have ?? 0}
            need={goal?.need ?? 1}
          />
        )}

        <div className='grid grid-cols-6 gap-1.5' role='group' aria-label={t('Niveles de esta insignia')}>
          {[...def.levels.slice(0, 5), legendSlot].map((item) => {
            const index = def.levels.indexOf(item)
            const selected = isLegend(item.tier) ? isLegend(tier) : item.tier === tier
            return (
              <button
                key={isLegend(item.tier) ? 'leyenda' : item.tier}
                type='button'
                onClick={() => setTier(item.tier)}
                className={cn(
                  'w-full rounded-xl border-2 p-0.5 transition-colors',
                  selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
                )}
                aria-label={isLegend(item.tier) ? t('Leyenda') : tierName(item.tier)}
                aria-pressed={selected}
              >
                <Medal
                  category={def.key}
                  tier={item.tier}
                  ribbon={item.ribbon}
                  label={`${t(def.title)} · ${tierName(item.tier)}`}
                  earned={earnedCount > index}
                  className='w-full'
                />
              </button>
            )
          })}
        </div>

        {isLegend(tier) ? (
          <LegendPips
            earned={legendEarned}
            selected={levelIndex - 5}
            onSelect={(index) => setTier(legends[index].tier)}
          />
        ) : null}

        {earned ? (
          <div className='flex flex-col gap-2'>
            {isFeatured ? (
              <>
                <p className='m-0 text-center text-xs font-semibold text-muted-foreground'>
                  {t('Es tu insignia destacada: sale junto a tu nombre en el perfil y en el ranking.')}
                </p>
                <Button type='button' variant='outline' onClick={() => choose(null)}>
                  {t('Quitar de mi nombre')}
                </Button>
              </>
            ) : (
              <Button type='button' onClick={() => choose({ category: def.key, tier })}>
                {t('Mostrar junto a mi nombre')}
              </Button>
            )}
            {/* Up to 3 badges that other students see when they open your profile. */}
            <Button
              type='button'
              variant='outline'
              onClick={() => void profileBadges.toggle({ category: def.key, tier })}
              aria-pressed={inProfile}
            >
              {inProfile
                ? t('Quitar de mi perfil')
                : t('Mostrar en mi perfil ({n} de {max})', { n: profileBadges.badges.length, max: PROFILE_BADGES_MAX })}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Barra de avance (como Duolingo): lo que llevas hacia una insignia que aún no tienes y, debajo, qué hacer. */
function GoalBar({ label, hint, have, need }: { label: string; hint: string | null; have: number; need: number }) {
  const ratio = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0
  return (
    <div className='rounded-2xl bg-muted/60 p-3'>
      <p className='m-0 text-center text-sm font-extrabold tabular-nums'>{label}</p>
      <div
        className='mt-2 h-3 overflow-hidden rounded-full bg-background'
        role='progressbar'
        aria-valuemin={0}
        aria-valuemax={need}
        aria-valuenow={Math.min(have, need)}
      >
        <div
          className='h-full rounded-full'
          style={{ width: `${Math.round(ratio * 100)}%`, background: 'linear-gradient(90deg, var(--ica-fire), var(--ica-gold))' }}
        />
      </div>
      {hint ? <p className='m-0 mt-2 text-center text-xs font-semibold text-muted-foreground'>{hint}</p> : null}
    </div>
  )
}

/** Las tres casillas I · II · III de la Leyenda: se ponen doradas al conseguir cada una. */
export function LegendPips({
  earned,
  selected,
  onSelect,
}: {
  earned: number
  selected?: number
  onSelect?: (index: number) => void
}) {
  return (
    <span className='mt-0.5 flex items-center justify-center gap-1'>
      {['I', 'II', 'III'].map((roman, index) => {
        const on = index < earned
        const className = `flex h-[18px] min-w-[22px] items-center justify-center rounded-md px-1 text-[10px] leading-none font-black ${
          on ? 'bg-[var(--ica-gold)] text-[#5a3a00]' : 'bg-muted text-muted-foreground'
        } ${selected === index ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`
        return onSelect ? (
          <button
            key={roman}
            type='button'
            onClick={() => onSelect(index)}
            className={className}
            aria-label={`${t('Leyenda')} ${roman}`}
            aria-pressed={selected === index}
          >
            {roman}
          </button>
        ) : (
          <span key={roman} className={className}>
            {roman}
          </span>
        )
      })}
    </span>
  )
}
