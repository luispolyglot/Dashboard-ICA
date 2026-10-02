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
import type { IcaChallengeScope, IcaChallengeTypeRecord } from '../../types'

export type ChallengeModeTileId = 'lectura' | 'escritura' | 'escucha' | 'habla' | 'parejas' | 'proximamente'

type Tone = {
  tile: string
  icon: string
  ring: string
}

export type ChallengeModeTile = {
  id: ChallengeModeTileId
  label: string
  hint: string
  icon: LucideIcon
  /** Tipos de desafio_tipos que abre este bloque (Escritura abre dos). */
  typeIds: string[]
  tone: Tone
}

/** Orden de Luis: Lectura, Escritura, Escucha y Habla; después Parejas y lo que está por llegar. */
export const CHALLENGE_MODE_TILES: ChallengeModeTile[] = [
  {
    id: 'lectura',
    label: 'Lectura',
    hint: 'Elige entre 4 opciones',
    icon: BookOpenIcon,
    typeIds: ['ica-own-words'],
    tone: {
      tile: 'border-sky-300 dark:border-sky-400/50 bg-gradient-to-br from-sky-500/25 via-sky-500/5 to-transparent hover:border-sky-300 hover:shadow-sky-500/20',
      icon: 'bg-sky-500/20 text-sky-600 dark:text-sky-300',
      ring: 'ring-sky-400',
    },
  },
  {
    id: 'escritura',
    label: 'Escritura',
    hint: 'Por palabra o cuenta atrás',
    icon: PencilLineIcon,
    typeIds: ['ica-writing', 'ica-lightning'],
    tone: {
      tile: 'border-violet-300 dark:border-violet-400/50 bg-gradient-to-br from-violet-500/25 via-violet-500/5 to-transparent hover:border-violet-300 hover:shadow-violet-500/20',
      icon: 'bg-violet-500/20 text-violet-600 dark:text-violet-300',
      ring: 'ring-violet-400',
    },
  },
  {
    id: 'escucha',
    label: 'Escucha',
    hint: 'Oye y elige qué significa',
    icon: HeadphonesIcon,
    typeIds: ['ica-listen'],
    tone: {
      tile: 'border-emerald-300 dark:border-emerald-400/50 bg-gradient-to-br from-emerald-500/25 via-emerald-500/5 to-transparent hover:border-emerald-300 hover:shadow-emerald-500/20',
      icon: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300',
      ring: 'ring-emerald-400',
    },
  },
  {
    id: 'habla',
    label: 'Habla',
    hint: 'Dila en voz alta',
    icon: MicIcon,
    typeIds: ['ica-speak'],
    tone: {
      tile: 'border-rose-300 dark:border-rose-400/50 bg-gradient-to-br from-rose-500/25 via-rose-500/5 to-transparent hover:border-rose-300 hover:shadow-rose-500/20',
      icon: 'bg-rose-500/20 text-rose-600 dark:text-rose-300',
      ring: 'ring-rose-400',
    },
  },
  {
    id: 'parejas',
    label: 'Parejas',
    hint: 'Une cada palabra con su significado',
    icon: Link2Icon,
    typeIds: ['ica-pairs'],
    tone: {
      tile: 'border-amber-300 dark:border-amber-400/50 bg-gradient-to-br from-amber-500/25 via-amber-500/5 to-transparent hover:border-amber-300 hover:shadow-amber-500/20',
      icon: 'bg-amber-500/20 text-amber-600 dark:text-amber-300',
      ring: 'ring-amber-400',
    },
  },
  {
    id: 'proximamente',
    label: 'Próximamente',
    hint: 'Completa la frase y más',
    icon: LockIcon,
    // «Completa la frase» (ica-cloze) está apagado en desafio_tipos hasta que se rehaga.
    typeIds: [],
    tone: {
      tile: 'border-dashed border-border bg-muted/10',
      icon: 'bg-muted text-muted-foreground',
      ring: 'ring-border',
    },
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

export function ModeTileGrid({
  types,
  scope,
  onPick,
}: {
  types: IcaChallengeTypeRecord[]
  scope: IcaChallengeScope
  onPick: (tile: ChallengeModeTile) => void
}) {
  const playable = CHALLENGE_MODE_TILES.filter((tile) => tile.id !== 'proximamente')
  const comingSoon = CHALLENGE_MODE_TILES.find((tile) => tile.id === 'proximamente')
  return (
    <div>
      <p className='mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Modo</p>
      <div className='grid grid-cols-2 gap-3'>
        {playable.map((tile) => {
          const available = availableTypesForTile(tile, types, scope).length > 0
          const Icon = available ? tile.icon : LockIcon
          return (
            <button
              key={tile.id}
              type='button'
              disabled={!available}
              onClick={() => available && onPick(tile)}
              className={`group relative flex min-h-[9.5rem] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border p-3 text-center transition-all duration-200 ${
                available
                  ? `${tile.tone.tile} hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]`
                  : 'cursor-not-allowed border-dashed border-border bg-muted/10 opacity-70'
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-110 ${
                  available ? tile.tone.icon : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className='h-6 w-6' />
              </span>
              <span className='font-serif text-lg font-semibold leading-tight'>{tile.label}</span>
              <span className='text-[11px] leading-snug text-muted-foreground'>
                {available ? tile.hint : 'No disponible ahora'}
              </span>
            </button>
          )
        })}
        {comingSoon && (
          <div className='flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/10 p-3 text-center opacity-80'>
            <span className='flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
              <LockIcon className='h-6 w-6' />
            </span>
            <span className='font-serif text-lg font-semibold leading-tight'>{comingSoon.label}</span>
            <span className='text-[11px] leading-snug text-muted-foreground'>{comingSoon.hint}</span>
          </div>
        )}
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
    { id: 'global', label: 'Global', hint: 'Cada uno sus palabras', icon: GlobeIcon },
    { id: 'language', label: 'Por idioma', hint: 'Mezcla de baúles ICA', icon: LanguagesIcon },
  ]
  return (
    <div
      className='grid grid-cols-2 gap-1 rounded-xl border bg-muted/30 p-1'
      role='radiogroup'
      aria-label={`Tipo de desafío (${targetLang})`}
    >
      {options.map((option) => {
        const active = value === option.id
        const Icon = option.icon
        return (
          <button
            key={option.id}
            type='button'
            role='radio'
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
              active ? 'bg-background shadow-sm ring-1 ring-primary/40' : 'text-muted-foreground hover:bg-background/50'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`} />
            <span className='min-w-0'>
              <span className={`block text-sm font-semibold leading-tight ${active ? 'text-foreground' : ''}`}>
                {option.label}
              </span>
              <span className='block text-[11px] leading-tight text-muted-foreground'>{option.hint}</span>
            </span>
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
      label: 'Por palabra',
      hint: `10 palabras por turnos · ${secondsPerWord} s cada una`,
      icon: TimerIcon,
      available: wordTypeAvailable,
    },
    {
      typeId: 'ica-lightning',
      label: 'Cuenta atrás',
      hint: `${countdownSeconds} segundos · una sola ronda · gana quien más acierte`,
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
            <span className='font-semibold'>{option.label}</span>
            <span className='text-xs leading-snug text-muted-foreground'>{option.hint}</span>
          </button>
        )
      })}
    </div>
  )
}
