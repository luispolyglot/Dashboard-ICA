import { AudioLinesIcon } from 'lucide-react'

type PendingReviewDotProps = {
  title: string
  useIconSpeaker?: boolean
}

/**
 * Aviso pequeño de "tienes algo pendiente".
 * - Normal: un punto dorado con una onda suave.
 * - Con altavoz: una pastillita dorada con ondas de audio (alguien te ha mandado su nota maestra).
 */
export function PendingReviewDot({ title, useIconSpeaker = false }: PendingReviewDotProps) {
  if (useIconSpeaker) {
    return (
      <span
        className='relative inline-flex size-[22px] shrink-0 items-center justify-center'
        aria-label={title}
        role='img'
      >
        <span
          className='ica-streak-ring absolute inset-0 rounded-[9px] border-2'
          style={{ borderColor: 'var(--ica-gold)' }}
          aria-hidden='true'
        />
        <span
          className='relative inline-flex size-[22px] items-center justify-center rounded-[9px] border-2 border-background'
          style={{ background: 'var(--ica-gold)', boxShadow: '0 2px 0 var(--ica-gold-edge)' }}
        >
          <AudioLinesIcon className='size-3' strokeWidth={3} style={{ color: '#4a3200' }} aria-hidden='true' />
        </span>
      </span>
    )
  }

  return (
    <span className='relative inline-flex size-3 shrink-0' aria-label={title} role='img'>
      <span
        className='ica-streak-ring absolute inset-0 rounded-full border-2'
        style={{ borderColor: 'var(--ica-gold)' }}
        aria-hidden='true'
      />
      <span
        className='relative inline-flex size-3 rounded-full border-2 border-background'
        style={{ background: 'var(--ica-gold)' }}
      />
    </span>
  )
}
