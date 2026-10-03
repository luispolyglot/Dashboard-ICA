/**
 * Globito de aviso de Desafíos ICA (número con pulso), para poner encima de un icono.
 */
export function ChallengeAlertBadge({ count, title }: { count: number; title: string }) {
  if (count <= 0) return null
  return (
    <span className='pointer-events-none absolute -right-2 -top-1.5 inline-flex' title={title} aria-label={title}>
      <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60' />
      <span className='relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background'>
        {count > 9 ? '9+' : count}
      </span>
    </span>
  )
}

/** Etiqueta para las tarjetas (Juegos ICA en Inicio y la tarjeta de Desafíos ICA). */
export function ChallengeAlertPill({ text }: { text: string }) {
  if (!text) return null
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_6px_18px_-6px_rgba(244,63,94,0.8)]'>
      <span className='relative inline-flex h-1.5 w-1.5'>
        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75' />
        <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-white' />
      </span>
      ⚔️ {text}
    </span>
  )
}
