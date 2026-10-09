import { memo, useEffect } from 'react'
import { LockIcon } from 'lucide-react'
import { buildMedalSvg, isLegend, MEDAL_DEFS_SVG, type MedalCategory, type MedalTier } from './medals'
import { getUiLang, t } from '@/i18n'

const DEFS_ID = 'ica-medal-defs'

/**
 * Los degradados de las medallas van UNA sola vez, directamente en <body>.
 * (Si se repiten, el navegador usa el primero, y si ese está en una parte oculta
 * de la pantalla, las medallas salen sin color.)
 */
function ensureMedalDefs(): void {
  if (typeof document === 'undefined' || document.getElementById(DEFS_ID)) return
  const container = document.createElement('div')
  container.id = DEFS_ID
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
  container.innerHTML = MEDAL_DEFS_SVG
  document.body.appendChild(container)
}

/** Asegura que los degradados de las medallas están en la página. */
export function MedalDefs() {
  useEffect(() => {
    ensureMedalDefs()
  }, [])
  return null
}

type MedalProps = {
  category: MedalCategory
  tier: MedalTier
  ribbon: string
  label: string
  earned: boolean
  className?: string
  /** Sin cinta: el texto va dentro (para filas del ranking). */
  compact?: boolean
}

/** Una medalla. Si aún no se ha conseguido, se ve apagada. */
/** La cinta de la medalla en el idioma de la interfaz ("30 DÍAS" → "30 DAYS", "1.º" → "1st"). */
function ribbonText(ribbon: string): string {
  if (getUiLang() !== 'en') return ribbon
  return ribbon
    .replace('DÍAS', 'DAYS')
    .replace(/1\.º/g, '1st')
    .replace(/2\.º/g, '2nd')
    .replace(/3\.º/g, '3rd')
}

export const Medal = memo(function Medal({ category, tier, ribbon, label, earned, className, compact = false }: MedalProps) {
  useEffect(() => {
    ensureMedalDefs()
  }, [])
  return (
    <div
      className={earned ? className : `${className ?? ''} ica-medal-locked`}
      style={{
        filter: earned ? undefined : 'grayscale(1)',
        // Rubí y diamante sin conseguir: apagadas pero con su brillo bien visible.
        opacity: earned ? 1 : tier === 'rubi' || tier === 'diamante' || isLegend(tier) ? 0.55 : 0.32,
      }}
      aria-label={earned ? label : t('{label} (aún no)', { label })}
      dangerouslySetInnerHTML={{ __html: buildMedalSvg(category, tier, ribbonText(ribbon), label, compact) }}
    />
  )
})

/**
 * A medal the student cannot earn (Coaching ICA badges for students without a coaching, Luis 7 Oct):
 * switched off like any medal not yet earned, with a padlock on top.
 */
export function LockedMedal({ className, label, ...medal }: Omit<MedalProps, 'earned'>) {
  return (
    <div className={`relative ${className ?? ''}`} role='img' aria-label={t('{label} (solo para alumnos del Coaching ICA)', { label })}>
      <div aria-hidden='true'>
        <Medal {...medal} label={label} earned={false} className='w-full' />
      </div>
      <span className='pointer-events-none absolute inset-0 flex items-center justify-center' aria-hidden='true'>
        <span className='flex aspect-square w-[36%] max-w-11 items-center justify-center rounded-full border-2 border-border bg-background shadow-sm'>
          <LockIcon className='size-[52%] text-muted-foreground' strokeWidth={2.6} />
        </span>
      </span>
    </div>
  )
}
