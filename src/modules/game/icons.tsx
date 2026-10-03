// Iconos de juego (llama, ICA Coin, cofre, copa, espadas, hielo, tarjetas, micro, diana).
// Dibujados en SVG para que se vean igual en todos los móviles: en la app no se usan
// emojis (cambian según el sistema y no casan con el estilo de ICA).

type IconProps = {
  size?: number
  className?: string
}

/**
 * Una sola llama para todas las rachas: naranja para la racha ICA y azul (el color de las
 * flashcards) para la racha de flashcards. Misma forma en la app y en las insignias.
 */
export type FlameTone = 'fire' | 'flash' | 'gold' | 'off'

const FLAME_COLORS: Record<FlameTone, [string, string]> = {
  fire: ['var(--ica-fire)', 'var(--ica-gold)'],
  flash: ['var(--ica-i)', '#bfe3ff'],
  gold: ['var(--ica-gold)', '#fff1b8'],
  off: ['var(--border-strong)', 'var(--muted)'],
}

export function FlameIcon({ size = 24, className, tone = 'fire' }: IconProps & { tone?: FlameTone }) {
  const [outer, inner] = FLAME_COLORS[tone]
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path
        d='M12 1.8c.7 3.3-1.1 5.1-2.7 6.8-1.6 1.7-3.1 3.5-3.1 6.4 0 3.9 2.6 7.2 5.8 7.2s5.8-3.3 5.8-7.2c0-2.7-1.2-4.5-2.4-5.9-.3 1.4-1.1 2.3-2.1 2.7.5-3.4-.2-7-1.3-10z'
        style={{ fill: outer }}
      />
      <path
        d='M12 12.2c-1.7 1.5-2.7 2.8-2.7 4.5 0 1.9 1.2 3.4 2.7 3.4s2.7-1.5 2.7-3.4c0-1.3-.6-2.3-1.4-3-.2.7-.6 1.2-1.1 1.4.2-1.1-.1-2.1-.2-2.9z'
        style={{ fill: inner }}
      />
    </svg>
  )
}

export function FichaIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <circle cx='12' cy='12.8' r='9.6' fill='#E0A500' />
      <circle cx='12' cy='11.4' r='9.6' fill='#FFC72C' />
      <circle cx='12' cy='11.4' r='6.4' fill='none' stroke='#E0A500' strokeWidth='1.8' />
      <path d='M10.3 7.8h3.4M12 7.8v7.2M10.3 15h3.4' fill='none' stroke='#7A5000' strokeWidth='2' strokeLinecap='round' />
    </svg>
  )
}

export function BoltIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path
        d='M13 2L4.5 13.5H11L10 22L19.5 10.5H13Z'
        fill='#FFC72C'
        stroke='#E0A500'
        strokeWidth='1.4'
        strokeLinejoin='round'
      />
    </svg>
  )
}

export type ChestState = 'locked' | 'ready' | 'open'

/**
 * Cofre del ciclo: madera con herrajes dorados, cerradura con gema y, cuando está
 * listo, un halo de luz detrás. Abierto: rebosa de ICA Coins.
 */
export function ChestIcon({
  size = 40,
  className,
  state = 'ready',
  tone = 'wood',
}: IconProps & { state?: ChestState; tone?: 'wood' | 'brand' }) {
  // Cerrado se ve igual de apetecible y dorado, solo algo más apagado y sin brillo.
  const muted = state === 'locked'
  // «brand»: dibujo azul ICA para el camino de Inicio (las monedas siguen doradas).
  const brand = tone === 'brand'
  const wood = brand ? '#0b84b5' : muted ? '#C27E45' : '#B9652A'
  const woodDark = brand ? '#07658c' : muted ? '#9A5E2E' : '#8E4717'
  const woodLight = brand ? '#6fd0f2' : muted ? '#D99A5E' : '#D98A45'
  const gold = brand ? '#cdeefb' : muted ? '#F5C542' : '#FFC72C'
  const goldDark = brand ? '#8fd3ee' : muted ? '#D9A11E' : '#D99A00'
  const gem = brand ? '#FFC72C' : muted ? '#B7A09A' : '#F0445E'
  const coin = brand ? '#FFC72C' : gold
  const coinDark = brand ? '#D99A00' : goldDark
  const glow = brand ? ['#cdeefb', '#8fd3ee'] : ['#FFE38A', '#FFD54A']
  const sparkle = brand ? '#3fc1ec' : '#ffffff'
  const height = size * (34 / 40)

  if (state === 'open') {
    return (
      <svg viewBox='0 0 40 34' width={size} height={height} className={className} aria-hidden='true' style={{ overflow: 'visible' }}>
        {/* Tapa abierta hacia atrás */}
        <path d='M6 13.5 8.2 3.6a3 3 0 0 1 2.9-2.3h17.8a3 3 0 0 1 2.9 2.3L34 13.5z' fill={woodDark} />
        <path d='M8.6 12 10.4 4.2h19.2L31.4 12z' fill={wood} />
        <rect x='18' y='2' width='4' height='11' rx='1' fill={gold} />
        {/* Monedas que rebosan */}
        <circle cx='14' cy='15' r='4.2' fill={coinDark} />
        <circle cx='14' cy='14.2' r='4.2' fill={coin} />
        <circle cx='26' cy='15' r='4.2' fill={coinDark} />
        <circle cx='26' cy='14.2' r='4.2' fill={coin} />
        <circle cx='20' cy='13.6' r='5' fill={coinDark} />
        <circle cx='20' cy='12.6' r='5' fill={coin} />
        <path d='M19 10.4h2M20 10.4v4.4M19 14.8h2' stroke='#7A5000' strokeWidth='1.3' strokeLinecap='round' />
        {/* Caja */}
        <rect x='3' y='15.5' width='34' height='17' rx='3.5' fill={woodDark} />
        <rect x='3' y='15.5' width='34' height='15' rx='3.5' fill={wood} />
        <rect x='3' y='18.5' width='34' height='3' fill={gold} />
        <rect x='7' y='15.5' width='3' height='15' fill={goldDark} opacity='0.55' />
        <rect x='30' y='15.5' width='3' height='15' fill={goldDark} opacity='0.55' />
      </svg>
    )
  }

  return (
    <svg viewBox='0 0 40 34' width={size} height={height} className={className} aria-hidden='true' style={{ overflow: 'visible' }}>
      {state === 'ready' ? (
        <g opacity='0.9'>
          <circle cx='20' cy='17' r='19' fill={glow[0]} opacity='0.35' />
          <circle cx='20' cy='17' r='14' fill={glow[1]} opacity='0.35' />
        </g>
      ) : null}
      {/* Caja */}
      <rect x='3' y='14' width='34' height='18.5' rx='3.5' fill={woodDark} />
      <rect x='3' y='14' width='34' height='16.5' rx='3.5' fill={wood} />
      {/* Tapa curva */}
      <path d='M3 16V11.5A8.5 8.5 0 0 1 11.5 3h17A8.5 8.5 0 0 1 37 11.5V16z' fill={woodDark} />
      <path d='M3 14.5V11.5A8.5 8.5 0 0 1 11.5 3h17A8.5 8.5 0 0 1 37 11.5v3z' fill={wood} />
      <path d='M7 7.5a6 6 0 0 1 5-2.6h16' stroke={woodLight} strokeWidth='1.6' strokeLinecap='round' fill='none' />
      {/* Herrajes dorados */}
      <rect x='3' y='14' width='34' height='3.2' fill={gold} />
      <rect x='3' y='16.4' width='34' height='0.8' fill={goldDark} />
      <rect x='7' y='3.6' width='3.2' height='26.9' fill={gold} />
      <rect x='29.8' y='3.6' width='3.2' height='26.9' fill={gold} />
      <circle cx='8.6' cy='24' r='0.9' fill={goldDark} />
      <circle cx='31.4' cy='24' r='0.9' fill={goldDark} />
      <circle cx='8.6' cy='9' r='0.9' fill={goldDark} />
      <circle cx='31.4' cy='9' r='0.9' fill={goldDark} />
      {/* Cerradura con gema */}
      <path d='M15.5 12.5h9v7.2a4.5 4.5 0 0 1-9 0z' fill={goldDark} />
      <path d='M15.5 12h9v6.8a4.5 4.5 0 0 1-9 0z' fill={gold} />
      <path d='M20 13.6l2.1 2.4L20 18.6 17.9 16z' fill={gem} />
      <path d='M20 13.6l1 1.2-1 .9-1-.9z' fill='#ffffff' opacity={muted ? 0 : 0.7} />
      {state === 'ready' ? (
        <g fill={sparkle}>
          <path d='M36.5 1.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z' />
          <path d='M2.8 4.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z' />
        </g>
      ) : null}
    </svg>
  )
}

/** Copa dorada (ranking del mes, premios). */
export function TrophyIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M6.2 5.4H4.1a1 1 0 0 0-1 1.1c.25 2.3 1.6 3.8 3.7 4.2' fill='none' stroke='#E0A500' strokeWidth='1.9' strokeLinecap='round' />
      <path d='M17.8 5.4h2.1a1 1 0 0 1 1 1.1c-.25 2.3-1.6 3.8-3.7 4.2' fill='none' stroke='#E0A500' strokeWidth='1.9' strokeLinecap='round' />
      <rect x='10.5' y='12.5' width='3' height='4.4' fill='#E0A500' />
      <rect x='7.2' y='16.2' width='9.6' height='2.6' rx='1.1' fill='#E0A500' />
      <rect x='6.2' y='18.4' width='11.6' height='3.4' rx='1.3' fill='#B7791F' />
      <path d='M5.8 2.6h12.4v5a6.2 6.2 0 0 1-12.4 0z' fill='#FFC72C' />
      <path d='M8.3 4.4v3a3.6 3.6 0 0 0 1.6 3' fill='none' stroke='#FFF1B8' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M12 4.6l.8 1.6 1.8.3-1.3 1.2.3 1.8-1.6-.8-1.6.8.3-1.8-1.3-1.2 1.8-.3z' fill='#E0A500' />
    </svg>
  )
}

function Sword() {
  return (
    <>
      <path d='M12 1.6 14 4.3v9.5h-4V4.3z' fill='#E2E8F0' stroke='#94A3B8' strokeWidth='0.8' strokeLinejoin='round' />
      <path d='M12 3v10.6' stroke='#ffffff' strokeWidth='0.8' strokeLinecap='round' />
      <rect x='7.6' y='13.5' width='8.8' height='2.2' rx='1.1' fill='#FFC72C' stroke='#D99A00' strokeWidth='0.6' />
      <rect x='11' y='15.6' width='2' height='4.2' rx='0.6' fill='#8E4717' />
      <circle cx='12' cy='20.6' r='1.5' fill='#FFC72C' stroke='#D99A00' strokeWidth='0.6' />
    </>
  )
}

/** Espadas cruzadas (Desafíos ICA). */
export function SwordsIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <g transform='translate(12 12) scale(0.92) rotate(-42) translate(-12 -12)'>
        <Sword />
      </g>
      <g transform='translate(12 12) scale(0.92) rotate(42) translate(-12 -12)'>
        <Sword />
      </g>
    </svg>
  )
}

/** Cubito de hielo (CongeladICA). */
export function IceCubeIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <g strokeLinejoin='round' strokeWidth='1.6'>
        <path d='M12 2.6 20.4 7 12 11.4 3.6 7z' fill='#E0F2FE' stroke='#E0F2FE' />
        <path d='M3.6 7 12 11.4v9.9L3.6 16.9z' fill='#7DD3FC' stroke='#7DD3FC' />
        <path d='M20.4 7 12 11.4v9.9l8.4-4.4z' fill='#38BDF8' stroke='#38BDF8' />
      </g>
      <path d='M8.2 6.4 11 5' stroke='#ffffff' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M5.8 10v3.4' stroke='#E0F2FE' strokeWidth='1.3' strokeLinecap='round' />
    </svg>
  )
}

/** Dos tarjetas (Flashcards). */
export function CardsIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <rect x='3.4' y='3.2' width='11.6' height='15.6' rx='2.6' fill='#93C5FD' transform='rotate(-9 9.2 11)' />
      <rect x='8.2' y='5' width='12' height='16' rx='2.6' fill='#2563EB' transform='rotate(6 14.2 13)' />
      <rect x='8.2' y='4.4' width='12' height='16' rx='2.6' fill='#3B82F6' transform='rotate(6 14.2 13)' />
      <g transform='rotate(6 14.2 13)' stroke='#ffffff' strokeLinecap='round'>
        <path d='M11 9h6.4' strokeWidth='1.6' />
        <path d='M11 12.4h4.4' strokeWidth='1.6' opacity='0.75' />
      </g>
    </svg>
  )
}

/** Micrófono (PreguntICA). */
export function MicGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M5.8 11a6.2 6.2 0 0 0 12.4 0' fill='none' stroke='#6D28D9' strokeWidth='1.9' strokeLinecap='round' />
      <path d='M12 17.4v3.2M8.6 21.2h6.8' stroke='#6D28D9' strokeWidth='1.9' strokeLinecap='round' />
      <rect x='8.4' y='2.2' width='7.2' height='12.6' rx='3.6' fill='#8B5CF6' />
      <rect x='9.9' y='4.2' width='1.7' height='5.6' rx='0.85' fill='#C4B5FD' />
      <path d='M8.4 8.6h7.2' stroke='#7C3AED' strokeWidth='0.9' />
    </svg>
  )
}

/** Diana con dardo (Nota desafiante, coaching). */
export function TargetGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <circle cx='11' cy='13' r='9.6' fill='#F0445E' />
      <circle cx='11' cy='13' r='6.8' fill='#ffffff' />
      <circle cx='11' cy='13' r='4.2' fill='#F0445E' />
      <circle cx='11' cy='13' r='1.7' fill='#ffffff' />
      <path d='M11 13 19.4 4.6' stroke='#334155' strokeWidth='1.7' strokeLinecap='round' />
      <path d='M18 3.4 19.4 4.6l1.2 1.4 1.8-.3-.3-1.8L20.7 2.5l-1.8.2z' fill='#FFC72C' stroke='#D99A00' strokeWidth='0.6' strokeLinejoin='round' />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Modos de Desafíos ICA (mismo estilo que los dibujos de Juegos ICA: planos, a dos tonos)
// ---------------------------------------------------------------------------

/** Libro abierto (Lectura). */
export function BookGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M12 6.4C9.7 4.8 6.5 4.3 2.6 4.7v13.6c3.9-.4 7.1.1 9.4 1.7z' fill='#93C5FD' />
      <path d='M12 6.4c2.3-1.6 5.5-2.1 9.4-1.7v13.6c-3.9-.4-7.1.1-9.4 1.7z' fill='#3B82F6' />
      <path d='M12 6.4V20' stroke='#1D4ED8' strokeWidth='1.3' strokeLinecap='round' />
      <g stroke='#ffffff' strokeWidth='1.5' strokeLinecap='round'>
        <path d='M14.4 9.3c1.5-.6 3-.8 4.6-.7' />
        <path d='M14.4 12.4c1.5-.6 3-.8 4.6-.7' opacity='0.75' />
      </g>
      <g stroke='#2563EB' strokeWidth='1.5' strokeLinecap='round' opacity='0.55'>
        <path d='M9.6 9.3c-1.5-.6-3-.8-4.6-.7' />
        <path d='M9.6 12.4c-1.5-.6-3-.8-4.6-.7' />
      </g>
    </svg>
  )
}

/** Lápiz escribiendo (Escritura). */
export function PencilGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M3.4 21h10.4' stroke='#C4B5FD' strokeWidth='1.9' strokeLinecap='round' />
      <g transform='rotate(40 12 11)'>
        <rect x='9.4' y='0.6' width='5.2' height='14.4' rx='1.3' fill='#8B5CF6' />
        <rect x='10.3' y='3.8' width='1.3' height='10.4' rx='0.65' fill='#C4B5FD' />
        <rect x='9.4' y='0.6' width='5.2' height='2.6' rx='1.3' fill='#F9A8D4' />
        <rect x='9.4' y='2.9' width='5.2' height='1.3' fill='#E5E7EB' />
        <path d='M9.4 15 12 20.4 14.6 15z' fill='#FDE68A' />
        <path d='M11.1 18.5 12 20.4l.9-1.9z' fill='#4C1D95' />
      </g>
    </svg>
  )
}

/** Cascos (Escucha). */
export function HeadphonesGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M4.4 14.2V12a7.6 7.6 0 0 1 15.2 0v2.2' fill='none' stroke='#059669' strokeWidth='2.2' strokeLinecap='round' />
      <rect x='2.8' y='12.6' width='5.4' height='8.2' rx='2.4' fill='#10B981' />
      <rect x='15.8' y='12.6' width='5.4' height='8.2' rx='2.4' fill='#10B981' />
      <rect x='4.2' y='14' width='1.5' height='5.2' rx='0.75' fill='#A7F3D0' />
      <rect x='17.2' y='14' width='1.5' height='5.2' rx='0.75' fill='#A7F3D0' />
    </svg>
  )
}

/** Bocadillo con voz (Habla). */
export function SpeechGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M5.6 3.4h12.8a3.2 3.2 0 0 1 3.2 3.2v7.6a3.2 3.2 0 0 1-3.2 3.2H11l-4.6 3.6v-3.6h-.8a3.2 3.2 0 0 1-3.2-3.2V6.6a3.2 3.2 0 0 1 3.2-3.2z' fill='#FB7185' />
      <path d='M3.4 14.4V6.6a3.2 3.2 0 0 1 2.2-3' fill='none' stroke='#FECDD3' strokeWidth='1.2' strokeLinecap='round' opacity='0.8' />
      <g stroke='#ffffff' strokeWidth='1.7' strokeLinecap='round'>
        <path d='M8.2 9.2v2.4' />
        <path d='M10.6 7.6v5.6' />
        <path d='M13 8.6v3.6' />
        <path d='M15.4 7.2v6.4' />
        <path d='M17.6 9.4v2' />
      </g>
    </svg>
  )
}

/** Dos tarjetas unidas (Parejas). */
export function PairsGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <rect x='1.8' y='4.6' width='8.8' height='12' rx='2.2' fill='#FCD34D' transform='rotate(-8 6.2 10.6)' />
      <rect x='13.4' y='7.4' width='8.8' height='12' rx='2.2' fill='#F59E0B' transform='rotate(8 17.8 13.4)' />
      <path d='M8.6 11.2c2.2-1.6 4.6-.2 6.8 1.6' fill='none' stroke='#B45309' strokeWidth='1.6' strokeLinecap='round' strokeDasharray='0.1 2.6' />
      <circle cx='8.4' cy='11.3' r='1.5' fill='#B45309' />
      <circle cx='15.6' cy='12.9' r='1.5' fill='#B45309' />
      <path d='M4.4 8.4h3.4' stroke='#ffffff' strokeWidth='1.4' strokeLinecap='round' transform='rotate(-8 6.2 10.6)' />
      <path d='M16 17.4h3.4' stroke='#ffffff' strokeWidth='1.4' strokeLinecap='round' transform='rotate(8 17.8 13.4)' />
    </svg>
  )
}

/** Reloj de arena (Próximamente). */
export function HourglassGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M7 4.6h10c0 4-2.4 5.6-4 7.4 1.6 1.8 4 3.4 4 7.4H7c0-4 2.4-5.6 4-7.4-1.6-1.8-4-3.4-4-7.4z' fill='#E2E8F0' />
      <path d='M9.4 17.8c.6-1.8 1.6-2.8 2.6-3.6 1 .8 2 1.8 2.6 3.6z' fill='#94A3B8' />
      <path d='M10 8.2h4c-.6 1.2-1.2 1.8-2 2.6-.8-.8-1.4-1.4-2-2.6z' fill='#94A3B8' />
      <rect x='5.4' y='2.6' width='13.2' height='2.2' rx='1.1' fill='#64748B' />
      <rect x='5.4' y='19.2' width='13.2' height='2.2' rx='1.1' fill='#64748B' />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Tienda de ICA Coins (mismo estilo que el desafío extra)
// ---------------------------------------------------------------------------

const PHASE_TILE: Record<'I' | 'C' | 'A', { fill: string; edge: string }> = {
  I: { fill: 'var(--ica-i)', edge: 'var(--ica-i-edge)' },
  C: { fill: 'var(--ica-c)', edge: 'var(--ica-c-edge)' },
  A: { fill: 'var(--ica-a)', edge: 'var(--ica-a-edge)' },
}

/** Ficha de una fase (I, C o A) con un rayo: «Ampliar» esa fase solo hoy. */
export function PhaseBoostGlyph({ letter, size = 24, className }: IconProps & { letter: 'I' | 'C' | 'A' }) {
  const tile = PHASE_TILE[letter]
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <rect x='1.4' y='3.4' width='16.8' height='16.8' rx='4.6' style={{ fill: tile.edge }} />
      <rect x='1.4' y='1.8' width='16.8' height='16.8' rx='4.6' style={{ fill: tile.fill }} />
      <text
        x='9.8'
        y='14.9'
        textAnchor='middle'
        fontFamily='Nunito, "Nunito Sans", system-ui, sans-serif'
        fontWeight={900}
        fontSize='12.4'
        fill='#ffffff'
      >
        {letter}
      </text>
      <path d='M18.6 8.6 13.2 15.8h3.6l-1.4 6.2 5.8-8.2h-3.7l1.6-5.2z' fill='#FFC72C' stroke='#D99A00' strokeWidth='0.9' strokeLinejoin='round' />
    </svg>
  )
}

/** Micrófono de PreguntICA con un «+» (Intento extra de PreguntICA). */
export function PregunticaExtraGlyph({ size = 24, className }: IconProps) {
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      <path d='M4.4 10.6a5.8 5.8 0 0 0 11.6 0' fill='none' stroke='#6D28D9' strokeWidth='1.9' strokeLinecap='round' />
      <path d='M10.2 16.6v3.4M7 20.6h6.4' stroke='#6D28D9' strokeWidth='1.9' strokeLinecap='round' />
      <rect x='6.8' y='1.8' width='6.8' height='12' rx='3.4' fill='#8B5CF6' />
      <rect x='8.2' y='3.7' width='1.6' height='5.3' rx='0.8' fill='#C4B5FD' />
      <path d='M6.8 8h6.8' stroke='#7C3AED' strokeWidth='0.9' />
      <circle cx='18.2' cy='17.4' r='4.6' fill='#10B981' stroke='#ffffff' strokeWidth='1.4' />
      <path d='M18.2 15v4.8M15.8 17.4h4.8' stroke='#ffffff' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  )
}
