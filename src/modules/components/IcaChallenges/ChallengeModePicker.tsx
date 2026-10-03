/**
 * Elección de modo en Desafíos ICA: Lectura, Escritura, Escucha, Habla y Parejas,
 * más «Próximamente», el interruptor Global / Por idioma y, dentro de Escritura,
 * «Por palabra» o «Cuenta atrás».
 */
import {
  BookOpenIcon,
  CheckIcon,
  GlobeIcon,
  HeadphonesIcon,
  LanguagesIcon,
  Link2Icon,
  LockIcon,
  MicIcon,
  PencilLineIcon,
  TimerIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { langName, t } from '@/i18n'
import { BookGlyph, HeadphonesGlyph, HourglassGlyph, PairsGlyph, PencilGlyph, SpeechGlyph } from '../../game/icons'
import type { IcaChallengeScope, IcaChallengeTypeRecord } from '../../types'

export type ChallengeModeTileId = 'lectura' | 'escritura' | 'escucha' | 'habla' | 'parejas' | 'proximamente'

export type ChallengeModeTile = {
  id: ChallengeModeTileId
  label: string
  hint: string
  /** Icono pequeño (chips de la lista de retos). */
  icon: LucideIcon
  /** Dibujo grande, en el estilo de Juegos ICA. */
  glyph: (props: { size?: number }) => ReactElement
  /** Color del modo (fondo suave del dibujo). */
  color: string
  /** Tipos de desafio_tipos que abre este bloque (Escritura abre dos). */
  typeIds: string[]
}

/** Orden de Luis: Lectura, Escritura, Escucha y Habla; después Parejas y lo que está por llegar. */
export const CHALLENGE_MODE_TILES: ChallengeModeTile[] = [
  {
    id: 'lectura',
    glyph: BookGlyph,
    color: '#3B82F6',
    label: 'Lectura',
    hint: 'Elige entre 4 opciones',
    icon: BookOpenIcon,
    typeIds: ['ica-own-words'],
  },
  {
    id: 'escritura',
    glyph: PencilGlyph,
    color: '#8B5CF6',
    label: 'Escritura',
    hint: 'Por palabra o cuenta atrás',
    icon: PencilLineIcon,
    typeIds: ['ica-writing', 'ica-lightning'],
  },
  {
    id: 'escucha',
    glyph: HeadphonesGlyph,
    color: '#10B981',
    label: 'Escucha',
    hint: 'Oye y elige qué significa',
    icon: HeadphonesIcon,
    typeIds: ['ica-listen'],
  },
  {
    id: 'habla',
    glyph: SpeechGlyph,
    color: '#FB7185',
    label: 'Habla',
    hint: 'Dila en voz alta',
    icon: MicIcon,
    typeIds: ['ica-speak'],
  },
  {
    id: 'parejas',
    glyph: PairsGlyph,
    color: '#F59E0B',
    label: 'Parejas',
    hint: 'Une cada palabra con su significado',
    icon: Link2Icon,
    typeIds: ['ica-pairs'],
  },
  {
    id: 'proximamente',
    glyph: HourglassGlyph,
    color: '#94A3B8',
    label: 'Próximamente',
    hint: 'Completa la frase y más',
    icon: LockIcon,
    // «Completa la frase» (ica-cloze) está apagado en desafio_tipos hasta que se rehaga.
    typeIds: [],
  },
]

export function tileForTypeId(typeId: string): ChallengeModeTile | null {
  return CHALLENGE_MODE_TILES.find((tile) => tile.typeIds.includes(typeId)) ?? null
}

function isTypeAvailable(type: IcaChallengeTypeRecord | undefined, scope: IcaChallengeScope): boolean {
  return Boolean(type && type.isActive && type.isPlayable && type.scopes.includes(scope))
}

/** Tipos jugables de un bloque con el alcance elegido. */
export function availableTypesForTile(
  tile: ChallengeModeTile,
  types: IcaChallengeTypeRecord[],
  scope: IcaChallengeScope,
): IcaChallengeTypeRecord[] {
  return tile.typeIds
    .map((id) => types.find((type) => type.id === id))
    .filter((type): type is IcaChallengeTypeRecord => isTypeAvailable(type, scope))
}

/** Dibujo del modo en su cuadrado de color suave (como las tarjetas de Juegos ICA). */
export function ModeGlyphBadge({ tile, size = 'md' }: { tile: ChallengeModeTile; size?: 'md' | 'sm' }) {
  const Glyph = tile.glyph
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl ${size === 'md' ? 'size-12' : 'size-11'}`}
      style={{ background: `color-mix(in oklab, ${tile.color} 16%, transparent)` }}
      aria-hidden='true'
    >
      <Glyph size={size === 'md' ? 30 : 28} />
    </span>
  )
}

/**
 * Modos para retar, con el mismo diseño que las tarjetas de Juegos ICA: tarjeta con borde,
 * dibujo a color arriba, nombre y una línea de ayuda. Lo que no está disponible lleva candado.
 */
export function ModeTileGrid({
  types,
  scope,
  onPick,
}: {
  types: IcaChallengeTypeRecord[]
  scope: IcaChallengeScope
  onPick: (tile: ChallengeModeTile) => void
}) {
  return (
    <div>
      <p className='mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>{t('Modo')}</p>
      <div className='grid grid-cols-2 gap-3'>
        {CHALLENGE_MODE_TILES.map((tile) => {
          const comingSoon = tile.id === 'proximamente'
          const available = !comingSoon && availableTypesForTile(tile, types, scope).length > 0
          return (
            <button
              key={tile.id}
              type='button'
              disabled={!available}
              onClick={() => available && onPick(tile)}
              className={`relative flex min-h-[136px] flex-col items-start gap-1.5 rounded-3xl border-2 border-border bg-card p-4 text-left transition-colors ${
                available ? 'hover:bg-muted/50 active:bg-muted' : `cursor-not-allowed opacity-60 ${comingSoon ? 'border-dashed' : ''}`
              }`}
            >
              <ModeGlyphBadge tile={tile} />
              {!available ? (
                <span className='absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground'>
                  <LockIcon className='size-3.5' aria-hidden='true' />
                </span>
              ) : null}
              <span className='mt-1 font-display text-lg leading-tight font-extrabold'>{t(tile.label)}</span>
              <span className='text-xs leading-snug font-semibold text-muted-foreground'>
                {available || comingSoon ? t(tile.hint) : t('No disponible ahora')}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ScopeToggle({
  value,
  onChange,
  targetLang,
}: {
  value: IcaChallengeScope
  onChange: (scope: IcaChallengeScope) => void
  targetLang: string
}) {
  const options: Array<{ id: IcaChallengeScope; label: string; hint: string; icon: LucideIcon }> = [
    { id: 'global', label: t('Global'), hint: t('Cada uno sus palabras'), icon: GlobeIcon },
    { id: 'language', label: t('Por idioma'), hint: t('Mezcla de baúles ICA'), icon: LanguagesIcon },
  ]
  return (
    <div className='flex gap-1.5' role='radiogroup' aria-label={t('Tipo de desafío ({lang})', { lang: langName(targetLang) })}>
      {options.map((option) => {
        const active = value === option.id
        const Icon = option.icon
        return (
          <button
            key={option.id}
            type='button'
            role='radio'
            aria-checked={active}
            aria-label={t(option.hint)}
            onClick={() => onChange(option.id)}
            className={`flex h-9 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-extrabold transition-colors ${
              active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon className='size-4 shrink-0' strokeWidth={2.4} />
            {t(option.label)}
          </button>
        )
      })}
    </div>
  )
}

export function WritingVariantPicker({
  value,
  onChange,
  wordTypeAvailable,
  countdownTypeAvailable,
  secondsPerWord,
  countdownSeconds,
}: {
  value: string
  onChange: (typeId: string) => void
  wordTypeAvailable: boolean
  countdownTypeAvailable: boolean
  secondsPerWord: number
  countdownSeconds: number
}) {
  const options = [
    {
      typeId: 'ica-writing',
      label: t('Por palabra'),
      // Sin «10 palabras por turnos»: todos los desafíos son de 10 palabras.
      hint: t('Una palabra cada vez · {n} s', { n: secondsPerWord }),
      icon: TimerIcon,
      available: wordTypeAvailable,
    },
    {
      typeId: 'ica-lightning',
      label: t('Cuenta atrás'),
      hint: t('Todas las que puedas en {n} s', { n: countdownSeconds }),
      icon: ZapIcon,
      available: countdownTypeAvailable,
    },
  ]
  return (
    <div className='grid grid-cols-2 gap-2'>
      {options.map((option) => {
        const active = value === option.typeId
        const Icon = option.icon
        return (
          <button
            key={option.typeId}
            type='button'
            disabled={!option.available}
            onClick={() => onChange(option.typeId)}
            aria-pressed={active}
            className={`relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? 'border-violet-400 bg-violet-500/15 ring-1 ring-violet-400/60'
                : 'border-border bg-muted/20 hover:border-violet-300/60'
            }`}
          >
            {active && (
              <span className='absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white'>
                <CheckIcon className='h-3 w-3' />
              </span>
            )}
            <Icon className='h-5 w-5 text-violet-600 dark:text-violet-300' />
            <span className='font-semibold'>{t(option.label)}</span>
            <span className='text-xs leading-snug text-muted-foreground'>{t(option.hint)}</span>
          </button>
        )
      })}
    </div>
  )
}
