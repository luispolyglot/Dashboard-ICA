import { useState } from 'react'
import { BarChart3Icon, ChevronRightIcon } from 'lucide-react'
import { requestLevelSetup } from './WelcomeTour'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getMetaTrackerLevelColor } from '../components/MetaTracker/colors'
import { computeLevelPosition, getLevelThresholds } from '../components/MetaTracker/leveling'
import { getMetaTrackerTotalWords } from '../components/MetaTracker/progress'
import type { AppConfig } from '../types'
import { useLevelProfile } from './useLevelProfile'
import { LevelCard } from './LevelCard'
import { getUiLang, langName, t, uiLocale } from '@/i18n'

/**
 * Tu nivel real en una sola línea (arriba del camino, sin quitarle sitio).
 * Al tocarla se abre la barra completa del MetaTracker.
 */
export function LevelStrip({ config }: { config: AppConfig }) {
  const { profile: metaTrackerProfile, loading } = useLevelProfile(config)
  const [open, setOpen] = useState(false)
  const confirmed = Boolean(metaTrackerProfile?.confirmedAt)

  if (loading) {
    // Primera vez: la misma barrita, vacía y quieta (sin bloque gris parpadeando).
    return (
      <div className='flex h-11 w-full items-center gap-2.5 rounded-2xl border-2 border-border px-2.5' aria-hidden='true'>
        <span className='h-7 w-11 shrink-0 rounded-lg bg-muted' />
        <span className='h-2.5 min-w-0 flex-1 rounded-full bg-muted' />
        <span className='h-7 w-11 shrink-0 rounded-lg border-2 border-border' />
        <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground/50' />
      </div>
    )
  }

  // En español, en minúscula («polaco»); en inglés, el nombre en inglés («Polish»).
  const language = getUiLang() === 'en' ? langName(config.targetLang) : config.targetLang.toLowerCase()
  let content
  if (confirmed && metaTrackerProfile) {
    const total = getMetaTrackerTotalWords(metaTrackerProfile, config.targetLang)
    const pos = computeLevelPosition(total, getLevelThresholds(config.targetLang))
    const color = getMetaTrackerLevelColor(pos.currentLevelKey)
    const nextColor = pos.isNativePath ? '#A855F7' : getMetaTrackerLevelColor(pos.nextLevelKey)
    content = (
      <>
        <span
          className='flex h-7 min-w-11 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-extrabold text-white'
          style={{ background: color }}
        >
          {pos.currentLevelKey}
        </span>
        <span className='relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted'>
          <span
            className='absolute inset-y-0 left-0 rounded-full'
            style={{ width: `${Math.round(pos.pctWithin * 100)}%`, background: color }}
          />
        </span>
        <span className='shrink-0 text-xs font-bold text-muted-foreground tabular-nums'>
          {pos.total.toLocaleString(uiLocale())}
          {pos.isNativePath ? '' : ` / ${pos.segEnd.toLocaleString(uiLocale())}`}
        </span>
        <span
          className='flex h-7 min-w-11 shrink-0 items-center justify-center rounded-lg border-2 px-1.5 text-xs font-extrabold'
          style={{ borderColor: nextColor, color: nextColor }}
        >
          {pos.isNativePath ? t('Nativo') : pos.nextLevelKey}
        </span>
      </>
    )
  } else {
    content = (
      <span className='flex min-w-0 flex-1 items-center gap-2 truncate text-left text-sm font-bold text-primary'>
        <BarChart3Icon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' />
        {t('Sitúa tu nivel real en {lang}', { lang: language })}
      </span>
    )
  }

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='flex h-11 w-full items-center gap-2.5 rounded-2xl border-2 border-border px-2.5 transition-colors hover:bg-muted/60 active:bg-muted'
        aria-label={t('Tu nivel real en {lang}. Ver detalle', { lang: langName(config.targetLang) })}
      >
        {content}
        <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      </button>
      <LevelDialog config={config} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Ventana con tu nivel real completo (la misma tarjeta que en el inicio del ordenador). */
export function LevelDialog({
  config,
  open,
  onOpenChange,
}: {
  config: AppConfig
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const language = getUiLang() === 'en' ? langName(config.targetLang) : config.targetLang.toLowerCase()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Tu nivel real en {lang}', { lang: language })}</DialogTitle>
          <DialogDescription>
            {t('Sube con cada palabra ICA que activas en una frase, sumada a las que ya sabías.')}
          </DialogDescription>
        </DialogHeader>
        <LevelCard config={config} bare />
      </DialogContent>
    </Dialog>
  )
}

/**
 * OPTION A (Luis, 15 Oct): your level, tiny, to the right of «Tu ciclo ICA hoy» on the phone:
 * «B2+ → C1» and a thin bar under it. A tap opens the full level, like the strip did.
 */
export function LevelChip({ config }: { config: AppConfig }) {
  const { profile: metaTrackerProfile, loading } = useLevelProfile(config)
  const [open, setOpen] = useState(false)
  if (loading) return <span className='h-9 w-20 shrink-0' aria-hidden='true' />
  const confirmed = Boolean(metaTrackerProfile?.confirmedAt)

  let content
  if (confirmed && metaTrackerProfile) {
    const total = getMetaTrackerTotalWords(metaTrackerProfile, config.targetLang)
    const pos = computeLevelPosition(total, getLevelThresholds(config.targetLang))
    const color = getMetaTrackerLevelColor(pos.currentLevelKey)
    const nextColor = pos.isNativePath ? '#A855F7' : getMetaTrackerLevelColor(pos.nextLevelKey)
    content = (
      <>
        <span className='flex items-center gap-1 text-[11px] leading-none font-extrabold'>
          <span className='rounded-full px-1.5 py-0.5 text-white' style={{ background: color }}>
            {pos.currentLevelKey}
          </span>
          <span className='text-muted-foreground' aria-hidden='true'>→</span>
          <span className='rounded-full border-[1.5px] px-1.5 py-[1px]' style={{ borderColor: nextColor, color: nextColor }}>
            {pos.isNativePath ? t('Nativo') : pos.nextLevelKey}
          </span>
        </span>
        <span className='block h-1 w-full overflow-hidden rounded-full bg-muted'>
          <span className='block h-full rounded-full' style={{ width: `${Math.round(pos.pctWithin * 100)}%`, background: color }} />
        </span>
      </>
    )
  } else {
    // Without a level yet (Luis, 16 Oct: for instance after skipping the welcome guide), the chip
    // calls for attention until it is tapped: it opens «¿Qué nivel tienes…?» directly.
    return (
      <button
        type='button'
        data-tour='level'
        onClick={() => requestLevelSetup()}
        className='ica-attention relative flex shrink-0 items-center gap-1.5 rounded-xl border-2 px-2.5 py-1.5 text-xs font-black focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:outline-none'
        style={{ borderColor: 'var(--ica-gold)', background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
        aria-label={t('Elige tu nivel de {lang}', { lang: langName(config.targetLang) })}
      >
        <BarChart3Icon className='size-4' strokeWidth={2.6} aria-hidden='true' />
        {t('Elige tu nivel')}
        <span
          className='absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-black text-white'
          style={{ background: 'var(--ica-bad, #e5484d)' }}
          aria-hidden='true'
        >
          !
        </span>
      </button>
    )
  }

  return (
    <>
      <button
        type='button'
        data-tour='level'
        onClick={() => setOpen(true)}
        className='flex w-[5.5rem] shrink-0 flex-col items-end gap-1 rounded-lg py-1 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:outline-none'
        aria-label={t('Tu nivel real en {lang}. Ver detalle', { lang: langName(config.targetLang) })}
      >
        {content}
      </button>
      <LevelDialog config={config} open={open} onOpenChange={setOpen} />
    </>
  )
}
