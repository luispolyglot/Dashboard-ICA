import { useState } from 'react'
import { ACHIEVEMENT_CATALOG, TOTAL_ACHIEVEMENTS, useAchievements, type AchievementCategoryDef } from '../game/achievements'
import { Medal, MedalDefs } from '../game/Medal'
import { LegendPips, MedalDetailDialog, type MedalSelection } from '../game/MedalDetail'
import { medalText, tierName } from '../game/medals'
import { Pill } from '../game/ui'
import { t } from '@/i18n'

/**
 * INSIGNIAS (Luis, 3 oct): poco texto. Arriba, cuántas tienes. En cada categoría, su nombre,
 * una línea y 6 huecos: bronce, plata, oro, rubí, diamante y Leyenda (que tiene I, II y III).
 * Lo que llevas y lo que te falta sale al tocar una insignia, con su barra de avance.
 */
export function InsigniasView() {
  const { byCategory, totalEarned } = useAchievements()
  const [selection, setSelection] = useState<MedalSelection>(null)

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-4 pb-28 lg:py-10'>
      <MedalDefs />
      <div className='flex items-center justify-between gap-3'>
        <h1 className='m-0 font-display tracking-tight text-2xl leading-tight font-extrabold lg:text-3xl'>{t('Insignias')}</h1>
        <Pill tone='gold' className='px-3 py-1 text-sm tabular-nums'>
          {totalEarned} / {TOTAL_ACHIEVEMENTS}
        </Pill>
      </div>

      {ACHIEVEMENT_CATALOG.map((def) => (
        <CategoryCard
          key={def.key}
          def={def}
          earned={byCategory[def.key].earned}
          onOpen={(tier) => setSelection({ def, tier })}
        />
      ))}

      <MedalDetailDialog
        selection={selection}
        progress={selection ? byCategory[selection.def.key] : null}
        onClose={() => setSelection(null)}
      />
    </section>
  )
}

function CategoryCard({
  def,
  earned,
  onOpen,
}: {
  def: AchievementCategoryDef
  earned: number
  onOpen: (tier: AchievementCategoryDef['levels'][number]['tier']) => void
}) {
  const base = def.levels.slice(0, 5)
  const legends = def.levels.slice(5)
  const legendEarned = Math.max(0, earned - 5)
  // El hueco de la Leyenda enseña la Leyenda I (lo que va después del diamante);
  // las casillas I · II · III de debajo dicen cuáles tienes.
  const legend = legends[0]

  return (
    <div className='rounded-3xl border-2 border-border p-4'>
      <h2 className='m-0 text-lg font-extrabold'>{t(def.title)}</h2>
      <p className='m-0 mt-0.5 text-xs font-semibold text-muted-foreground'>{t(def.description)}</p>
      <div className='mt-3 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6'>
        {base.map((level, index) => {
          const isEarned = index < earned
          return (
            <button
              key={level.tier}
              type='button'
              onClick={() => onOpen(level.tier)}
              className='flex w-full flex-col items-center rounded-2xl p-1 text-center transition-colors hover:bg-muted/60'
              aria-label={`${t(def.title)} · ${tierName(level.tier)}`}
            >
              <Medal
                category={def.key}
                tier={level.tier}
                ribbon={level.ribbon}
                label={`${t(def.title)} · ${tierName(level.tier)} · ${medalText(level.caption)}`}
                earned={isEarned}
                className='w-full max-w-[104px]'
              />
              <span className={`mt-1 text-xs font-extrabold ${isEarned ? '' : 'text-muted-foreground'}`}>{tierName(level.tier)}</span>
              <span className='text-[11px] font-medium text-muted-foreground'>{medalText(level.caption)}</span>
            </button>
          )
        })}
        <button
          type='button'
          onClick={() => onOpen(legend.tier)}
          className='flex w-full flex-col items-center rounded-2xl p-1 text-center transition-colors hover:bg-muted/60'
          aria-label={`${t(def.title)} · ${t('Leyenda')}`}
        >
          <Medal
            category={def.key}
            tier={legend.tier}
            ribbon={legend.ribbon}
            label={`${t(def.title)} · ${tierName(legend.tier)}`}
            earned={legendEarned > 0}
            className='w-full max-w-[104px]'
          />
          <span className={`mt-1 text-xs font-extrabold ${legendEarned > 0 ? '' : 'text-muted-foreground'}`}>{t('Leyenda')}</span>
          <LegendPips earned={legendEarned} />
        </button>
      </div>
    </div>
  )
}
