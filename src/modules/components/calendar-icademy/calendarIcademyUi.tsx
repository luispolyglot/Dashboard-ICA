import { t } from '@/i18n'
import { GlobeIcon, LayersIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCalendarIcademyCatalogEntry } from '../../constants/calendarIcademyCatalog'
import { tone, type Tone } from '../../game/ui'
import type { CalendarIcademyEntry } from '../../types'

/**
 * Piezas visuales del Calendario ICADEMY (las usan el tablero y la vista del alumno).
 * Cada idioma tiene su color de la paleta ICA para que se reconozca de un vistazo.
 */

// Color de cada idioma (los mismos matices que antes: cian, azul, rojo, verde, ámbar, morado)
const LANGUAGE_TONE: Record<string, Tone> = {
  pl: 'primary',
  fr: 'i',
  en: 'a',
  it: 'ok',
  de: 'gold',
  destripando_niveles: 'c',
}

const LANGUAGE_NAMES: Record<string, string> = {
  pl: 'Polaco',
  fr: 'Francés',
  en: 'Inglés',
  it: 'Italiano',
  de: 'Alemán',
  destripando_niveles: 'Destripando Niveles',
}

export type CalendarClassMeta = {
  classKey: string
  className: string
  languageCode: string
  /** Bandera del idioma, o null si la clase no tiene (se pinta un icono). */
  flag: string | null
  tone: Tone
}

/** Banderas reales: dos letras regionales. El resto (cuchillo, globo...) no se pinta como emoji. */
function isFlagEmoji(value: string | undefined | null): value is string {
  if (!value) return false
  const codePoints = Array.from(value).map((char) => char.codePointAt(0) || 0)
  return codePoints.length === 2 && codePoints.every((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
}

export function getLanguageTone(languageCode: string): Tone {
  return LANGUAGE_TONE[languageCode] || 'neutral'
}

export function getLanguageName(languageCode: string): string {
  return LANGUAGE_NAMES[languageCode] || languageCode.toUpperCase()
}

/** Nombre, idioma, bandera y color de una clase (del catálogo, o de la propia fila si no está). */
export function getClassMeta(
  classKey: string,
  fallback?: Pick<CalendarIcademyEntry, 'className' | 'languageCode'>,
): CalendarClassMeta {
  const catalogEntry = getCalendarIcademyCatalogEntry(classKey)
  const languageCode = catalogEntry?.languageCode || fallback?.languageCode || ''
  const flag = catalogEntry?.flag
  return {
    classKey,
    className: catalogEntry?.className || fallback?.className || classKey,
    languageCode,
    flag: isFlagEmoji(flag) ? flag : null,
    tone: getLanguageTone(languageCode),
  }
}

/** Bandera en línea con el texto (o un icono si la clase no tiene bandera). */
export function ClassFlag({ meta, className }: { meta: CalendarClassMeta; className?: string }) {
  if (meta.flag) {
    return (
      <span aria-hidden='true' className={cn('inline-block leading-none', className)}>
        {meta.flag}
      </span>
    )
  }
  const Icon = meta.languageCode === 'destripando_niveles' ? LayersIcon : GlobeIcon
  return (
    <Icon
      aria-hidden='true'
      className={cn('inline-block size-[1em] shrink-0 align-[-0.125em]', className)}
      strokeWidth={2.6}
      style={{ color: tone(meta.tone).ink }}
    />
  )
}

/** Cuadrado de color suave del idioma con la bandera grande (el icono de cada fila). */
export function FlagTile({
  meta,
  size = 48,
  className,
  checked = false,
}: {
  meta: CalendarClassMeta
  size?: number
  className?: string
  /** Marca verde: es una de tus clases. */
  checked?: boolean
}) {
  const colors = tone(meta.tone)
  return (
    <span
      aria-hidden='true'
      className={cn('relative flex shrink-0 items-center justify-center rounded-2xl', className)}
      style={{ width: size, height: size, background: colors.soft, fontSize: Math.round(size * 0.5) }}
    >
      <ClassFlag meta={meta} />
      {checked ? (
        <span
          className='absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full text-[11px] font-black text-white'
          style={{ background: 'var(--ica-ok)', boxShadow: '0 0 0 2px var(--card)' }}
        >
          ✓
        </span>
      ) : null}
    </span>
  )
}

const WEEKDAY_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

/** Hoja de calendario: día de la semana arriba (franja de color) y el número en grande. */
export function DateBadge({ dateKey, tone: badgeTone, size = 64 }: { dateKey: string; tone: Tone; size?: number }) {
  const colors = tone(badgeTone)
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year || 2000, (month || 1) - 1, day || 1)
  return (
    <span
      aria-hidden='true'
      className='flex shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-card text-center'
      style={{
        width: size,
        borderColor: colors.solid,
        boxShadow: `0 4px 0 ${colors.edge}`,
      }}
    >
      <span className='py-0.5 text-[11px] leading-4 font-black tracking-[0.08em] text-white' style={{ background: colors.solid }}>
        {t(WEEKDAY_SHORT[date.getDay()])}
      </span>
      <span
        className='flex items-center justify-center leading-none font-black tabular-nums'
        style={{ height: size - 22, fontSize: Math.round(size * 0.44), color: colors.ink }}
      >
        {date.getDate()}
      </span>
    </span>
  )
}
