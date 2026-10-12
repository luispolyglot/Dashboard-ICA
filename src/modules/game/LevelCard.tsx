import { useState } from 'react'
import { InfoIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getMetaTrackerLevelColor } from '../components/MetaTracker/colors'
import { computeLevelPosition, getLevelThresholds, LEVEL_KEYS } from '../components/MetaTracker/leveling'
import { MetaTrackerSetupModal } from '../components/MetaTracker/MetaTrackerSetupModal'
import { getMetaTrackerTotalWords } from '../components/MetaTracker/progress'
import { useDashboardContext } from '../context/DashboardContext'
import { useLevelProfile } from './useLevelProfile'
import type { AppConfig, MetaTrackerStartLevel } from '../types'
import { getUiLang, langName, t, uiLocale } from '@/i18n'

// Se crea al pintar para usar el idioma de la interfaz.
const numberFormatter = { format: (value: number) => new Intl.NumberFormat(uiLocale()).format(value) }

/**
 * Tu nivel real en el idioma (la barra del MetaTracker) con el estilo del modo juego:
 * nivel actual, barra hasta el siguiente y el camino de niveles de A1 a C1.
 * Va en la columna derecha en ordenador y en la ventana que abre la barrita del móvil.
 */
export function LevelCard({ config, bare = false }: { config: AppConfig; bare?: boolean }) {
  const { metaTrackerSaving, saveMetaTracker } = useDashboardContext()
  // Mientras carga, el último nivel que se vio (ver useLevelProfile).
  const { profile: metaTrackerProfile, loading: metaTrackerLoading } = useLevelProfile(config)
  const [showSetup, setShowSetup] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  // En español, en minúscula («polaco»); en inglés, el nombre en inglés («Polish»).
  const language = getUiLang() === 'en' ? langName(config.targetLang) : config.targetLang.toLowerCase()
  const frame = bare ? '' : 'rounded-3xl border-2 border-border p-4'

  const handleSave = async (payload: { startLevel: MetaTrackerStartLevel; priorIcaWords: number }) => {
    await saveMetaTracker(payload)
    setShowSetup(false)
  }

  const setup = showSetup ? (
    <MetaTrackerSetupModal
      targetLang={config.targetLang}
      saving={metaTrackerSaving}
      onClose={() => setShowSetup(false)}
      onSave={handleSave}
    />
  ) : null

  if (metaTrackerLoading) {
    return <div className={cn('h-36 bg-muted/40', bare ? 'rounded-2xl' : 'rounded-3xl border-2 border-border')} aria-hidden='true' />
  }

  if (!metaTrackerProfile?.confirmedAt) {
    return (
      <div className={cn('flex flex-col gap-3', frame)}>
        {setup}
        <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Tu nivel en {lang}', { lang: language })}</p>
        <p className='m-0 text-sm font-semibold text-muted-foreground'>
          {t('Elige tu nivel y te situamos en la barra de nivel, de A1 a C1.')}
        </p>
        <Button type='button' className='h-11 font-extrabold' onClick={() => setShowSetup(true)}>
          {t('Situar mi nivel')}
        </Button>
      </div>
    )
  }

  const total = getMetaTrackerTotalWords(metaTrackerProfile, config.targetLang)
  const pos = computeLevelPosition(total, getLevelThresholds(config.targetLang))
  const color = getMetaTrackerLevelColor(pos.currentLevelKey)
  const nextColor = pos.isNativePath ? '#A855F7' : getMetaTrackerLevelColor(pos.nextLevelKey)
  const reachedIndex = LEVEL_KEYS.findIndex((key) => key === pos.currentLevelKey)

  return (
    <div className={cn('flex flex-col gap-3', frame)}>
      {setup}
      <div className='flex items-center justify-between gap-2'>
        <p className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Tu nivel en {lang}', { lang: language })}</p>
        <button
          type='button'
          onClick={() => setInfoOpen((open) => !open)}
          aria-expanded={infoOpen}
          aria-label={t('Cómo se calcula tu nivel')}
          className={cn(
            'flex size-8 items-center justify-center rounded-xl transition-colors',
            infoOpen ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          <InfoIcon className='size-4.5' strokeWidth={2.4} aria-hidden='true' />
        </button>
      </div>

      <div className='flex items-center gap-3'>
        <span
          className='flex h-12 min-w-16 shrink-0 items-center justify-center rounded-2xl px-2 text-lg font-black text-white'
          style={{ background: color, boxShadow: `0 4px 0 color-mix(in oklab, ${color} 70%, black)` }}
        >
          {pos.currentLevelKey}
        </span>
        <div className='min-w-0'>
          <p className='m-0 text-lg leading-tight font-black tabular-nums'>
            {t('{n} palabras', { n: numberFormatter.format(pos.total) })}
          </p>
          <p className='m-0 text-xs font-semibold text-muted-foreground'>
            {pos.isNativePath
              ? t('Camino a nivel nativo')
              : t('Te faltan {n} para {level}', {
                  n: numberFormatter.format(pos.wordsToNext ?? 0),
                  level: pos.nextLevelKey,
                })}
          </p>
        </div>
      </div>

      <div className='flex items-center gap-2'>
        <span className='relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted'>
          <span
            className='absolute inset-y-0 left-0 rounded-full transition-[width] duration-700'
            style={{ width: `${Math.max(4, Math.round(pos.pctWithin * 100))}%`, background: color }}
          />
          <span className='absolute inset-x-2 top-[3px] h-1 rounded-full bg-white/35' aria-hidden='true' />
        </span>
        <span
          className='flex h-7 min-w-11 shrink-0 items-center justify-center rounded-lg border-2 px-1.5 text-xs font-extrabold'
          style={{ borderColor: nextColor, color: nextColor }}
        >
          {pos.isNativePath ? t('Nativo') : pos.nextLevelKey}
        </span>
      </div>

      {/* Camino de niveles */}
      <div className='grid gap-1' style={{ gridTemplateColumns: `repeat(${LEVEL_KEYS.length}, minmax(0, 1fr))` }}>
        {LEVEL_KEYS.map((key, index) => {
          const reached = pos.isNativePath || index <= reachedIndex
          const levelColor = getMetaTrackerLevelColor(key)
          return (
            <span key={key} className='flex flex-col items-center gap-1'>
              <span
                className='h-1.5 w-full rounded-full'
                style={{ background: reached ? levelColor : 'var(--muted)' }}
              />
              <span
                className='text-[10px] leading-none font-extrabold'
                style={{ color: reached ? levelColor : 'var(--muted-foreground)', opacity: reached ? 1 : 0.7 }}
              >
                {key}
              </span>
            </span>
          )
        })}
      </div>

      {infoOpen ? (
        <p className='m-0 rounded-2xl bg-muted/70 p-3 text-xs leading-relaxed font-medium text-muted-foreground'>
          {t('Se calcula con tus')} <b className='text-foreground'>{t('palabras ICA activadas')}</b>
          {/* Everyone who joins now starts with ICA from zero (Luis, 9 Oct): no «words you already had». */}
          {t('. Los umbrales salen de otros alumnos que han aplicado ICA: son acertados, pero no exactos.')}
        </p>
      ) : null}
    </div>
  )
}
