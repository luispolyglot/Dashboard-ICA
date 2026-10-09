import { SwordsIcon, TargetGlyph } from '../../game/icons'

/**
 * Globito de aviso de Desafíos ICA (número con pulso), para poner encima de un icono.
 */
export function ChallengeAlertBadge({ count, title }: { count: number; title: string }) {
  if (count <= 0) return null
  return (
    <span className='pointer-events-none absolute -right-2 -top-1.5 inline-flex' aria-label={title}>
      {/* Red, like a notification, so it stands out on the menu (Luis, 8 Oct). */}
      <span className='ica-alert-ping absolute inline-flex h-full w-full rounded-full bg-rose-500' />
      <span className='relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-background'>
        {count > 9 ? '9+' : count}
      </span>
    </span>
  )
}

/**
 * Dot on «Juegos» when something waits there that is not a Desafío ICA (those have the number):
 * a nota desafiante to play or a PreguntICA ready (Luis, 8 Oct).
 */
export function GamesWaitingDot({ label, className = 'absolute -right-1 -top-1' }: { label: string; className?: string }) {
  return (
    <span className={`pointer-events-none inline-flex size-2.5 ${className}`} aria-label={label}>
      {/* A small dot that keeps pulsing, so it is clear something is waiting (Luis, 8 Oct). */}
      <span className='ica-dot-ping absolute inline-flex h-full w-full rounded-full bg-rose-500' />
      <span className='ica-alert-beat relative inline-flex size-2.5 rounded-full bg-rose-500 ring-[1.5px] ring-background' />
    </span>
  )
}

/** Etiqueta para las tarjetas (Juegos ICA en Inicio y la tarjeta de Desafíos ICA). */
export function ChallengeAlertPill({ text }: { text: string }) {
  if (!text) return null
  return (
    <span
      className='inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1 text-[11px] font-extrabold text-white'
      style={{ background: 'var(--ica-a)', boxShadow: '0 2px 0 var(--ica-a-edge)' }}
    >
      <span className='flex size-5 items-center justify-center rounded-full bg-white'>
        <SwordsIcon size={15} />
      </span>
      {text}
    </span>
  )
}

/** Reminder on the Nota desafiante card: finished notes whose challenge is still to be played. */
export function ChallengeNotePill({ count, text }: { count: number; text?: string }) {
  return (
    <span
      className='inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1 text-[11px] font-extrabold'
      style={{ background: 'var(--ica-gold)', color: '#5a3b00', boxShadow: '0 2px 0 var(--ica-gold-edge)' }}
    >
      <span className='flex size-5 items-center justify-center rounded-full bg-white'>
        <TargetGlyph size={14} />
      </span>
      {text ?? count}
    </span>
  )
}
