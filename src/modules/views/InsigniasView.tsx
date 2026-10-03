import { useState } from 'react'
import { ACHIEVEMENT_CATALOG, useAchievements } from '../game/achievements'
import { Medal, MedalDefs } from '../game/Medal'
import { MedalDetailDialog, type MedalSelection } from '../game/MedalDetail'
import { medalText, tierName } from '../game/medals'
import { t } from '@/i18n'

const TOTAL_MEDALS = ACHIEVEMENT_CATALOG.reduce((sum, def) => sum + def.levels.length, 0)

export function InsigniasView() {
  const { byCategory, totalEarned } = useAchievements()
  const [selection, setSelection] = useState<MedalSelection>(null)

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-4 pb-28 lg:py-10'>
      <MedalDefs />
      <div>
        <h1 className='m-0 font-display tracking-tight text-2xl leading-tight font-extrabold lg:text-3xl'>{t('Insignias')}</h1>
        <p className='m-0 mt-1 text-sm font-medium text-muted-foreground'>
          {t(
            t('Tienes {n} de {total}. Cada categoría sube de bronce a plata, oro, rubí y diamante. Toca una para ver qué significa y elegir la que sale junto a tu nombre.'),
            { n: totalEarned, total: TOTAL_MEDALS },
          )}
        </p>
      </div>

      {ACHIEVEMENT_CATALOG.map((def) => {
        const progress = byCategory[def.key]
        return (
          <div key={def.key} className='rounded-3xl border-2 border-border p-4'>
            <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
              <h2 className='m-0 text-lg font-extrabold'>{t(def.title)}</h2>
              <span className='text-xs font-extrabold text-muted-foreground'>
                {progress.earned} / {def.levels.length}
              </span>
            </div>
            <p className='m-0 mt-0.5 text-xs font-medium text-muted-foreground'>{t(def.description)}</p>
            <p className='m-0 mt-2 text-sm font-bold'>{progress.progressLabel}</p>
            <div className='mt-3 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5'>
              {def.levels.map((level, index) => {
                const earned = index < progress.earned
                return (
                  <button
                    key={level.tier}
                    type='button'
                    onClick={() => setSelection({ def, tier: level.tier })}
                    className='flex w-full flex-col items-center rounded-2xl p-1 text-center transition-colors hover:bg-muted/60'
                    aria-label={t('{title} · {tier}: ver qué significa', { title: t(def.title), tier: tierName(level.tier) })}
                  >
                    <Medal
                      category={def.key}
                      tier={level.tier}
                      ribbon={level.ribbon}
                      label={`${t(def.title)} · ${tierName(level.tier)} · ${medalText(level.caption)}`}
                      earned={earned}
                      className='w-full max-w-[112px]'
                    />
                    <span className={`mt-1 text-xs font-extrabold ${earned ? '' : 'text-muted-foreground'}`}>
                      {tierName(level.tier)}
                    </span>
                    <span className='text-[11px] font-medium text-muted-foreground'>{medalText(level.caption)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <MedalDetailDialog
        selection={selection}
        progress={selection ? byCategory[selection.def.key] : null}
        onClose={() => setSelection(null)}
      />
    </section>
  )
}
