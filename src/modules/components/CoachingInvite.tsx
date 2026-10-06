import { useState } from 'react'
import { ArrowRightIcon, GraduationCapIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

/** Formulario de entrada al Coaching ICA. */
export const COACHING_FORM_URL = 'https://tally.so/r/nWGeaR'

const HIDDEN_KEY = 'icademy:coaching-invite-small'

/**
 * Whether the student closed the big coaching card (Luis, 6 Oct). It is not removed: it moves to
 * the end of the profile, smaller.
 */
export function useCoachingInviteSmall(): [boolean, () => void] {
  const [small, setSmall] = useState(() => {
    try {
      return window.localStorage.getItem(HIDDEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const makeSmall = () => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, '1')
    } catch {
      // Without storage it only lasts this visit.
    }
    setSmall(true)
  }
  return [small, makeSmall]
}

const CARD_BACKGROUND =
  'radial-gradient(120% 120% at 100% 0%, rgb(236 72 153 / 0.4), transparent 55%), linear-gradient(135deg, #1d4ed8 0%, #6d28d9 60%, #9d174d 100%)'

function MoreButton({ className }: { className?: string }) {
  return (
    <a
      href={COACHING_FORM_URL}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'ica-press inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-black text-[#4c1d95] shadow-[0_3px_0_rgb(0_0_0/0.25)]',
        className,
      )}
    >
      {t('Quiero saber más')}
      <ArrowRightIcon className='size-3.5' strokeWidth={3} aria-hidden='true' />
    </a>
  )
}

/**
 * Tarjeta para quien todavía no está en el Coaching ICA. «Quiero saber más» abre el
 * formulario de entrada (Tally) en una pestaña nueva.
 * - `onDismiss`: shows an X; closing it moves the card to the end of the profile.
 * - `compact`: that small version, one line and no description.
 */
export function CoachingInviteCard({
  preview = false,
  onDismiss,
  compact = false,
}: {
  preview?: boolean
  onDismiss?: () => void
  compact?: boolean
}) {
  if (compact) {
    return (
      <div
        className='flex items-center gap-2.5 overflow-hidden rounded-2xl px-3 py-2.5 text-white shadow-[0_3px_0_#1e1b4b]'
        style={{ background: CARD_BACKGROUND }}
      >
        <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15' aria-hidden='true'>
          <GraduationCapIcon className='size-4' strokeWidth={2.4} />
        </span>
        <span className='min-w-0 flex-1 text-[13px] leading-tight font-black'>{t('Habla con soltura en 70 días')}</span>
        <MoreButton />
      </div>
    )
  }

  return (
    <>
      {preview ? (
        <p className='m-0 mb-2 rounded-2xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground'>
          {t('Vista previa (solo admin): así ven esta tarjeta quienes no están en el coaching.')}
        </p>
      ) : null}
      <div
        className='relative flex items-start gap-3 overflow-hidden rounded-[22px] p-3.5 text-white shadow-[0_4px_0_#1e1b4b]'
        style={{ background: CARD_BACKGROUND }}
      >
        {onDismiss ? (
          <button
            type='button'
            onClick={onDismiss}
            aria-label={t('No me interesa ahora')}
            className='absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white'
          >
            <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
          </button>
        ) : null}
        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15' aria-hidden='true'>
          <GraduationCapIcon className='size-5' strokeWidth={2.4} />
        </span>
        <span className='flex min-w-0 flex-1 flex-col items-start pr-6'>
          <span className='text-[10px] font-black tracking-[0.1em] text-white/75 uppercase'>{t('Coaching ICA')}</span>
          <span className='text-[16px] leading-tight font-black'>{t('Habla con soltura en 70 días')}</span>
          <span className='mt-0.5 text-xs font-semibold text-white/85'>
            {t('Programa intensivo y personalizado con Luis y su equipo.')}
          </span>
          <MoreButton className='mt-2.5' />
        </span>
      </div>
    </>
  )
}
