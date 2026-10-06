import { useState, type ReactNode } from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

const STORAGE_PREFIX = 'icademy:tip-seen:'

function readSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + id) === '1'
  } catch {
    return false
  }
}

export function markTipSeen(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, '1')
  } catch {
    // Without storage the tip may show again next time; harmless.
  }
}

/**
 * Whether a first-use tip is still pending, plus a way to close it for good.
 * The tip is shown once per browser (Luis, 6 Oct: help text in bubbles instead of fixed lines).
 */
export function useFirstUseTip(id: string): [boolean, () => void] {
  const [pending, setPending] = useState(() => typeof window !== 'undefined' && !readSeen(id))
  const close = () => {
    markTipSeen(id)
    setPending(false)
  }
  return [pending, close]
}

/**
 * Small speech bubble that floats above its anchor (the parent must be `relative`), with an
 * arrow pointing down at it. It takes no room in the layout, so the screen still fits.
 */
export function FirstUseTip({
  children,
  onClose,
  className,
  align = 'start',
}: {
  children: ReactNode
  onClose: () => void
  className?: string
  /** `center`: centred over its anchor (a round button), arrow in the middle. */
  align?: 'start' | 'center'
}) {
  return (
    <div
      role='note'
      className={cn(
        'ica-pop absolute bottom-full z-20 mb-2 flex max-w-[min(20rem,calc(100vw-2rem))] items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug font-bold text-white shadow-lg',
        align === 'center' ? 'left-1/2 w-max -translate-x-1/2' : 'left-0',
        className,
      )}
      style={{ background: 'var(--ica-i-ink)' }}
    >
      <span className='min-w-0 flex-1'>{children}</span>
      <button
        type='button'
        onClick={onClose}
        aria-label={t('Entendido')}
        className='-mt-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white'
      >
        <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
      </button>
      <span
        className={cn(
          'absolute top-full size-0 border-x-8 border-t-8 border-x-transparent',
          align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-6',
        )}
        style={{ borderTopColor: 'var(--ica-i-ink)' }}
        aria-hidden='true'
      />
    </div>
  )
}
